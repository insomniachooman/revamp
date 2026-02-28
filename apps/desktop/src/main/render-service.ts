import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { createRenderPlan, pickEncoder, runRender } from "@revamp/render-engine";
import { getExportsRoot } from "./constants";
import { ensureDirectory } from "./fs-utils";
import { openProject } from "./project-service";

async function getAvailableEncoders(ffmpegPath: string): Promise<string[]> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-encoders"], { windowsHide: true });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.on("close", () => {
      const encoders = ["h264_nvenc", "h264_qsv", "h264_amf", "mpeg4"].filter((name) => stdout.includes(name));
      resolve(encoders);
    });

    child.on("error", () => resolve(["mpeg4"]));
  });
}

export async function renderProjectToMp4(
  projectId: string,
  mainWindow: BrowserWindow | null,
  outputPath?: string
): Promise<{ outputPath: string; encoder: string }> {
  const loaded = await openProject(projectId);
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const encoders = await getAvailableEncoders(ffmpegPath);
  const encoder = pickEncoder(encoders, loaded.project.export.encoderHint);

  await ensureDirectory(getExportsRoot());

  const resolvedOutput = outputPath
    ? outputPath
    : path.join(getExportsRoot(), `${loaded.project.meta.name.replace(/[^a-z0-9-_. ]/gi, "_")}-${Date.now()}.mp4`);

  const plan = createRenderPlan(loaded.project, loaded.media.screenTrackPath, resolvedOutput, ffmpegPath, encoder);

  await runRender(plan, (progress) => {
    mainWindow?.webContents.send("render:progress", {
      projectId,
      ratio: progress.ratio,
      rawLine: progress.rawLine
    });
  });

  if (!existsSync(resolvedOutput)) {
    throw new Error("Render completed but output was not created.");
  }

  return { outputPath: resolvedOutput, encoder };
}
