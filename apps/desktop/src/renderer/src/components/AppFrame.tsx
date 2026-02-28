import { NavLink, Outlet, useLocation } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/", label: "Projects" },
  { to: "/record", label: "Record" },
  { to: "/settings", label: "Settings" }
];

export function AppFrame() {
  const location = useLocation();

  return (
    <div className="app-shell">
      <aside className="shell-sidebar">
        <div className="brand-stack">
          <p className="brand-eyebrow">Windows Creator Suite</p>
          <h1 className="brand-title">REVAMP</h1>
          <p className="brand-subtitle">screen recordings with editorial-grade motion focus</p>
        </div>
        <nav className="side-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) => `side-link ${isActive ? "active" : ""}`}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-meta">
          <p>Mode</p>
          <strong>{location.pathname.startsWith("/studio") ? "Editing Studio" : "Navigation"}</strong>
        </div>
      </aside>
      <main className="shell-main">
        <Outlet />
      </main>
    </div>
  );
}

