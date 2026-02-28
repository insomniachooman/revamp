import type { RecordingEvent, ZoomSegment } from "@revamp/core-types";

export type AutoZoomOptions = {
  includeClicks: boolean;
  includeTyping: boolean;
  includeFocus: boolean;
  defaultZoomLevel: number;
  segmentMs: number;
  mergeGapMs: number;
};

export const defaultAutoZoomOptions: AutoZoomOptions = {
  includeClicks: true,
  includeTyping: true,
  includeFocus: true,
  defaultZoomLevel: 1.8,
  segmentMs: 1500,
  mergeGapMs: 280
};

function shouldUseEvent(event: RecordingEvent, options: AutoZoomOptions): boolean {
  if (event.kind === "click") return options.includeClicks;
  if (event.kind === "typing") return options.includeTyping;
  if (event.kind === "focus") return options.includeFocus;
  return false;
}

function toSignal(kind: RecordingEvent["kind"]): ZoomSegment["sourceSignal"] {
  if (kind === "click") return "click";
  if (kind === "typing") return "typing";
  return "focus";
}

export function buildAutoZooms(
  events: RecordingEvent[],
  durationMs: number,
  options: Partial<AutoZoomOptions> = {}
): ZoomSegment[] {
  const mergedOptions = { ...defaultAutoZoomOptions, ...options };
  const sorted = [...events].sort((a, b) => a.atMs - b.atMs);

  const raw = sorted
    .filter((event) => shouldUseEvent(event, mergedOptions))
    .map<ZoomSegment>((event) => {
      const xNorm = event.xNorm ?? 0.5;
      const yNorm = event.yNorm ?? 0.5;
      return {
        id: crypto.randomUUID(),
        startMs: Math.max(0, event.atMs - 120),
        endMs: Math.min(durationMs, event.atMs + mergedOptions.segmentMs),
        level: mergedOptions.defaultZoomLevel,
        mode: "auto",
        manualTarget: { xNorm, yNorm },
        instant: false,
        disabled: false,
        sourceSignal: toSignal(event.kind)
      };
    });

  if (raw.length < 2) {
    return raw;
  }

  const merged: ZoomSegment[] = [];
  for (const segment of raw) {
    const last = merged[merged.length - 1];
    if (!last) {
      merged.push(segment);
      continue;
    }

    const sameSignal = last.sourceSignal === segment.sourceSignal;
    const closeEnough = segment.startMs - last.endMs <= mergedOptions.mergeGapMs;

    if (sameSignal && closeEnough) {
      last.endMs = Math.max(last.endMs, segment.endMs);
      if (segment.manualTarget) {
        last.manualTarget = segment.manualTarget;
      }
      continue;
    }

    merged.push(segment);
  }

  return merged;
}

export type CursorPathPoint = {
  tMs: number;
  xNorm: number;
  yNorm: number;
};

export function smoothCursorPath(points: CursorPathPoint[], smoothing = 0.22): CursorPathPoint[] {
  if (points.length < 3) {
    return points;
  }

  const result: CursorPathPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = result[result.length - 1];
    const curr = points[i];
    result.push({
      ...curr,
      xNorm: prev.xNorm + (curr.xNorm - prev.xNorm) * (1 - smoothing),
      yNorm: prev.yNorm + (curr.yNorm - prev.yNorm) * (1 - smoothing)
    });
  }

  result.push(points[points.length - 1]);
  return result;
}

export function removeCursorShakes(points: CursorPathPoint[], threshold = 0.002): CursorPathPoint[] {
  if (points.length < 2) {
    return points;
  }

  const output: CursorPathPoint[] = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const prev = output[output.length - 1];
    const curr = points[i];
    const dx = Math.abs(curr.xNorm - prev.xNorm);
    const dy = Math.abs(curr.yNorm - prev.yNorm);
    if (dx >= threshold || dy >= threshold) {
      output.push(curr);
    }
  }

  return output;
}
