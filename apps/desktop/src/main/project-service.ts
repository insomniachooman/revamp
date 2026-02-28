import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  defaultBackgroundSettings,
  defaultCursorSettings,
  defaultExportSettings,
  type ProjectFileV1,
  type RecordingEvent,
  type RecordingProfile,
  validateProjectFile
} from "@revamp/core-types";
import { buildAutoZooms } from "@revamp/recording-engine";
import { getProjectDirectory, getProjectsRoot, toFileUrl } from "./constants";
import { ensureDirectory, readJsonFile, writeJsonFile } from "./fs-utils";
import { loadSettings } from "./settings-service";

const PROJECT_FILE_NAME = "project.revamp.json";

type CreateProjectPayload = {
  name?: string;
  profile: RecordingProfile;
  durationMs: number;
  events: RecordingEvent[];
  sourceSize: { width: number; height: number };
};

export type LoadedProject = {
  project: ProjectFileV1;
  projectId: string;
  directory: string;
  media: {
    screenTrackPath: string;
    screenTrackUrl: string;
    eventTrackPath?: string;
  };
};

export async function createProjectFromRecording(payload: CreateProjectPayload, videoBytes: Uint8Array): Promise<LoadedProject> {
  await ensureDirectory(getProjectsRoot());

  const settings = await loadSettings();
  const id = `proj-${Date.now()}-${Math.floor(Math.random() * 10_000)}`;
  const directory = getProjectDirectory(id);
  await mkdir(directory, { recursive: true });

  const screenTrackFile = "screen.webm";
  const screenTrackPath = path.join(directory, screenTrackFile);
  await writeFile(screenTrackPath, videoBytes);

  const eventTrackFile = "events.ndjson";
  const eventTrackPath = path.join(directory, eventTrackFile);
  const stream = createWriteStream(eventTrackPath, { encoding: "utf-8" });
  for (const event of payload.events) {
    stream.write(`${JSON.stringify(event)}\n`);
  }
  stream.end();

  const shouldBuildAutoZooms = settings.createZoomsAutomatically;
  const zooms = shouldBuildAutoZooms
    ? buildAutoZooms(payload.events, payload.durationMs, {
        includeClicks: payload.profile.autoZoomSignals.clicks,
        includeTyping: payload.profile.autoZoomSignals.typing,
        includeFocus: payload.profile.autoZoomSignals.appFocus
      })
    : [];

  const now = new Date().toISOString();
  const project: ProjectFileV1 = {
    version: 1,
    meta: {
      id,
      name: payload.name?.trim() || `Recording ${new Date().toLocaleString()}`,
      createdAt: now,
      updatedAt: now,
      durationMs: Math.max(1, Math.round(payload.durationMs))
    },
    media: {
      screenTrack: screenTrackFile,
      eventTrack: eventTrackFile
    },
    timeline: {
      zooms,
      cursor: settings.defaults.cursor ?? defaultCursorSettings,
      cuts: [],
      speed: [],
      masks: [],
      highlights: [],
      audio: {
        masterGainDb: 0,
        micGainDb: 0,
        systemGainDb: 0,
        muteMic: false,
        muteSystem: false
      },
      background: settings.defaults.background ?? defaultBackgroundSettings
    },
    export: settings.defaults.export ?? defaultExportSettings
  };

  await writeJsonFile(path.join(directory, PROJECT_FILE_NAME), project);

  return {
    project,
    projectId: id,
    directory,
    media: {
      screenTrackPath,
      screenTrackUrl: toFileUrl(screenTrackPath),
      eventTrackPath
    }
  };
}

export async function listProjects(): Promise<
  Array<{
    id: string;
    name: string;
    updatedAt: string;
    durationMs: number;
  }>
> {
  await ensureDirectory(getProjectsRoot());
  const entries = await readdir(getProjectsRoot(), { withFileTypes: true });
  const projects: Array<{ id: string; name: string; updatedAt: string; durationMs: number }> = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const projectId = entry.name;
    const projectPath = path.join(getProjectDirectory(projectId), PROJECT_FILE_NAME);
    if (!existsSync(projectPath)) continue;

    try {
      const project = validateProjectFile(await readJsonFile<unknown>(projectPath));
      projects.push({
        id: projectId,
        name: project.meta.name,
        updatedAt: project.meta.updatedAt,
        durationMs: project.meta.durationMs
      });
    } catch {
      continue;
    }
  }

  return projects.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function openProject(projectId: string): Promise<LoadedProject> {
  const directory = getProjectDirectory(projectId);
  const projectPath = path.join(directory, PROJECT_FILE_NAME);
  const project = validateProjectFile(await readJsonFile<unknown>(projectPath));

  const screenTrackPath = path.join(directory, project.media.screenTrack);
  const eventTrackPath = project.media.eventTrack ? path.join(directory, project.media.eventTrack) : undefined;

  return {
    project,
    projectId,
    directory,
    media: {
      screenTrackPath,
      screenTrackUrl: toFileUrl(screenTrackPath),
      eventTrackPath
    }
  };
}

export async function saveProject(project: ProjectFileV1): Promise<ProjectFileV1> {
  const directory = getProjectDirectory(project.meta.id);
  const updated: ProjectFileV1 = {
    ...project,
    meta: {
      ...project.meta,
      updatedAt: new Date().toISOString()
    }
  };

  await writeJsonFile(path.join(directory, PROJECT_FILE_NAME), updated);
  return updated;
}

export async function readRawEvents(projectId: string): Promise<RecordingEvent[]> {
  const loaded = await openProject(projectId);
  const eventTrackPath = loaded.media.eventTrackPath;
  if (!eventTrackPath || !existsSync(eventTrackPath)) {
    return [];
  }

  const raw = await readFile(eventTrackPath, "utf-8");
  return raw
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RecordingEvent);
}
