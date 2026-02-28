import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings, ProjectFileV1, RecordingEvent, RecordingProfile } from "@revamp/core-types";

type DesktopSource = {
  id: string;
  name: string;
  thumbnailDataUrl: string;
};

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

type ExportResult = { canceled: true } | { canceled: false; outputPath: string; encoder: string };

const api = {
  recording: {
    listSources: (): Promise<DesktopSource[]> => ipcRenderer.invoke("recording:list-sources")
  },
  project: {
    createRecording: (
      payload: {
        name?: string;
        profile: RecordingProfile;
        durationMs: number;
        events: RecordingEvent[];
        sourceSize: { width: number; height: number };
      },
      videoBytes: Uint8Array
    ): Promise<LoadedProject> => ipcRenderer.invoke("project:create-recording", payload, videoBytes),
    list: (): Promise<Array<{ id: string; name: string; updatedAt: string; durationMs: number }>> =>
      ipcRenderer.invoke("project:list"),
    open: (projectId: string): Promise<LoadedProject> => ipcRenderer.invoke("project:open", projectId),
    save: (project: ProjectFileV1): Promise<ProjectFileV1> => ipcRenderer.invoke("project:save", project),
    readEvents: (projectId: string): Promise<RecordingEvent[]> => ipcRenderer.invoke("project:events", projectId)
  },
  settings: {
    load: (): Promise<AppSettings> => ipcRenderer.invoke("settings:load"),
    update: (patch: Partial<AppSettings>): Promise<AppSettings> => ipcRenderer.invoke("settings:update", patch)
  },
  render: {
    exportMp4: (projectId: string, outputPath?: string): Promise<ExportResult> =>
      ipcRenderer.invoke("render:export-mp4", { projectId, outputPath }),
    onProgress: (listener: (progress: { projectId: string; ratio: number; rawLine: string }) => void): (() => void) => {
      const channel = "render:progress";
      const wrapped = (_event: Electron.IpcRendererEvent, payload: { projectId: string; ratio: number; rawLine: string }) => {
        listener(payload);
      };
      ipcRenderer.on(channel, wrapped);
      return () => ipcRenderer.removeListener(channel, wrapped);
    }
  }
};

contextBridge.exposeInMainWorld("revamp", api);

export type RevampApi = typeof api;
