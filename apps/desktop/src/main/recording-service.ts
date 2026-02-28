import { desktopCapturer } from "electron";

export async function listDesktopSources(): Promise<
  Array<{
    id: string;
    name: string;
    thumbnailDataUrl: string;
  }>
> {
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    fetchWindowIcons: true,
    thumbnailSize: { width: 480, height: 270 }
  });

  return sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnailDataUrl: source.thumbnail.toDataURL()
  }));
}
