import { z } from "zod";

export const sourceModeSchema = z.enum(["display", "window", "area"]);
export type SourceMode = z.infer<typeof sourceModeSchema>;

export const cursorTypeSchema = z.enum(["system", "touch", "minimal", "none"]);
export type CursorType = z.infer<typeof cursorTypeSchema>;

export const autoZoomSignalSchema = z.enum(["click", "typing", "focus"]);
export type AutoZoomSignal = z.infer<typeof autoZoomSignalSchema>;

export const backgroundTypeSchema = z.enum(["wallpaper", "gradient", "color", "image", "none"]);
export type BackgroundType = z.infer<typeof backgroundTypeSchema>;

export const zoomModeSchema = z.enum(["auto", "manual"]);
export type ZoomMode = z.infer<typeof zoomModeSchema>;

export const zoomSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  level: z.number().min(1).max(4),
  mode: zoomModeSchema,
  manualTarget: z
    .object({
      xNorm: z.number().min(0).max(1),
      yNorm: z.number().min(0).max(1)
    })
    .optional(),
  instant: z.boolean().default(false),
  disabled: z.boolean().default(false),
  sourceSignal: autoZoomSignalSchema.optional()
});
export type ZoomSegment = z.infer<typeof zoomSegmentSchema>;

export const cutSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  disabled: z.boolean().default(false)
});
export type CutSegment = z.infer<typeof cutSegmentSchema>;

export const speedSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  rate: z.number().min(0.25).max(4),
  disableSmoothMouseMovement: z.boolean().default(false)
});
export type SpeedSegment = z.infer<typeof speedSegmentSchema>;

export const rectSegmentSchema = z.object({
  id: z.string(),
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  xNorm: z.number().min(0).max(1),
  yNorm: z.number().min(0).max(1),
  wNorm: z.number().min(0.01).max(1),
  hNorm: z.number().min(0.01).max(1),
  opacity: z.number().min(0).max(1).default(1)
});
export type RectSegment = z.infer<typeof rectSegmentSchema>;

export const cursorTrackSettingsSchema = z.object({
  hidden: z.boolean().default(false),
  size: z.number().min(0.5).max(3).default(1),
  type: cursorTypeSchema.default("system"),
  alwaysUseDefaultSystemCursor: z.boolean().default(true),
  hideWhenIdle: z.boolean().default(false),
  idleTimeoutMs: z.number().min(500).max(10000).default(1800),
  loopToStart: z.boolean().default(false),
  rotateWhileMoving: z.boolean().default(false),
  stopAtEnd: z.boolean().default(false),
  removeShakes: z.boolean().default(true),
  optimizeCursorTypeTransitions: z.boolean().default(true),
  clickSound: z.boolean().default(false)
});
export type CursorTrackSettings = z.infer<typeof cursorTrackSettingsSchema>;

export const backgroundSettingsSchema = z.object({
  type: backgroundTypeSchema.default("gradient"),
  wallpaperId: z.string().optional(),
  gradientFrom: z.string().default("#0f172a"),
  gradientTo: z.string().default("#0ea5e9"),
  color: z.string().default("#111827"),
  imagePath: z.string().optional(),
  padding: z.number().min(0).max(240).default(64),
  roundedCorners: z.number().min(0).max(64).default(18),
  inset: z.number().min(0).max(80).default(0),
  shadow: z.number().min(0).max(100).default(48)
});
export type BackgroundSettings = z.infer<typeof backgroundSettingsSchema>;

export const audioTrackSettingsSchema = z.object({
  masterGainDb: z.number().min(-24).max(12).default(0),
  micGainDb: z.number().min(-24).max(12).default(0),
  systemGainDb: z.number().min(-24).max(12).default(0),
  muteMic: z.boolean().default(false),
  muteSystem: z.boolean().default(false)
});
export type AudioTrackSettings = z.infer<typeof audioTrackSettingsSchema>;

export const timelineSchema = z.object({
  zooms: z.array(zoomSegmentSchema).default([]),
  cursor: cursorTrackSettingsSchema.default({}),
  cuts: z.array(cutSegmentSchema).default([]),
  speed: z.array(speedSegmentSchema).default([]),
  masks: z.array(rectSegmentSchema).default([]),
  highlights: z.array(rectSegmentSchema).default([]),
  audio: audioTrackSettingsSchema.default({}),
  background: backgroundSettingsSchema.default({})
});
export type Timeline = z.infer<typeof timelineSchema>;

export const recordingProfileSchema = z.object({
  sourceMode: sourceModeSchema,
  sourceId: z.string(),
  fps: z.union([z.literal(30), z.literal(60)]).default(60),
  includeSystemAudio: z.boolean().default(true),
  includeMic: z.boolean().default(false),
  autoZoomSignals: z.object({
    clicks: z.boolean().default(true),
    typing: z.boolean().default(true),
    appFocus: z.boolean().default(true)
  }),
  cursorCapture: z.enum(["hidden-and-synthetic", "native"]).default("hidden-and-synthetic"),
  hotkeys: z.object({
    startStop: z.string().default("Ctrl+Shift+R"),
    pauseResume: z.string().default("Ctrl+Shift+P"),
    cancel: z.string().default("Ctrl+Shift+C")
  })
});
export type RecordingProfile = z.infer<typeof recordingProfileSchema>;

export const exportSettingsSchema = z.object({
  format: z.literal("mp4").default("mp4"),
  profile: z.enum(["draft", "standard", "high"]).default("standard"),
  width: z.number().int().positive().default(1920),
  height: z.number().int().positive().default(1080),
  fps: z.union([z.literal(30), z.literal(60)]).default(60),
  destination: z.string().optional(),
  encoderHint: z.enum(["auto", "nvenc", "qsv", "amf", "mpeg4"]).default("auto")
});
export type ExportSettings = z.infer<typeof exportSettingsSchema>;

export const recordingEventSchema = z.object({
  id: z.string(),
  kind: z.enum(["click", "typing", "focus", "cursor"]),
  atMs: z.number().nonnegative(),
  xNorm: z.number().min(0).max(1).optional(),
  yNorm: z.number().min(0).max(1).optional(),
  payload: z.record(z.any()).optional()
});
export type RecordingEvent = z.infer<typeof recordingEventSchema>;

export const projectFileSchema = z.object({
  version: z.literal(1),
  meta: z.object({
    id: z.string(),
    name: z.string(),
    createdAt: z.string(),
    updatedAt: z.string(),
    durationMs: z.number().nonnegative()
  }),
  media: z.object({
    screenTrack: z.string(),
    micTrack: z.string().optional(),
    systemTrack: z.string().optional(),
    eventTrack: z.string().optional(),
    thumbnail: z.string().optional()
  }),
  timeline: timelineSchema,
  export: exportSettingsSchema,
  notes: z.string().optional()
});
export type ProjectFileV1 = z.infer<typeof projectFileSchema>;

export const presetSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  timelinePatch: z.object({
    background: backgroundSettingsSchema.optional(),
    cursor: cursorTrackSettingsSchema.optional()
  })
});
export type StylePreset = z.infer<typeof presetSchema>;

export const appSettingsSchema = z.object({
  createZoomsAutomatically: z.boolean().default(true),
  defaultRecordingProfile: recordingProfileSchema.optional(),
  defaults: z.object({
    background: backgroundSettingsSchema.default({}),
    cursor: cursorTrackSettingsSchema.default({}),
    export: exportSettingsSchema.default({})
  }).default({}),
  presets: z.array(presetSchema).default([])
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const defaultBackgroundSettings: BackgroundSettings = backgroundSettingsSchema.parse({});
export const defaultCursorSettings: CursorTrackSettings = cursorTrackSettingsSchema.parse({});
export const defaultExportSettings: ExportSettings = exportSettingsSchema.parse({});

export const defaultAppSettings: AppSettings = appSettingsSchema.parse({});

export function validateProjectFile(input: unknown): ProjectFileV1 {
  return projectFileSchema.parse(input);
}

export function validateSettings(input: unknown): AppSettings {
  return appSettingsSchema.parse(input);
}
