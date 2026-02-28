import { spawn } from "node:child_process";
import type { BackgroundSettings, ExportSettings, ProjectFileV1 } from "@revamp/core-types";

export type EncoderChoice = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264" | "mpeg4";

export type RenderPlan = {
  ffmpegPath: string;
  args: string[];
  outputPath: string;
  encoder: EncoderChoice;
};

function backgroundColor(background: BackgroundSettings): string {
  if (background.type === "color") return background.color;
  if (background.type === "gradient") return background.gradientFrom;
  return "#0f172a";
}

export function pickEncoder(available: string[], hint: ExportSettings["encoderHint"]): EncoderChoice {
  if (hint === "nvenc" && available.includes("h264_nvenc")) return "h264_nvenc";
  if (hint === "qsv" && available.includes("h264_qsv")) return "h264_qsv";
  if (hint === "amf" && available.includes("h264_amf")) return "h264_amf";
  if (hint === "mpeg4" && available.includes("mpeg4")) return "mpeg4";

  for (const candidate of ["h264_nvenc", "h264_qsv", "h264_amf"] as const) {
    if (available.includes(candidate)) return candidate;
  }
  if (available.includes("libx264")) return "libx264";
  return "mpeg4";
}

function escapeExpressionCommas(expression: string): string {
  return expression.replaceAll(",", "\\,");
}

export function createFilterGraph(project: ProjectFileV1, exportSettings: ExportSettings): string {
  const background = project.timeline.background;
  const color = backgroundColor(background).replace("#", "0x");
  const padding = Math.round(background.padding);
  const radius = Math.round(background.roundedCorners);

  const baseScale = `scale=${exportSettings.width - padding * 2}:${exportSettings.height - padding * 2}:force_original_aspect_ratio=decrease`;
  const pad = `pad=${exportSettings.width}:${exportSettings.height}:(ow-iw)/2:(oh-ih)/2:color=${color}`;

  const firstActiveZoom = project.timeline.zooms.find((segment) => !segment.disabled);
  if (!firstActiveZoom) {
    return `${baseScale},${pad}`;
  }

  const zoom = Math.max(1, firstActiveZoom.level);
  const xNorm = firstActiveZoom.manualTarget?.xNorm ?? 0.5;
  const yNorm = firstActiveZoom.manualTarget?.yNorm ?? 0.5;

  const cropW = `iw/${zoom.toFixed(3)}`;
  const cropH = `ih/${zoom.toFixed(3)}`;
  const cropX = escapeExpressionCommas(`max(0,min(iw-${cropW},iw*${xNorm.toFixed(4)}-${cropW}/2))`);
  const cropY = escapeExpressionCommas(`max(0,min(ih-${cropH},ih*${yNorm.toFixed(4)}-${cropH}/2))`);

  const rounded = radius > 0 ? `,format=yuva420p` : "";
  return `crop=${cropW}:${cropH}:${cropX}:${cropY},${baseScale},${pad}${rounded}`;
}

export function createRenderPlan(
  project: ProjectFileV1,
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
  encoder: EncoderChoice
): RenderPlan {
  const filterGraph = createFilterGraph(project, project.export);

  const args = [
    "-y",
    "-i",
    inputPath,
    "-vf",
    filterGraph,
    "-r",
    String(project.export.fps),
    "-c:v",
    encoder,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath
  ];

  return { ffmpegPath, args, outputPath, encoder };
}

export type RenderProgress = {
  ratio: number;
  rawLine: string;
};

export function runRender(
  plan: RenderPlan,
  onProgress?: (progress: RenderProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(plan.ffmpegPath, plan.args, {
      windowsHide: true
    });

    const stderrTail: string[] = [];

    child.stderr.on("data", (buffer) => {
      const lines = String(buffer)
        .split(/\r?\n/)
        .filter(Boolean);

      for (const line of lines) {
        stderrTail.push(line);
        if (stderrTail.length > 30) {
          stderrTail.shift();
        }

        const match = /time=(\d+):(\d+):(\d+\.\d+)/.exec(line);
        if (!match) continue;
        const hours = Number(match[1]);
        const minutes = Number(match[2]);
        const seconds = Number(match[3]);
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        const ratio = Math.max(0, Math.min(totalSeconds / 3600, 1));
        onProgress?.({ ratio, rawLine: line });
      }
    });

    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const details = stderrTail.length > 0 ? `\n${stderrTail.join("\n")}` : "";
      reject(new Error(`FFmpeg exited with code ${code}.${details}`));
    });
  });
}
