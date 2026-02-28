import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  AppSettings,
  BackgroundSettings,
  ProjectFileV1,
  RecordingEvent,
  SpeedSegment,
  StylePreset,
  ZoomSegment
} from "@revamp/core-types";
import { computeViewTransform } from "@revamp/editor-engine";
import { buildAutoZooms } from "@revamp/recording-engine";
import { Panel } from "../components/Panel";
import { TimelineTrack } from "../components/TimelineTrack";
import { CommandPalette } from "../components/CommandPalette";
import { formatDurationMs } from "../utils/format";

function percent(value: number): string {
  return `${(value * 100).toFixed(4)}%`;
}

function createManualZoom(atMs: number): ZoomSegment {
  return {
    id: crypto.randomUUID(),
    startMs: Math.max(0, atMs),
    endMs: Math.max(500, atMs + 1400),
    level: 1.8,
    mode: "manual",
    manualTarget: { xNorm: 0.5, yNorm: 0.5 },
    instant: false,
    disabled: false
  };
}

function createInstantZoom(atMs: number): ZoomSegment {
  return {
    ...createManualZoom(atMs),
    endMs: atMs + 800,
    instant: true
  };
}

function createSpeedSegment(atMs: number): SpeedSegment {
  return {
    id: crypto.randomUUID(),
    startMs: atMs,
    endMs: atMs + 1800,
    rate: 1.5,
    disableSmoothMouseMovement: false
  };
}

function applyBackgroundStyle(settings: BackgroundSettings): React.CSSProperties {
  if (settings.type === "none") {
    return { background: "#101727" };
  }
  if (settings.type === "color") {
    return { background: settings.color };
  }
  if (settings.type === "gradient") {
    return { background: `linear-gradient(135deg, ${settings.gradientFrom}, ${settings.gradientTo})` };
  }
  if (settings.type === "image" && settings.imagePath) {
    const src = settings.imagePath.startsWith("file://") ? settings.imagePath : `file:///${settings.imagePath.replace(/\\/g, "/")}`;
    return {
      backgroundImage: `url('${src}')`,
      backgroundSize: "cover",
      backgroundPosition: "center"
    };
  }
  return {
    background: "linear-gradient(145deg,#1f2937,#0f172a)"
  };
}

export function StudioPage() {
  type LoadedProject = {
    project: ProjectFileV1;
    projectId: string;
    directory: string;
    media: {
      screenTrackPath: string;
      screenTrackUrl: string;
      eventTrackPath?: string;
    };
  };
  const { projectId = "" } = useParams();
  const [project, setProject] = useState<ProjectFileV1 | null>(null);
  const [screenTrackUrl, setScreenTrackUrl] = useState("");
  const [currentMs, setCurrentMs] = useState(0);
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const [selectedSpeedId, setSelectedSpeedId] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"zoom" | "background" | "cursor" | "audio" | "export" | "presets">("zoom");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [renderStatus, setRenderStatus] = useState<{ state: "idle" | "running" | "done" | "error"; text: string }>({
    state: "idle",
    text: ""
  });
  const [renderProgress, setRenderProgress] = useState(0);

  const previewVideoRef = useRef<HTMLVideoElement | null>(null);

  const openProjectQuery = useQuery<LoadedProject>({
    queryKey: ["project", projectId],
    enabled: Boolean(projectId),
    queryFn: () => window.revamp.project.open(projectId)
  });

  const eventsQuery = useQuery<RecordingEvent[]>({
    queryKey: ["project-events", projectId],
    enabled: Boolean(projectId),
    queryFn: () => window.revamp.project.readEvents(projectId)
  });

  const settingsQuery = useQuery<AppSettings>({
    queryKey: ["settings"],
    queryFn: () => window.revamp.settings.load()
  });

  useEffect(() => {
    if (openProjectQuery.data) {
      setProject(openProjectQuery.data.project);
      setScreenTrackUrl(openProjectQuery.data.media.screenTrackUrl);
    }
  }, [openProjectQuery.data]);

  useEffect(() => {
    const detach = window.revamp.render.onProgress((payload: { projectId: string; ratio: number; rawLine: string }) => {
      if (payload.projectId !== projectId) return;
      setRenderProgress(payload.ratio);
      setRenderStatus({
        state: "running",
        text: payload.rawLine
      });
    });
    return detach;
  }, [projectId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (nextProject: ProjectFileV1) => window.revamp.project.save(nextProject),
    onSuccess: (saved) => setProject(saved)
  });

  useEffect(() => {
    if (!project) return;
    const timer = window.setTimeout(() => {
      void saveMutation.mutateAsync(project);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [project]);

  const selectedZoom = useMemo(() => {
    if (!project || !selectedZoomId) return undefined;
    return project.timeline.zooms.find((zoom) => zoom.id === selectedZoomId);
  }, [project, selectedZoomId]);

  const selectedSpeed = useMemo(() => {
    if (!project || !selectedSpeedId) return undefined;
    return project.timeline.speed.find((segment) => segment.id === selectedSpeedId);
  }, [project, selectedSpeedId]);

  const activeZoom = useMemo(() => {
    if (!project) return undefined;
    return project.timeline.zooms.find((zoom) => !zoom.disabled && zoom.startMs <= currentMs && currentMs <= zoom.endMs);
  }, [project, currentMs]);

  const transform = useMemo(() => computeViewTransform(activeZoom, 1920, 1080), [activeZoom]);

  const upsertProject = (recipe: (draft: ProjectFileV1) => ProjectFileV1) => {
    setProject((current) => {
      if (!current) return current;
      return recipe(current);
    });
  };

  const zoomTrack = useMemo(() => {
    if (!project) return [];
    return project.timeline.zooms.map((segment) => ({
      id: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      label: segment.instant ? "Instant" : segment.mode === "auto" ? "Auto" : "Manual",
      disabled: Boolean(segment.disabled)
    }));
  }, [project]);

  const speedTrack = useMemo(() => {
    if (!project) return [];
    return project.timeline.speed.map((segment) => ({
      id: segment.id,
      startMs: segment.startMs,
      endMs: segment.endMs,
      label: `${segment.rate.toFixed(2)}x`,
      disabled: false
    }));
  }, [project]);

  const backgroundStyle = project ? applyBackgroundStyle(project.timeline.background) : undefined;

  const exportMutation = useMutation({
    mutationFn: async () => window.revamp.render.exportMp4(projectId),
    onMutate: () => {
      setRenderProgress(0);
      setRenderStatus({ state: "running", text: "Preparing export..." });
    },
    onSuccess: (result) => {
      setRenderStatus({ state: "done", text: `Exported to ${result.outputPath} with ${result.encoder}` });
      setRenderProgress(1);
    },
    onError: (error) => {
      setRenderStatus({ state: "error", text: String(error) });
    }
  });

  if (!project) {
    return (
      <div className="page-grid">
        <Panel title="Loading Studio" subtitle="Fetching project data from local workspace">
          <p>{openProjectQuery.isLoading ? "Loading..." : "Could not load project."}</p>
        </Panel>
      </div>
    );
  }

  const durationMs = project.meta.durationMs;

  const moveZoomBoundary = (id: string, edge: "start" | "end", nextMs: number) => {
    upsertProject((draft) => {
      const zooms = draft.timeline.zooms.map((zoom) => {
        if (zoom.id !== id) return zoom;
        if (edge === "start") {
          return { ...zoom, startMs: Math.max(0, Math.min(nextMs, zoom.endMs - 100)) };
        }
        return { ...zoom, endMs: Math.min(durationMs, Math.max(nextMs, zoom.startMs + 100)) };
      });
      return { ...draft, timeline: { ...draft.timeline, zooms } };
    });
  };

  const moveSpeedBoundary = (id: string, edge: "start" | "end", nextMs: number) => {
    upsertProject((draft) => {
      const speed = draft.timeline.speed.map((segment) => {
        if (segment.id !== id) return segment;
        if (edge === "start") {
          return { ...segment, startMs: Math.max(0, Math.min(nextMs, segment.endMs - 100)) };
        }
        return { ...segment, endMs: Math.min(durationMs, Math.max(nextMs, segment.startMs + 100)) };
      });
      return { ...draft, timeline: { ...draft.timeline, speed } };
    });
  };

  const paletteCommands = [
    {
      label: "Add Manual Zoom",
      run: () => {
        upsertProject((draft) => ({
          ...draft,
          timeline: { ...draft.timeline, zooms: [...draft.timeline.zooms, createManualZoom(currentMs)] }
        }));
      }
    },
    {
      label: "Add Instant Zoom",
      run: () => {
        upsertProject((draft) => ({
          ...draft,
          timeline: { ...draft.timeline, zooms: [...draft.timeline.zooms, createInstantZoom(currentMs)] }
        }));
      }
    },
    {
      label: "Generate Auto Zooms from Events",
      run: () => {
        const events = eventsQuery.data ?? [];
        upsertProject((draft) => ({
          ...draft,
          timeline: {
            ...draft.timeline,
            zooms: buildAutoZooms(events, durationMs, {
              includeClicks: true,
              includeTyping: true,
              includeFocus: true
            })
          }
        }));
      }
    },
    {
      label: "Add Speed Segment",
      run: () => {
        upsertProject((draft) => ({
          ...draft,
          timeline: { ...draft.timeline, speed: [...draft.timeline.speed, createSpeedSegment(currentMs)] }
        }));
      }
    },
    {
      label: "Export MP4",
      run: () => {
        void exportMutation.mutateAsync();
      }
    }
  ];

  return (
    <div className="studio-layout">
      <Panel
        title={project.meta.name}
        subtitle={`Duration ${formatDurationMs(durationMs)} • Autosave every 1s when editing`}
        rightSlot={
          <div className="toolbar-row">
            <button className="btn" onClick={() => setPaletteOpen(true)}>
              Command Menu (Ctrl+K)
            </button>
            <button className="btn btn-accent" onClick={() => exportMutation.mutateAsync()} disabled={exportMutation.isPending}>
              Export MP4
            </button>
          </div>
        }
      >
        <div className="studio-preview-wrap" style={backgroundStyle}>
          <div
            className="preview-stage"
            style={{
              padding: `${project.timeline.background.inset}px`,
              borderRadius: `${project.timeline.background.roundedCorners}px`,
              boxShadow: `0 0 ${project.timeline.background.shadow}px rgba(0,0,0,0.42)`
            }}
          >
            <div
              className="zoom-layer"
              style={{
                transform: `scale(${transform.scale}) translate(${-transform.xPx / 2}px, ${-transform.yPx / 2}px)`,
                transformOrigin: "center center"
              }}
            >
              <video
                ref={previewVideoRef}
                src={screenTrackUrl}
                controls
                className="preview-video"
                onTimeUpdate={(event) => setCurrentMs(event.currentTarget.currentTime * 1000)}
              />
            </div>
            {activeZoom?.mode === "manual" && activeZoom.manualTarget && (
              <div
                className="manual-target-dot"
                style={{ left: percent(activeZoom.manualTarget.xNorm), top: percent(activeZoom.manualTarget.yNorm) }}
              />
            )}
          </div>
        </div>

        <div className="timeline-stack">
          <TimelineTrack
            title="Zoom"
            colorClass="track-zoom"
            durationMs={durationMs}
            currentMs={currentMs}
            segments={zoomTrack}
            onSeek={setCurrentMs}
            onSelect={(id) => {
              setSelectedZoomId(id);
              setSelectedTab("zoom");
            }}
            onDragBoundary={moveZoomBoundary}
            selectedId={selectedZoomId}
          />
          <TimelineTrack
            title="Speed"
            colorClass="track-speed"
            durationMs={durationMs}
            currentMs={currentMs}
            segments={speedTrack}
            onSeek={setCurrentMs}
            onSelect={(id) => {
              setSelectedSpeedId(id);
              setSelectedTab("zoom");
            }}
            onDragBoundary={moveSpeedBoundary}
            selectedId={selectedSpeedId}
          />
          <div className="toolbar-row">
            <button
              className="btn"
              onClick={() =>
                upsertProject((draft) => ({
                  ...draft,
                  timeline: {
                    ...draft.timeline,
                    zooms: [...draft.timeline.zooms, createManualZoom(currentMs)]
                  }
                }))
              }
            >
              Add Manual Zoom
            </button>
            <button
              className="btn"
              onClick={() =>
                upsertProject((draft) => ({
                  ...draft,
                  timeline: {
                    ...draft.timeline,
                    zooms: [...draft.timeline.zooms, createInstantZoom(currentMs)]
                  }
                }))
              }
            >
              Add Instant Zoom
            </button>
            <button
              className="btn"
              onClick={() =>
                upsertProject((draft) => ({
                  ...draft,
                  timeline: {
                    ...draft.timeline,
                    speed: [...draft.timeline.speed, createSpeedSegment(currentMs)]
                  }
                }))
              }
            >
              Add Speed Segment
            </button>
            <button
              className="btn"
              onClick={() => {
                const events = eventsQuery.data ?? [];
                upsertProject((draft) => ({
                  ...draft,
                  timeline: {
                    ...draft.timeline,
                    zooms: buildAutoZooms(events, durationMs, {
                      includeClicks: true,
                      includeTyping: true,
                      includeFocus: true
                    })
                  }
                }));
              }}
            >
              Regenerate Auto Zoom
            </button>
          </div>
        </div>
      </Panel>

      <Panel title="Inspector" subtitle="Zoom, background, cursor, audio, presets, and export">
        <div className="tab-row">
          {([
            ["zoom", "Zoom"],
            ["background", "Background"],
            ["cursor", "Cursor"],
            ["audio", "Audio"],
            ["presets", "Presets"],
            ["export", "Export"]
          ] as const).map(([key, label]) => (
            <button key={key} className={`btn ${selectedTab === key ? "btn-accent" : ""}`} onClick={() => setSelectedTab(key)}>
              {label}
            </button>
          ))}
        </div>

        {selectedTab === "zoom" && (
          <div className="inspector-grid">
            {selectedZoom ? (
              <>
                <label className="field">
                  <span>Mode</span>
                  <select
                    className="text-input"
                    value={selectedZoom.mode}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id ? { ...zoom, mode: event.target.value as ZoomSegment["mode"] } : zoom
                          )
                        }
                      }))
                    }
                  >
                    <option value="auto">Auto</option>
                    <option value="manual">Manual</option>
                  </select>
                </label>
                <label className="field">
                  <span>Level</span>
                  <input
                    className="text-input"
                    type="range"
                    min={1}
                    max={4}
                    step={0.05}
                    value={selectedZoom.level}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id ? { ...zoom, level: Number(event.target.value) } : zoom
                          )
                        }
                      }))
                    }
                  />
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={selectedZoom.instant}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id ? { ...zoom, instant: event.target.checked } : zoom
                          )
                        }
                      }))
                    }
                  />
                  <span>Instant animation</span>
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={Boolean(selectedZoom.disabled)}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id ? { ...zoom, disabled: event.target.checked } : zoom
                          )
                        }
                      }))
                    }
                  />
                  <span>Disable zoom</span>
                </label>
                <label className="field">
                  <span>Manual X target</span>
                  <input
                    className="text-input"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedZoom.manualTarget?.xNorm ?? 0.5}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id
                              ? {
                                  ...zoom,
                                  manualTarget: {
                                    xNorm: Number(event.target.value),
                                    yNorm: zoom.manualTarget?.yNorm ?? 0.5
                                  }
                                }
                              : zoom
                          )
                        }
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Manual Y target</span>
                  <input
                    className="text-input"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={selectedZoom.manualTarget?.yNorm ?? 0.5}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          zooms: draft.timeline.zooms.map((zoom) =>
                            zoom.id === selectedZoom.id
                              ? {
                                  ...zoom,
                                  manualTarget: {
                                    xNorm: zoom.manualTarget?.xNorm ?? 0.5,
                                    yNorm: Number(event.target.value)
                                  }
                                }
                              : zoom
                          )
                        }
                      }))
                    }
                  />
                </label>
                <button
                  className="btn danger"
                  onClick={() =>
                    upsertProject((draft) => ({
                      ...draft,
                      timeline: {
                        ...draft.timeline,
                        zooms: draft.timeline.zooms.filter((zoom) => zoom.id !== selectedZoom.id)
                      }
                    }))
                  }
                >
                  Remove Zoom
                </button>
              </>
            ) : selectedSpeed ? (
              <>
                <p className="tiny-note">Editing speed segment {selectedSpeed.rate.toFixed(2)}x</p>
                <label className="field">
                  <span>Rate</span>
                  <input
                    className="text-input"
                    type="range"
                    min={0.25}
                    max={4}
                    step={0.05}
                    value={selectedSpeed.rate}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          speed: draft.timeline.speed.map((segment) =>
                            segment.id === selectedSpeed.id ? { ...segment, rate: Number(event.target.value) } : segment
                          )
                        }
                      }))
                    }
                  />
                </label>
                <label className="field checkbox-field">
                  <input
                    type="checkbox"
                    checked={selectedSpeed.disableSmoothMouseMovement}
                    onChange={(event) =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          speed: draft.timeline.speed.map((segment) =>
                            segment.id === selectedSpeed.id
                              ? { ...segment, disableSmoothMouseMovement: event.target.checked }
                              : segment
                          )
                        }
                      }))
                    }
                  />
                  <span>Disable smooth mouse movement in segment</span>
                </label>
              </>
            ) : (
              <p className="tiny-note">Select a zoom or speed segment in the timeline.</p>
            )}
          </div>
        )}

        {selectedTab === "background" && (
          <div className="inspector-grid">
            <label className="field">
              <span>Type</span>
              <select
                className="text-input"
                value={project.timeline.background.type}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: {
                        ...draft.timeline.background,
                        type: event.target.value as BackgroundSettings["type"]
                      }
                    }
                  }))
                }
              >
                <option value="wallpaper">Wallpaper</option>
                <option value="gradient">Gradient</option>
                <option value="color">Color</option>
                <option value="image">Image</option>
                <option value="none">None</option>
              </select>
            </label>
            <label className="field">
              <span>Gradient from</span>
              <input
                className="text-input"
                value={project.timeline.background.gradientFrom}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, gradientFrom: event.target.value }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Gradient to</span>
              <input
                className="text-input"
                value={project.timeline.background.gradientTo}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, gradientTo: event.target.value }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Color</span>
              <input
                className="text-input"
                value={project.timeline.background.color}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, color: event.target.value }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Image path</span>
              <input
                className="text-input"
                placeholder="C:\\wallpaper.jpg"
                value={project.timeline.background.imagePath ?? ""}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, imagePath: event.target.value }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Padding</span>
              <input
                className="text-input"
                type="range"
                min={0}
                max={220}
                step={2}
                value={project.timeline.background.padding}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, padding: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Rounded corners</span>
              <input
                className="text-input"
                type="range"
                min={0}
                max={64}
                step={1}
                value={project.timeline.background.roundedCorners}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, roundedCorners: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Inset</span>
              <input
                className="text-input"
                type="range"
                min={0}
                max={80}
                step={1}
                value={project.timeline.background.inset}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, inset: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Shadow</span>
              <input
                className="text-input"
                type="range"
                min={0}
                max={100}
                step={1}
                value={project.timeline.background.shadow}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      background: { ...draft.timeline.background, shadow: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
          </div>
        )}

        {selectedTab === "cursor" && (
          <div className="inspector-grid">
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={project.timeline.cursor.hidden}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      cursor: { ...draft.timeline.cursor, hidden: event.target.checked }
                    }
                  }))
                }
              />
              <span>Hide cursor</span>
            </label>
            <label className="field">
              <span>Cursor size</span>
              <input
                className="text-input"
                type="range"
                min={0.5}
                max={3}
                step={0.05}
                value={project.timeline.cursor.size}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      cursor: { ...draft.timeline.cursor, size: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Cursor type</span>
              <select
                className="text-input"
                value={project.timeline.cursor.type}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      cursor: {
                        ...draft.timeline.cursor,
                        type: event.target.value as ProjectFileV1["timeline"]["cursor"]["type"]
                      }
                    }
                  }))
                }
              >
                <option value="system">System</option>
                <option value="touch">Touch</option>
                <option value="minimal">Minimal</option>
                <option value="none">None</option>
              </select>
            </label>
            {([
              ["alwaysUseDefaultSystemCursor", "Always use default system cursor"],
              ["hideWhenIdle", "Hide cursor if not moving"],
              ["loopToStart", "Loop cursor position"],
              ["rotateWhileMoving", "Rotate cursor while moving"],
              ["stopAtEnd", "Stop movement at end"],
              ["removeShakes", "Remove cursor shakes"],
              ["optimizeCursorTypeTransitions", "Optimize cursor types"],
              ["clickSound", "Click sound"]
            ] as const).map(([key, label]) => (
              <label key={key} className="field checkbox-field">
                <input
                  type="checkbox"
                  checked={Boolean(project.timeline.cursor[key])}
                  onChange={(event) =>
                    upsertProject((draft) => ({
                      ...draft,
                      timeline: {
                        ...draft.timeline,
                        cursor: {
                          ...draft.timeline.cursor,
                          [key]: event.target.checked
                        }
                      }
                    }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </div>
        )}

        {selectedTab === "audio" && (
          <div className="inspector-grid">
            <label className="field">
              <span>Master gain (dB)</span>
              <input
                className="text-input"
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={project.timeline.audio.masterGainDb}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      audio: { ...draft.timeline.audio, masterGainDb: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Mic gain (dB)</span>
              <input
                className="text-input"
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={project.timeline.audio.micGainDb}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      audio: { ...draft.timeline.audio, micGainDb: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>System gain (dB)</span>
              <input
                className="text-input"
                type="range"
                min={-24}
                max={12}
                step={0.5}
                value={project.timeline.audio.systemGainDb}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      audio: { ...draft.timeline.audio, systemGainDb: Number(event.target.value) }
                    }
                  }))
                }
              />
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={project.timeline.audio.muteMic}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      audio: { ...draft.timeline.audio, muteMic: event.target.checked }
                    }
                  }))
                }
              />
              <span>Mute mic</span>
            </label>
            <label className="field checkbox-field">
              <input
                type="checkbox"
                checked={project.timeline.audio.muteSystem}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    timeline: {
                      ...draft.timeline,
                      audio: { ...draft.timeline.audio, muteSystem: event.target.checked }
                    }
                  }))
                }
              />
              <span>Mute system</span>
            </label>
          </div>
        )}

        {selectedTab === "presets" && (
          <div className="inspector-grid">
            <button
              className="btn"
              onClick={async () => {
                const currentSettings = settingsQuery.data;
                if (!currentSettings) return;

                const name = window.prompt("Preset name", `Preset ${currentSettings.presets.length + 1}`)?.trim();
                if (!name) return;

                const preset: StylePreset = {
                  id: crypto.randomUUID(),
                  name,
                  createdAt: new Date().toISOString(),
                  timelinePatch: {
                    background: project.timeline.background,
                    cursor: project.timeline.cursor
                  }
                };

                await window.revamp.settings.update({
                  presets: [...currentSettings.presets, preset]
                });
                await settingsQuery.refetch();
              }}
            >
              Save Current as Preset
            </button>
            {(settingsQuery.data?.presets ?? []).map((preset) => (
              <div key={preset.id} className="preset-card">
                <strong>{preset.name}</strong>
                <div className="toolbar-row">
                  <button
                    className="btn"
                    onClick={() =>
                      upsertProject((draft) => ({
                        ...draft,
                        timeline: {
                          ...draft.timeline,
                          background: preset.timelinePatch.background ?? draft.timeline.background,
                          cursor: preset.timelinePatch.cursor ?? draft.timeline.cursor
                        }
                      }))
                    }
                  >
                    Apply
                  </button>
                  <button
                    className="btn danger"
                    onClick={async () => {
                      const current = settingsQuery.data;
                      if (!current) return;
                      await window.revamp.settings.update({
                        presets: current.presets.filter((item) => item.id !== preset.id)
                      });
                      await settingsQuery.refetch();
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
            {(settingsQuery.data?.presets.length ?? 0) === 0 && <p className="tiny-note">No presets saved yet.</p>}
          </div>
        )}

        {selectedTab === "export" && (
          <div className="inspector-grid">
            <label className="field">
              <span>Export profile</span>
              <select
                className="text-input"
                value={project.export.profile}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    export: { ...draft.export, profile: event.target.value as ProjectFileV1["export"]["profile"] }
                  }))
                }
              >
                <option value="draft">Draft</option>
                <option value="standard">Standard</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="field">
              <span>FPS</span>
              <select
                className="text-input"
                value={project.export.fps}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    export: { ...draft.export, fps: Number(event.target.value) as 30 | 60 }
                  }))
                }
              >
                <option value={60}>60</option>
                <option value={30}>30</option>
              </select>
            </label>
            <label className="field">
              <span>Width</span>
              <input
                className="text-input"
                type="number"
                value={project.export.width}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    export: { ...draft.export, width: Number(event.target.value) }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Height</span>
              <input
                className="text-input"
                type="number"
                value={project.export.height}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    export: { ...draft.export, height: Number(event.target.value) }
                  }))
                }
              />
            </label>
            <label className="field">
              <span>Encoder hint</span>
              <select
                className="text-input"
                value={project.export.encoderHint}
                onChange={(event) =>
                  upsertProject((draft) => ({
                    ...draft,
                    export: {
                      ...draft.export,
                      encoderHint: event.target.value as ProjectFileV1["export"]["encoderHint"]
                    }
                  }))
                }
              >
                <option value="auto">Auto</option>
                <option value="nvenc">NVENC</option>
                <option value="qsv">QSV</option>
                <option value="amf">AMF</option>
                <option value="mpeg4">MPEG4 fallback</option>
              </select>
            </label>
            <button className="btn btn-accent" onClick={() => exportMutation.mutateAsync()} disabled={exportMutation.isPending}>
              Render MP4
            </button>
            <div className="export-status">
              <div className="progress-shell">
                <div className="progress-fill" style={{ width: `${Math.round(renderProgress * 100)}%` }} />
              </div>
              <p className={renderStatus.state === "error" ? "error-text" : "tiny-note"}>{renderStatus.text}</p>
            </div>
          </div>
        )}
      </Panel>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={paletteCommands}
        onExecuted={() => setPaletteOpen(false)}
      />
    </div>
  );
}



