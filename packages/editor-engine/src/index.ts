import type { ProjectFileV1, ZoomSegment } from "@revamp/core-types";

export type ViewTransform = {
  scale: number;
  xPx: number;
  yPx: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeRange(startMs: number, endMs: number): { startMs: number; endMs: number } {
  if (startMs <= endMs) {
    return { startMs, endMs };
  }
  return { startMs: endMs, endMs: startMs };
}

export function sortByStart<T extends { startMs: number }>(segments: T[]): T[] {
  return [...segments].sort((a, b) => a.startMs - b.startMs);
}

export function getZoomAtTime(zooms: ZoomSegment[], atMs: number): ZoomSegment | undefined {
  return zooms.find((zoom) => !zoom.disabled && zoom.startMs <= atMs && atMs <= zoom.endMs);
}

export function computeViewTransform(
  zoom: ZoomSegment | undefined,
  frameWidth: number,
  frameHeight: number
): ViewTransform {
  if (!zoom) {
    return { scale: 1, xPx: 0, yPx: 0 };
  }

  const scale = clamp(zoom.level, 1, 4);
  const target = zoom.manualTarget ?? { xNorm: 0.5, yNorm: 0.5 };
  const targetXPx = target.xNorm * frameWidth;
  const targetYPx = target.yNorm * frameHeight;
  const viewportWidth = frameWidth / scale;
  const viewportHeight = frameHeight / scale;

  const xPx = clamp(targetXPx - viewportWidth / 2, 0, frameWidth - viewportWidth);
  const yPx = clamp(targetYPx - viewportHeight / 2, 0, frameHeight - viewportHeight);

  return { scale, xPx, yPx };
}

export function createInstantZoom(startMs: number, level: number, xNorm = 0.5, yNorm = 0.5): ZoomSegment {
  return {
    id: crypto.randomUUID(),
    startMs,
    endMs: startMs + 800,
    level: clamp(level, 1, 4),
    mode: "manual",
    manualTarget: { xNorm: clamp(xNorm, 0, 1), yNorm: clamp(yNorm, 0, 1) },
    instant: true,
    disabled: false,
    sourceSignal: "click"
  };
}

export function updateProjectDuration(project: ProjectFileV1, durationMs: number): ProjectFileV1 {
  return {
    ...project,
    meta: {
      ...project.meta,
      durationMs: Math.max(1, Math.round(durationMs)),
      updatedAt: new Date().toISOString()
    }
  };
}

export function computeSnappedTime(px: number, pixelsPerSecond: number, snapMs = 100): number {
  const rawMs = (px / pixelsPerSecond) * 1000;
  return Math.round(rawMs / snapMs) * snapMs;
}

export function cropDurationByCuts(durationMs: number, cuts: Array<{ startMs: number; endMs: number }>): number {
  const removedMs = cuts.reduce((acc, cut) => acc + Math.max(0, cut.endMs - cut.startMs), 0);
  return Math.max(1, durationMs - removedMs);
}
