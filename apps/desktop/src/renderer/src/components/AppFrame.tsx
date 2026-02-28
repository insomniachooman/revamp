import { Folder, Settings, Video } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
};

const NAV_ITEMS: NavItem[] = [
  { to: "/", label: "Projects", icon: Folder },
  { to: "/record", label: "Record", icon: Video },
  { to: "/settings", label: "Settings", icon: Settings }
];

export function AppFrame() {
  const location = useLocation();
  const isStudioMode = location.pathname.startsWith("/studio");

  return (
    <div className={`app-shell ${isStudioMode ? "app-shell-studio" : ""}`}>
      <aside className="shell-sidebar">
        <div className="brand-stack">
          <p className="brand-eyebrow">Windows Creator Suite</p>
          <h1 className="brand-title">REVAMP</h1>
          <p className="brand-subtitle">screen recordings with editorial-grade motion focus</p>
          <span className="brand-monogram" aria-hidden>
            R
          </span>
        </div>
        <nav className="side-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              title={isStudioMode ? item.label : undefined}
              aria-label={isStudioMode ? item.label : undefined}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              <item.icon className="side-link-icon" aria-hidden />
              <span className="side-link-label">{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-meta">
          <p>Mode</p>
          <strong>{isStudioMode ? "Editing Studio" : "Navigation"}</strong>
        </div>
      </aside>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}

