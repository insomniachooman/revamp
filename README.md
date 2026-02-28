# Revamp Studio (Windows)

A Screen Studio-inspired desktop recorder and editor for Windows built with Electron + React + TypeScript.

## Included Features

- Pre-recording modal
  - Source mode (display/window/area)
  - Source picker with thumbnails
  - System audio + mic toggles
  - FPS control
  - Auto zoom signal controls (click/typing/focus)
  - Hotkey fields
  - Countdown and live recording status panel
- Recording controls
  - Start, pause/resume, stop, cancel
  - Event logging for clicks, typing, focus, cursor path
- Post-recording Studio
  - Video preview with zoomed viewport transform
  - Zoom timeline blocks with manual/auto/instant semantics
  - Drag segment edges on timeline
  - Speed track with segment editing
  - Inspector tabs: Zoom, Background, Cursor, Audio, Presets, Export
  - Background system: wallpaper/gradient/color/image/none + padding, corners, inset, shadow
  - Cursor system: visibility/size/type + advanced toggles
  - Command palette (`Ctrl+K`)
  - Auto-save while editing
- Local project system
  - Project library
  - Local JSON project persistence
  - Settings + presets persistence
- Export
  - MP4 export via FFmpeg
  - Encoder preference and fallback
  - Render progress events

## Workspace Layout

- `apps/desktop`: Electron app (main, preload, renderer)
- `packages/core-types`: shared schemas/types
- `packages/recording-engine`: auto zoom generation + cursor path helpers
- `packages/editor-engine`: timeline/view math
- `packages/render-engine`: FFmpeg render planning/execution
- `packages/design-system`: color/token constants

## Run

```bash
pnpm install
pnpm dev
```

## Validate

```bash
pnpm typecheck
pnpm build
```

## Notes

- Projects are stored under `%USERPROFILE%\\Videos\\Revamp Studio Projects`.
- Exports are written to `%USERPROFILE%\\Videos\\Revamp Exports` unless overridden.
- System `ffmpeg` is used by default (or `FFMPEG_PATH` if set).
