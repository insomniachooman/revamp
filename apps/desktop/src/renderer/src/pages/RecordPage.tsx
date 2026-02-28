import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { RecordingEvent, RecordingProfile, SourceMode } from "@revamp/core-types";
import { Panel } from "../components/Panel";
import { formatDurationMs } from "../utils/format";

type RecordingState = "idle" | "countdown" | "recording" | "paused" | "saving";
type DesktopSource = { id: string; name: string; thumbnailDataUrl: string };

function appendMessage(existing: string, next: string): string {
  if (!existing.trim()) return next;
  if (existing.includes(next)) return existing;
  return `${existing}\n${next}`;
}

function isRecoverableDesktopAudioError(error: unknown): boolean {
  if (!(error instanceof DOMException)) {
    return false;
  }

  return ["NotReadableError", "NotFoundError", "OverconstrainedError", "AbortError", "NotAllowedError"].includes(
    error.name
  );
}

function defaultProfile(sourceId = ""): RecordingProfile {
  return {
    sourceMode: "display",
    sourceId,
    fps: 60,
    includeSystemAudio: true,
    includeMic: false,
    autoZoomSignals: { clicks: true, typing: true, appFocus: true },
    cursorCapture: "hidden-and-synthetic",
    hotkeys: {
      startStop: "Ctrl+Shift+R",
      pauseResume: "Ctrl+Shift+P",
      cancel: "Ctrl+Shift+C"
    }
  };
}

function createEvent(kind: RecordingEvent["kind"], atMs: number, xNorm?: number, yNorm?: number, payload?: Record<string, unknown>): RecordingEvent {
  return {
    id: crypto.randomUUID(),
    kind,
    atMs,
    xNorm,
    yNorm,
    payload
  };
}

export function RecordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<RecordingState>("idle");
  const [profile, setProfile] = useState<RecordingProfile>(defaultProfile());
  const [name, setName] = useState("");
  const [countdown, setCountdown] = useState(3);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [errorText, setErrorText] = useState("");

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const eventLogRef = useRef<RecordingEvent[]>([]);
  const recordStartTimeRef = useRef<number>(0);
  const lastCursorRef = useRef<{ xNorm: number; yNorm: number }>({ xNorm: 0.5, yNorm: 0.5 });

  const sourcesQuery = useQuery<DesktopSource[]>({
    queryKey: ["sources"],
    queryFn: () => window.revamp.recording.listSources()
  });

  const filteredSources = useMemo(() => {
    const sources = sourcesQuery.data ?? [];
    if (profile.sourceMode === "display" || profile.sourceMode === "area") {
      return sources.filter((source) => source.id.startsWith("screen:"));
    }
    if (profile.sourceMode === "window") {
      return sources.filter((source) => source.id.startsWith("window:"));
    }
    return sources;
  }, [sourcesQuery.data, profile.sourceMode]);

  useEffect(() => {
    if (!filteredSources.length) {
      if (profile.sourceId) {
        setProfile((current) => ({ ...current, sourceId: "" }));
      }
      return;
    }

    const hasSelectedSource = filteredSources.some((source) => source.id === profile.sourceId);
    if (!hasSelectedSource) {
      setProfile((current) => ({ ...current, sourceId: filteredSources[0].id }));
    }
  }, [filteredSources, profile.sourceId]);

  useEffect(() => {
    let timer: number | undefined;
    if (state === "recording") {
      timer = window.setInterval(() => {
        setElapsedMs(Date.now() - recordStartTimeRef.current);
      }, 100);
    }
    return () => {
      if (timer) {
        window.clearInterval(timer);
      }
    };
  }, [state]);

  const stopAllTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  const cleanupEventListeners = () => {
    window.onpointerdown = null;
    window.onmousemove = null;
    window.onkeydown = null;
    window.onblur = null;
    window.onfocus = null;
  };

  const attachEventListeners = () => {
    const getTime = () => Date.now() - recordStartTimeRef.current;

    window.onmousemove = (event) => {
      const xNorm = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
      const yNorm = Math.max(0, Math.min(1, event.clientY / window.innerHeight));
      lastCursorRef.current = { xNorm, yNorm };
      eventLogRef.current.push(createEvent("cursor", getTime(), xNorm, yNorm));
    };

    window.onpointerdown = (event) => {
      const xNorm = Math.max(0, Math.min(1, event.clientX / window.innerWidth));
      const yNorm = Math.max(0, Math.min(1, event.clientY / window.innerHeight));
      eventLogRef.current.push(createEvent("click", getTime(), xNorm, yNorm, { button: event.button }));
    };

    window.onkeydown = (event) => {
      const cursor = lastCursorRef.current;
      eventLogRef.current.push(createEvent("typing", getTime(), cursor.xNorm, cursor.yNorm, { key: event.key }));
    };

    window.onblur = () => {
      const cursor = lastCursorRef.current;
      eventLogRef.current.push(createEvent("focus", getTime(), cursor.xNorm, cursor.yNorm, { state: "blur" }));
    };

    window.onfocus = () => {
      const cursor = lastCursorRef.current;
      eventLogRef.current.push(createEvent("focus", getTime(), cursor.xNorm, cursor.yNorm, { state: "focus" }));
    };
  };

  const createRecordingMutation = useMutation({
    mutationFn: async (blob: Blob) => {
      const bytes = new Uint8Array(await blob.arrayBuffer());
      return window.revamp.project.createRecording(
        {
          name,
          profile,
          durationMs: elapsedMs,
          events: eventLogRef.current,
          sourceSize: {
            width: window.screen.width,
            height: window.screen.height
          }
        },
        bytes
      );
    },
    onSuccess: (loaded) => {
      setState("idle");
      navigate(`/studio/${loaded.projectId}`);
    },
    onError: (error) => {
      setErrorText(String(error));
      setState("idle");
    }
  });

  const captureDesktopStream = async (
    sourceId: string,
    fps: 30 | 60,
    includeSystemAudio: boolean
  ): Promise<{ stream: MediaStream; warning?: string }> => {
    const videoConstraint = {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId,
        maxFrameRate: fps,
        minFrameRate: fps
      } as unknown as MediaTrackConstraints
    } as unknown as MediaTrackConstraints;

    const desktopAudioConstraint = {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId
      } as unknown as MediaTrackConstraints
    } as unknown as MediaTrackConstraints;

    if (!includeSystemAudio) {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false
      } as MediaStreamConstraints);
      return { stream };
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: desktopAudioConstraint
      } as MediaStreamConstraints);
      if (stream.getAudioTracks().length === 0) {
        return {
          stream,
          warning:
            "System audio could not be attached for this source. Recording continued without system audio."
        };
      }
      return { stream };
    } catch (error) {
      if (!isRecoverableDesktopAudioError(error)) {
        throw error;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraint,
        audio: false
      } as MediaStreamConstraints);

      return {
        stream,
        warning:
          "System audio was unavailable for this source. Recording continued without system audio. Use microphone audio or choose a different source if needed."
      };
    }
  };

  const beginActualRecording = async () => {
    setErrorText("");
    chunksRef.current = [];
    eventLogRef.current = [];

    const desktopCapture = await captureDesktopStream(profile.sourceId, profile.fps, profile.includeSystemAudio);
    const stream = desktopCapture.stream;

    if (desktopCapture.warning) {
      const warningMessage = desktopCapture.warning;
      setErrorText((current) => appendMessage(current, warningMessage));
    }

    if (profile.includeMic) {
      try {
        const micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        for (const track of micStream.getAudioTracks()) {
          stream.addTrack(track);
        }
      } catch (error) {
        const message =
          error instanceof DOMException && error.name === "NotAllowedError"
            ? "Microphone permission denied. Recording continued without microphone audio."
            : "Microphone was unavailable. Recording continued without microphone audio.";
        setErrorText((current) => appendMessage(current, message));
      }
    }

    const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
      ? "video/webm;codecs=vp9"
      : "video/webm;codecs=vp8";

    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 12_000_000,
      audioBitsPerSecond: 192_000
    });

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      setState("saving");
      cleanupEventListeners();
      stopAllTracks();
      const blob = new Blob(chunksRef.current, { type: mimeType });
      await createRecordingMutation.mutateAsync(blob);
    };

    streamRef.current = stream;
    mediaRecorderRef.current = recorder;

    recordStartTimeRef.current = Date.now();
    setElapsedMs(0);
    attachEventListeners();
    recorder.start(250);
    setState("recording");
  };

  const startRecording = async () => {
    setState("countdown");
    setCountdown(3);

    let current = 3;
    const interval = window.setInterval(async () => {
      current -= 1;
      setCountdown(Math.max(current, 0));
      if (current <= 0) {
        window.clearInterval(interval);
        try {
          await beginActualRecording();
        } catch (error) {
          setState("idle");
          setErrorText(`Failed to start recording: ${String(error)}`);
        }
      }
    }, 1000);
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
  };

  const pauseResumeRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    if (state === "recording") {
      recorder.pause();
      setState("paused");
      return;
    }

    if (state === "paused") {
      recorder.resume();
      setState("recording");
    }
  };

  const cancelRecording = () => {
    cleanupEventListeners();
    stopAllTracks();
    mediaRecorderRef.current?.stop();
    mediaRecorderRef.current = null;
    chunksRef.current = [];
    eventLogRef.current = [];
    setState("idle");
    setElapsedMs(0);
  };

  const isBusy = state === "countdown" || state === "recording" || state === "paused" || state === "saving";

  const sourcePreview = useMemo(() => {
    const source = sourcesQuery.data?.find((item) => item.id === profile.sourceId);
    return source?.thumbnailDataUrl;
  }, [sourcesQuery.data, profile.sourceId]);

  const updateSourceMode = (mode: SourceMode) => {
    setProfile((current) => ({ ...current, sourceMode: mode }));
  };

  return (
    <div className="record-page-grid">
      <Panel title="Pre-recording Modal" subtitle="Set source, audio, zoom intelligence, and shortcuts before capture">
        <div className="record-grid">
          <label className="field">
            <span>Project name</span>
            <input className="text-input" value={name} onChange={(event) => setName(event.target.value)} placeholder="Optional" />
          </label>

          <div className="field grouped-field">
            <span>Source mode</span>
            <div className="pill-row">
              {([
                ["display", "Display"],
                ["window", "Window"],
                ["area", "Area"]
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  className={`btn ${profile.sourceMode === value ? "btn-accent" : ""}`}
                  onClick={() => updateSourceMode(value)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <label className="field">
            <span>Capture source</span>
            <select
              className="text-input"
              value={profile.sourceId}
              onChange={(event) => setProfile((current) => ({ ...current, sourceId: event.target.value }))}
            >
              {filteredSources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Frame rate</span>
            <select
              className="text-input"
              value={profile.fps}
              onChange={(event) => setProfile((current) => ({ ...current, fps: Number(event.target.value) as 30 | 60 }))}
            >
              <option value={60}>60 FPS</option>
              <option value={30}>30 FPS</option>
            </select>
          </label>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={profile.includeSystemAudio}
              onChange={(event) => setProfile((current) => ({ ...current, includeSystemAudio: event.target.checked }))}
            />
            <span>Include system audio</span>
          </label>

          <label className="field checkbox-field">
            <input
              type="checkbox"
              checked={profile.includeMic}
              onChange={(event) => setProfile((current) => ({ ...current, includeMic: event.target.checked }))}
            />
            <span>Include microphone</span>
          </label>

          <div className="field grouped-field">
            <span>Auto zoom signals</span>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={profile.autoZoomSignals.clicks}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    autoZoomSignals: { ...current.autoZoomSignals, clicks: event.target.checked }
                  }))
                }
              />
              <span>Clicks</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={profile.autoZoomSignals.typing}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    autoZoomSignals: { ...current.autoZoomSignals, typing: event.target.checked }
                  }))
                }
              />
              <span>Typing</span>
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={profile.autoZoomSignals.appFocus}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    autoZoomSignals: { ...current.autoZoomSignals, appFocus: event.target.checked }
                  }))
                }
              />
              <span>App focus</span>
            </label>
          </div>

          <div className="field grouped-field">
            <span>Recorder hotkeys</span>
            <label className="field-inline">
              Start/Stop
              <input
                className="text-input"
                value={profile.hotkeys.startStop}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    hotkeys: { ...current.hotkeys, startStop: event.target.value }
                  }))
                }
              />
            </label>
            <label className="field-inline">
              Pause/Resume
              <input
                className="text-input"
                value={profile.hotkeys.pauseResume}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    hotkeys: { ...current.hotkeys, pauseResume: event.target.value }
                  }))
                }
              />
            </label>
          </div>
        </div>

        <div className="toolbar-row">
          <button className="btn" onClick={() => sourcesQuery.refetch()}>
            Refresh Sources
          </button>
          <button className="btn btn-accent" disabled={!profile.sourceId || isBusy} onClick={startRecording}>
            Start Recording
          </button>
        </div>

        {errorText && <p className="error-text">{errorText}</p>}
      </Panel>

      <Panel title="Live Status" subtitle="Session controls for pause, restart, cancel, and stop">
        <div className="record-status-stack">
          <div className="status-line">
            <span>Status</span>
            <strong>{state.toUpperCase()}</strong>
          </div>
          {state === "countdown" && <p className="big-countdown">{countdown}</p>}
          <div className="status-line">
            <span>Elapsed</span>
            <strong>{formatDurationMs(elapsedMs)}</strong>
          </div>
          <div className="toolbar-row">
            <button className="btn" onClick={pauseResumeRecording} disabled={state !== "recording" && state !== "paused"}>
              {state === "paused" ? "Resume" : "Pause"}
            </button>
            <button className="btn" onClick={cancelRecording} disabled={!isBusy || state === "saving"}>
              Cancel
            </button>
            <button className="btn btn-accent" onClick={stopRecording} disabled={state !== "recording" && state !== "paused"}>
              Stop
            </button>
          </div>
          <p className="tiny-note">After stop, the app opens Studio automatically with generated zoom timeline blocks.</p>
          {state === "saving" && <p className="tiny-note">Saving project and preparing editor...</p>}
        </div>
      </Panel>

      <Panel title="Source Preview" subtitle="Desktop or window thumbnail from Electron source picker" className="source-preview-panel">
        {sourcePreview ? <img src={sourcePreview} alt="Selected source" className="source-preview" /> : <p>No source selected.</p>}
      </Panel>
    </div>
  );
}

