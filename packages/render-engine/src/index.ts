import { spawn } from "node:child_process";
import type { BackgroundSettings, ExportSettings, ProjectFileV1, ZoomSegment } from "@revamp/core-types";

export type EncoderChoice = "h264_nvenc" | "h264_qsv" | "h264_amf" | "libx264" | "mpeg4";

export type RenderPlan = {
  ffmpegPath: string;
  args: string[];
  outputPath: string;
  encoder: EncoderChoice;
};

export type CreateRenderPlanOptions = {
  backgroundImagePath?: string;
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

function computeFrameMargin(project: ProjectFileV1, exportSettings: ExportSettings): number {
  const background = project.timeline.background;
  const requestedMargin = Math.max(0, Math.round(background.padding) + Math.round(background.inset));
  const maxAllowedMargin = Math.max(0, Math.min(Math.floor((exportSettings.width - 2) / 2), Math.floor((exportSettings.height - 2) / 2)));
  return Math.min(requestedMargin, maxAllowedMargin);
}

function toSeconds(ms: number): string {
  return (ms / 1000).toFixed(3);
}

function toPiecewiseExpression(
  segments: ZoomSegment[],
  pickValue: (segment: ZoomSegment) => string,
  fallback: string
): string {
  if (segments.length === 0) {
    return fallback;
  }

  let expression = fallback;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    expression = `if(between(t,${toSeconds(segment.startMs)},${toSeconds(segment.endMs)}),${pickValue(segment)},${expression})`;
  }
  return expression;
}

function createForegroundFilter(project: ProjectFileV1, exportSettings: ExportSettings): string {
  const margin = computeFrameMargin(project, exportSettings);
  const innerWidth = Math.max(2, exportSettings.width - margin * 2);
  const innerHeight = Math.max(2, exportSettings.height - margin * 2);
  const baseScale = `scale=${innerWidth}:${innerHeight}:force_original_aspect_ratio=decrease:flags=lanczos,setsar=1`;

  const activeZooms = project.timeline.zooms.filter((segment) => !segment.disabled && segment.level > 1);
  if (activeZooms.length === 0) {
    return baseScale;
  }

  const zoomExpression = toPiecewiseExpression(
    activeZooms,
    (segment) => Math.max(1, segment.level).toFixed(4),
    "1"
  );
  const xNormExpression = toPiecewiseExpression(
    activeZooms,
    (segment) => (segment.manualTarget?.xNorm ?? 0.5).toFixed(4),
    "0.5"
  );
  const yNormExpression = toPiecewiseExpression(
    activeZooms,
    (segment) => (segment.manualTarget?.yNorm ?? 0.5).toFixed(4),
    "0.5"
  );

  const zoomEscaped = escapeExpressionCommas(zoomExpression);
  const cropX = escapeExpressionCommas(`max(0,min(iw*(${zoomExpression})-iw,iw*(${xNormExpression})*(${zoomExpression})-iw/2))`);
  const cropY = escapeExpressionCommas(`max(0,min(ih*(${zoomExpression})-ih,ih*(${yNormExpression})*(${zoomExpression})-ih/2))`);
  const dynamicZoom = `scale=iw*(${zoomEscaped}):ih*(${zoomEscaped}):eval=frame:flags=lanczos,crop=iw:ih:${cropX}:${cropY}`;

  return `${dynamicZoom},${baseScale}`;
}

export function createFilterGraph(project: ProjectFileV1, exportSettings: ExportSettings): string {
  const color = backgroundColor(project.timeline.background).replace("#", "0x");
  const foreground = createForegroundFilter(project, exportSettings);
  const pad = `pad=${exportSettings.width}:${exportSettings.height}:(ow-iw)/2:(oh-ih)/2:color=${color}`;
  return `${foreground},${pad}`;
}

function createImageBackgroundFilterGraph(
  project: ProjectFileV1,
  exportSettings: ExportSettings
): { graph: string; outputLabel: string } {
  const foreground = createForegroundFilter(project, exportSettings);
  const backgroundScale = [
    `scale=${exportSettings.width}:${exportSettings.height}:force_original_aspect_ratio=increase:flags=lanczos`,
    `crop=${exportSettings.width}:${exportSettings.height}`,
    "setsar=1"
  ].join(",");

  return {
    graph: `[0:v]${foreground}[fg];[1:v]${backgroundScale}[bg];[bg][fg]overlay=(W-w)/2:(H-h)/2:shortest=1[vout]`,
    outputLabel: "[vout]"
  };
}

export function createRenderPlan(
  project: ProjectFileV1,
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
  encoder: EncoderChoice,
  options?: CreateRenderPlanOptions
): RenderPlan {
  const backgroundImagePath = options?.backgroundImagePath?.trim();
  const imageBackgroundEnabled = project.timeline.background.type === "image" && Boolean(backgroundImagePath);

  const args = ["-y", "-i", inputPath];

  if (imageBackgroundEnabled && backgroundImagePath) {
    const { graph, outputLabel } = createImageBackgroundFilterGraph(project, project.export);
    args.push("-loop", "1", "-i", backgroundImagePath, "-filter_complex", graph, "-map", outputLabel, "-shortest");
  } else {
    const filterGraph = createFilterGraph(project, project.export);
    args.push("-vf", filterGraph);
  }

  args.push(
    "-r",
    String(project.export.fps),
    "-c:v",
    encoder,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputPath
  );

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
