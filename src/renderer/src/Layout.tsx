// Shared app chrome — the part of the old Next.js app/layout.tsx that wrapped
// every page: the TopBar nav, the <main> content well, the new-order /
// new-follower celebrations, and the silent background AutoSync. Lives inside
// the router (TopBar uses useLocation) and renders the active route as children.

import { useEffect, useState, type ReactNode } from "react";
import { TopBar } from "./components/TopBar";
import { NewOrderCelebration } from "./components/NewOrderCelebration";
import { NewFollowerCelebration } from "./components/NewFollowerCelebration";
import { AutoSync } from "./components/AutoSync";
import { UpdateBanner } from "./components/UpdateBanner";

interface SettingsResp {
  general?: {
    useMockData?: boolean;
    celebrateNewOrders?: boolean;
    celebrateNewFollowers?: boolean;
  };
}

export default function Layout({ children }: { children: ReactNode }) {
  const [celebrate, setCelebrate] = useState(false);
  const [celebrateFollowers, setCelebrateFollowers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: SettingsResp | null) => {
        if (cancelled || !s?.general) return;
        const mock = s.general.useMockData ?? true;
        setCelebrate(!mock && Boolean(s.general.celebrateNewOrders));
        setCelebrateFollowers(!mock && Boolean(s.general.celebrateNewFollowers));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <UpdateBanner />
      <TopBar />
      <main className="dl-main">{children}</main>
      <NewOrderCelebration enabled={celebrate} />
      <NewFollowerCelebration enabled={celebrateFollowers} />
      {/* Silent background auto-sync — renders nothing, fires on load if stale */}
      <AutoSync />
    </>
  );
}
