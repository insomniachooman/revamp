import { useRef } from "react";

type TrackSegment = {
  id: string;
  startMs: number;
  endMs: number;
  label: string;
  disabled: boolean;
};

type TimelineTrackProps = {
  title: string;
  durationMs: number;
  currentMs: number;
  segments: TrackSegment[];
  colorClass: string;
  selectedId: string | null;
  onSeek: (nextMs: number) => void;
  onSelect: (id: string) => void;
  onDragBoundary: (id: string, edge: "start" | "end", nextMs: number) => void;
};

export function TimelineTrack({
  title,
  durationMs,
  currentMs,
  segments,
  colorClass,
  selectedId,
  onSeek,
  onSelect,
  onDragBoundary
}: TimelineTrackProps) {
  const rowRef = useRef<HTMLDivElement | null>(null);

  const toPercent = (valueMs: number) => `${Math.max(0, Math.min(100, (valueMs / durationMs) * 100))}%`;

  const toMs = (clientX: number): number => {
    if (!rowRef.current) return 0;
    const rect = rowRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * durationMs;
  };

  return (
    <div className="timeline-track">
      <div className="timeline-track-head">
        <strong>{title}</strong>
      </div>
      <div
        className="timeline-track-row"
        ref={rowRef}
        onClick={(event) => {
          if ((event.target as HTMLElement).dataset.edge) return;
          onSeek(toMs(event.clientX));
        }}
      >
        {segments.map((segment) => (
          <button
            type="button"
            key={segment.id}
            className={`segment-block ${colorClass} ${segment.disabled ? "disabled" : ""} ${selectedId === segment.id ? "selected" : ""}`}
            style={{
              left: toPercent(segment.startMs),
              width: toPercent(segment.endMs - segment.startMs)
            }}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(segment.id);
            }}
          >
            <span
              data-edge="start"
              className="segment-edge"
              onPointerDown={(event) => {
                event.stopPropagation();
                const onMove = (moveEvent: PointerEvent) => {
                  onDragBoundary(segment.id, "start", toMs(moveEvent.clientX));
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            />
            <span>{segment.label}</span>
            <span
              data-edge="end"
              className="segment-edge"
              onPointerDown={(event) => {
                event.stopPropagation();
                const onMove = (moveEvent: PointerEvent) => {
                  onDragBoundary(segment.id, "end", toMs(moveEvent.clientX));
                };
                const onUp = () => {
                  window.removeEventListener("pointermove", onMove);
                  window.removeEventListener("pointerup", onUp);
                };
                window.addEventListener("pointermove", onMove);
                window.addEventListener("pointerup", onUp);
              }}
            />
          </button>
        ))}
        <div className="playhead" style={{ left: toPercent(currentMs) }} />
      </div>
    </div>
  );
}

