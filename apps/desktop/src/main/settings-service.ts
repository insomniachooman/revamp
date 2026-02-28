import { existsSync } from "node:fs";
import { readJsonFile, writeJsonFile } from "./fs-utils";
import { getSettingsFilePath } from "./constants";
import { defaultAppSettings, validateSettings, type AppSettings } from "@revamp/core-types";

export async function loadSettings(): Promise<AppSettings> {
  const path = getSettingsFilePath();
  if (!existsSync(path)) {
    await writeJsonFile(path, defaultAppSettings);
    return defaultAppSettings;
  }

  const parsed = await readJsonFile<unknown>(path);
  const settings = validateSettings(parsed);
  return settings;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<AppSettings> {
  const current = await loadSettings();
  const merged: AppSettings = {
    ...current,
    ...patch,
    defaults: {
      ...current.defaults,
      ...(patch.defaults ?? {})
    },
    presets: patch.presets ?? current.presets
  };

  await writeJsonFile(getSettingsFilePath(), merged);
  return merged;
}
