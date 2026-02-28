import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { BrowserWindow } from "electron";
import { createRenderPlan, pickEncoder, runRender, type EncoderChoice } from "@revamp/render-engine";
import { getExportsRoot } from "./constants";
import { ensureDirectory } from "./fs-utils";
import { openProject } from "./project-service";

const ENCODER_PRIORITY: EncoderChoice[] = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264", "mpeg4"];

function buildEncoderAttempts(available: EncoderChoice[], preferred: EncoderChoice): EncoderChoice[] {
  const attempts: EncoderChoice[] = [];

  const push = (encoder: EncoderChoice) => {
    if (!attempts.includes(encoder)) {
      attempts.push(encoder);
    }
  };

  push(preferred);
  for (const encoder of ENCODER_PRIORITY) {
    if (available.includes(encoder)) {
      push(encoder);
    }
  }

  // Always keep software fallbacks available even if probing didn't list them.
  push("libx264");
  push("mpeg4");
  return attempts;
}

async function getAvailableEncoders(ffmpegPath: string): Promise<EncoderChoice[]> {
  return new Promise((resolve) => {
    const child = spawn(ffmpegPath, ["-hide_banner", "-encoders"], { windowsHide: true });
    let stdout = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.on("close", () => {
      const encoders = ENCODER_PRIORITY.filter((name) => stdout.includes(name));
      if (encoders.length > 0) {
        resolve(encoders);
        return;
      }
      resolve(["libx264", "mpeg4"]);
    });

    child.on("error", () => resolve(["libx264", "mpeg4"]));
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
  const preferredEncoder = pickEncoder(encoders, loaded.project.export.encoderHint);
  const encoderAttempts = buildEncoderAttempts(encoders, preferredEncoder);

  await ensureDirectory(getExportsRoot());

  const resolvedOutput = outputPath
    ? outputPath
    : path.join(getExportsRoot(), `${loaded.project.meta.name.replace(/[^a-z0-9-_. ]/gi, "_")}-${Date.now()}.mp4`);

  await ensureDirectory(path.dirname(resolvedOutput));

  let lastError: unknown;
  for (const encoder of encoderAttempts) {
    if (existsSync(resolvedOutput)) {
      unlinkSync(resolvedOutput);
    }

    const plan = createRenderPlan(loaded.project, loaded.media.screenTrackPath, resolvedOutput, ffmpegPath, encoder);

    try {
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
    } catch (error) {
      lastError = error;
      mainWindow?.webContents.send("render:progress", {
        projectId,
        ratio: 0,
        rawLine: `Encoder ${encoder} failed, trying next available encoder...`
      });
    }
  }

  throw new Error(
    `Failed to export MP4 after trying encoders: ${encoderAttempts.join(", ")}. ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`
  );
}
