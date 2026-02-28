import { ipcMain } from "electron";
import type { BrowserWindow } from "electron";
import type { AppSettings, ProjectFileV1, RecordingEvent, RecordingProfile } from "@revamp/core-types";
import { createProjectFromRecording, listProjects, openProject, readRawEvents, saveProject } from "./project-service";
import { listDesktopSources } from "./recording-service";
import { renderProjectToMp4 } from "./render-service";
import { loadSettings, saveSettings } from "./settings-service";

export function setupIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  ipcMain.handle("recording:list-sources", async () => listDesktopSources());

  ipcMain.handle(
    "project:create-recording",
    async (
      _event,
      payload: {
        name?: string;
        profile: RecordingProfile;
        durationMs: number;
        events: RecordingEvent[];
        sourceSize: { width: number; height: number };
      },
      videoBytes: Uint8Array
    ) => createProjectFromRecording(payload, videoBytes)
  );

  ipcMain.handle("project:list", async () => listProjects());
  ipcMain.handle("project:open", async (_event, projectId: string) => openProject(projectId));
  ipcMain.handle("project:save", async (_event, project: ProjectFileV1) => saveProject(project));
  ipcMain.handle("project:events", async (_event, projectId: string) => readRawEvents(projectId));

  ipcMain.handle("settings:load", async () => loadSettings());
  ipcMain.handle("settings:update", async (_event, patch: Partial<AppSettings>) => saveSettings(patch));

  ipcMain.handle("render:export-mp4", async (_event, payload: { projectId: string; outputPath?: string }) => {
    return renderProjectToMp4(payload.projectId, getMainWindow(), payload.outputPath);
  });
}
