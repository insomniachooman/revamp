import { app } from "electron";
import path from "node:path";

export const APP_DIR_NAME = "Revamp Studio Projects";

export function getProjectsRoot(): string {
  return path.join(app.getPath("videos"), APP_DIR_NAME);
}

export function getExportsRoot(): string {
  return path.join(app.getPath("videos"), "Revamp Exports");
}

export function getSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

export function getProjectDirectory(projectId: string): string {
  return path.join(getProjectsRoot(), projectId);
}

export function toFileUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, "/");
  return `file:///${encodeURI(normalized)}`;
}
