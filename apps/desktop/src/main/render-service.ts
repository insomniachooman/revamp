import { spawn } from "node:child_process";
import { existsSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dialog, type BrowserWindow } from "electron";
import { createRenderPlan, pickEncoder, runRender, type EncoderChoice } from "@revamp/render-engine";
import { getExportsRoot } from "./constants";
import { ensureDirectory } from "./fs-utils";
import { openProject } from "./project-service";

const ENCODER_PRIORITY: EncoderChoice[] = ["h264_nvenc", "h264_qsv", "h264_amf", "libx264", "mpeg4"];

function sanitizeFileStem(value: string): string {
  return value.replace(/[^a-z0-9-_. ]/gi, "_").trim() || "revamp-export";
}

function resolveBackgroundImagePath(rawPath: string | undefined, projectDirectory: string): string | undefined {
  if (!rawPath?.trim()) {
    return undefined;
  }

  const trimmed = rawPath.trim();
  const normalized = trimmed.startsWith("file://")
    ? (() => {
        try {
          return fileURLToPath(trimmed);
        } catch {
          return undefined;
        }
      })()
    : trimmed;

  if (!normalized) {
    return undefined;
  }

  return path.isAbsolute(normalized) ? normalized : path.resolve(projectDirectory, normalized);
}

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
): Promise<{ canceled: true } | { canceled: false; outputPath: string; encoder: string }> {
  const loaded = await openProject(projectId);
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
  const encoders = await getAvailableEncoders(ffmpegPath);
  const preferredEncoder = pickEncoder(encoders, loaded.project.export.encoderHint);
  const encoderAttempts = buildEncoderAttempts(encoders, preferredEncoder);

  await ensureDirectory(getExportsRoot());

  const suggestedOutput = path.join(getExportsRoot(), `${sanitizeFileStem(loaded.project.meta.name)}-${Date.now()}.mp4`);

  let resolvedOutput = outputPath ?? suggestedOutput;
  if (!outputPath && mainWindow) {
    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: "Export MP4",
      defaultPath: suggestedOutput,
      buttonLabel: "Save MP4",
      filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      showOverwriteConfirmation: true
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { canceled: true };
    }

    resolvedOutput = saveResult.filePath.toLowerCase().endsWith(".mp4") ? saveResult.filePath : `${saveResult.filePath}.mp4`;
  }

  await ensureDirectory(path.dirname(resolvedOutput));

  const resolvedBackgroundImagePath =
    loaded.project.timeline.background.type === "image"
      ? resolveBackgroundImagePath(loaded.project.timeline.background.imagePath, loaded.directory)
      : undefined;
  const hasBackgroundImage = Boolean(resolvedBackgroundImagePath && existsSync(resolvedBackgroundImagePath));
  if (loaded.project.timeline.background.type === "image" && resolvedBackgroundImagePath && !hasBackgroundImage) {
    mainWindow?.webContents.send("render:progress", {
      projectId,
      ratio: 0,
      rawLine: `Background image not found at ${resolvedBackgroundImagePath}. Falling back to color background for export.`
    });
  }

  let lastError: unknown;
  for (const encoder of encoderAttempts) {
    if (existsSync(resolvedOutput)) {
      unlinkSync(resolvedOutput);
    }

    const plan = createRenderPlan(loaded.project, loaded.media.screenTrackPath, resolvedOutput, ffmpegPath, encoder, {
      backgroundImagePath: hasBackgroundImage ? resolvedBackgroundImagePath : undefined
    });

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

      return { canceled: false, outputPath: resolvedOutput, encoder };
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
