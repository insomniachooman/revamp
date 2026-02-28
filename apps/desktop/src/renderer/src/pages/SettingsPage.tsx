import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { AppSettings } from "@revamp/core-types";
import { Panel } from "../components/Panel";

export function SettingsPage() {
  const [status, setStatus] = useState("");

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => window.revamp.settings.load()
  });

  const mutation = useMutation({
    mutationFn: (patch: Partial<AppSettings>) => window.revamp.settings.update(patch),
    onSuccess: async () => {
      await settingsQuery.refetch();
      setStatus("Settings saved.");
    }
  });

  const settings = settingsQuery.data;

  if (!settings) {
    return (
      <div className="page-grid">
        <Panel title="Settings" subtitle="Loading...">
          <p>Loading settings…</p>
        </Panel>
      </div>
    );
  }

  return (
    <div className="page-grid">
      <Panel title="Recording Defaults" subtitle="Control automatic zoom generation and baseline style defaults">
        <label className="field checkbox-field">
          <input
            type="checkbox"
            checked={settings.createZoomsAutomatically}
            onChange={(event) => mutation.mutate({ createZoomsAutomatically: event.target.checked })}
          />
          <span>Create zooms automatically from recording events</span>
        </label>
        <label className="field">
          <span>Default background type</span>
          <select
            className="text-input"
            value={settings.defaults.background.type}
            onChange={(event) =>
              mutation.mutate({
                defaults: {
                  ...settings.defaults,
                  background: {
                    ...settings.defaults.background,
                    type: event.target.value as AppSettings["defaults"]["background"]["type"]
                  }
                }
              })
            }
          >
            <option value="wallpaper">Wallpaper</option>
            <option value="gradient">Gradient</option>
            <option value="color">Color</option>
            <option value="image">Image</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="field">
          <span>Default cursor size</span>
          <input
            className="text-input"
            type="range"
            min={0.5}
            max={3}
            step={0.05}
            value={settings.defaults.cursor.size}
            onChange={(event) =>
              mutation.mutate({
                defaults: {
                  ...settings.defaults,
                  cursor: {
                    ...settings.defaults.cursor,
                    size: Number(event.target.value)
                  }
                }
              })
            }
          />
        </label>
        <label className="field">
          <span>Default export FPS</span>
          <select
            className="text-input"
            value={settings.defaults.export.fps}
            onChange={(event) =>
              mutation.mutate({
                defaults: {
                  ...settings.defaults,
                  export: {
                    ...settings.defaults.export,
                    fps: Number(event.target.value) as 30 | 60
                  }
                }
              })
            }
          >
            <option value={60}>60</option>
            <option value={30}>30</option>
          </select>
        </label>
        {status && <p className="tiny-note">{status}</p>}
      </Panel>
    </div>
  );
}

