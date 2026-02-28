import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "../components/Panel";
import { formatDurationMs, formatRelativeTime } from "../utils/format";

type ProjectSummary = { id: string; name: string; updatedAt: string; durationMs: number };

export function HomePage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const projectsQuery = useQuery<ProjectSummary[]>({
    queryKey: ["projects"],
    queryFn: () => window.revamp.project.list()
  });

  const projects = useMemo(() => {
    const all = projectsQuery.data ?? [];
    if (!query.trim()) return all;
    return all.filter((project) => project.name.toLowerCase().includes(query.trim().toLowerCase()));
  }, [projectsQuery.data, query]);

  return (
    <div className="page-grid">
      <Panel
        title="Project Library"
        subtitle="Open, revisit, and export previous recordings"
        rightSlot={
          <button className="btn btn-accent" onClick={() => navigate("/record")}>
            New Recording
          </button>
        }
      >
        <div className="toolbar-row">
          <input
            className="text-input"
            placeholder="Search projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button className="btn" onClick={() => projectsQuery.refetch()}>
            Refresh
          </button>
        </div>
        <div className="project-table">
          <div className="project-row project-row-head">
            <span>Name</span>
            <span>Duration</span>
            <span>Updated</span>
            <span>Action</span>
          </div>
          {projects.map((project) => (
            <div key={project.id} className="project-row">
              <span>{project.name}</span>
              <span>{formatDurationMs(project.durationMs)}</span>
              <span>{formatRelativeTime(project.updatedAt)}</span>
              <span>
                <button className="btn" onClick={() => navigate(`/studio/${project.id}`)}>
                  Open Studio
                </button>
              </span>
            </div>
          ))}
          {projects.length === 0 && (
            <div className="empty-state">
              <p>No recordings yet. Start with your first screen capture.</p>
              <button className="btn btn-accent" onClick={() => navigate("/record")}>
                Launch Recorder
              </button>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="Feature Pack" subtitle="Built-in tools included in this build">
        <div className="chip-grid">
          {[
            "Auto / Manual / Instant Zoom",
            "Zoom timeline blocks",
            "Background: wallpaper/gradient/color/image",
            "Cursor behavior suite",
            "Trim + Crop + Speed controls",
            "Masks + Highlights",
            "Style Presets",
            "Local-first project autosave",
            "MP4 export"
          ].map((feature) => (
            <span key={feature} className="chip">
              {feature}
            </span>
          ))}
        </div>
      </Panel>
    </div>
  );
}

