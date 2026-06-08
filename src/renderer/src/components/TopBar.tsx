
import { Link, useLocation } from "react-router-dom";
import { RefreshButton } from "./RefreshButton";
import { TvButton } from "./TvButton";
import { PrivacyToggle } from "./PrivacyToggle";
import { SyncStatus } from "./SyncStatus";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Orders", href: "/orders" },
  { label: "Settings", href: "/settings" },
];

export function TopBar() {
  const pathname = useLocation().pathname;

  // TV / kiosk page hides all nav chrome.
  if (pathname?.startsWith("/tv")) return null;

  return (
    <header className="dl-topbar">
      <Link to="/" className="dl-logo">
        <span className="dl-logo-dot" />
        DashLab
      </Link>

      <nav className="dl-nav">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname?.startsWith(item.href);
          return (
            <Link
              key={item.label}
              to={item.href}
              className={isActive ? "active" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
        <SyncStatus />
        <PrivacyToggle />
        <RefreshButton />
        <TvButton />
      </div>
    </header>
  );
}
