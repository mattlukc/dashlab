
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import gruntSound from "../assets/grunt-headshot.mp3";

interface Props {
  enabled: boolean;
}

type Platform = "youtube" | "facebook" | "instagram";

interface Pop {
  platform: Platform;
  delta: number;
  total: number;
}

const META: Record<
  Platform,
  { label: string; color: string; suffix: string; icon: string }
> = {
  youtube: {
    label: "YouTube",
    color: "#FF0033",
    suffix: "subscriber",
    icon: "M21.6 7.2c-.2-1.4-.9-2.4-2.3-2.6C16.9 4.2 12 4.2 12 4.2s-4.9 0-7.3.4c-1.4.2-2.1 1.2-2.3 2.6C2 9.4 2 12 2 12s0 2.6.4 4.8c.2 1.4.9 2.4 2.3 2.6 2.4.4 7.3.4 7.3.4s4.9 0 7.3-.4c1.4-.2 2.1-1.2 2.3-2.6.4-2.2.4-4.8.4-4.8s0-2.6-.4-4.8zM10 15.5v-7l6 3.5-6 3.5z",
  },
  facebook: {
    label: "Facebook",
    color: "#1877F2",
    suffix: "follower",
    icon: "M22 12c0-5.5-4.5-10-10-10S2 6.5 2 12c0 5 3.7 9.1 8.4 9.9v-7H7.9V12h2.5V9.8c0-2.5 1.5-3.9 3.8-3.9 1.1 0 2.2.2 2.2.2v2.5h-1.3c-1.2 0-1.6.8-1.6 1.6V12h2.8l-.4 2.9h-2.3v7C18.3 21.1 22 17 22 12z",
  },
  instagram: {
    label: "Instagram",
    color: "#E1306C",
    suffix: "follower",
    icon: "M12 2.2c3.2 0 3.6 0 4.8.1 1.2 0 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.9.9 1.4.2.4.4 1.1.4 2.2.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c0 1.2-.2 1.8-.4 2.2-.2.6-.5 1-.9 1.4-.4.4-.9.7-1.4.9-.4.2-1.1.4-2.2.4-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-1.2 0-1.8-.2-2.2-.4-.6-.2-1-.5-1.4-.9-.4-.4-.7-.9-.9-1.4-.2-.4-.4-1.1-.4-2.2-.1-1.3-.1-1.6-.1-4.8s0-3.6.1-4.8c0-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.9-.7 1.4-.9.4-.2 1.1-.4 2.2-.4 1.2-.1 1.6-.1 4.8-.1M12 0C8.7 0 8.3 0 7.1.1 5.8.1 4.9.3 4.2.6c-.8.3-1.5.7-2.2 1.4S.9 3.4.6 4.2C.3 4.9.1 5.8.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.1 1.2.3 2.1.6 2.9.3.8.7 1.5 1.4 2.2.7.7 1.4 1.1 2.2 1.4.7.3 1.6.5 2.9.6 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c1.2-.1 2.1-.3 2.9-.6.8-.3 1.5-.7 2.2-1.4.7-.7 1.1-1.4 1.4-2.2.3-.7.5-1.6.6-2.9.1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.1-1.2-.3-2.1-.6-2.9-.3-.8-.7-1.5-1.4-2.2-.7-.7-1.4-1.1-2.2-1.4-.7-.3-1.6-.5-2.9-.6C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zm0 10.2a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z",
  },
};

function playSound() {
  try {
    const audio = new Audio(gruntSound);
    audio.volume = 0.85;
    audio.play().catch(() => {});
  } catch {
    /* swallow */
  }
}

function fireConfetti(color: string) {
  const colors = [color, "#EC6B23", "#FFFFFF"];
  confetti({
    particleCount: 100,
    spread: 80,
    startVelocity: 40,
    origin: { y: 0.5 },
    colors,
  });
  setTimeout(() => {
    confetti({
      particleCount: 50,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 50,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
    });
  }, 200);
}

const STORAGE_KEY = "dl-last-seen-followers";

function loadBaseline(): Record<Platform, number | null> {
  if (typeof window === "undefined") {
    return { youtube: null, facebook: null, instagram: null };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { youtube: null, facebook: null, instagram: null };
    const parsed = JSON.parse(raw) as Partial<Record<Platform, number>>;
    return {
      youtube: typeof parsed.youtube === "number" ? parsed.youtube : null,
      facebook: typeof parsed.facebook === "number" ? parsed.facebook : null,
      instagram:
        typeof parsed.instagram === "number" ? parsed.instagram : null,
    };
  } catch {
    return { youtube: null, facebook: null, instagram: null };
  }
}

function saveBaseline(b: Record<Platform, number | null>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(b));
  } catch {
    /* swallow */
  }
}

export function NewFollowerCelebration({ enabled }: Props) {
  const [popup, setPopup] = useState<Pop | null>(null);
  const lastSeenRef = useRef<Record<Platform, number | null>>({
    youtube: null,
    facebook: null,
    instagram: null,
  });
  const hydratedRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    // Hydrate baseline from localStorage on first mount so we can detect
    // followers gained while the page was closed.
    if (!hydratedRef.current) {
      lastSeenRef.current = loadBaseline();
      hydratedRef.current = true;
    }

    async function check() {
      try {
        const res = await fetch("/api/social/current", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as Record<Platform, number | null>;
        if (cancelled) return;

        const platforms: Platform[] = ["youtube", "facebook", "instagram"];
        for (const p of platforms) {
          const prev = lastSeenRef.current[p];
          const now = data[p];
          if (now != null && prev != null && now > prev) {
            const delta = now - prev;
            setPopup({ platform: p, delta, total: now });
            fireConfetti(META[p].color);
            playSound();
            setTimeout(() => {
              if (!cancelled) setPopup(null);
            }, 8000);
          }
          if (now != null) lastSeenRef.current[p] = now;
        }
        saveBaseline(lastSeenRef.current);
      } catch {
        // swallow
      }
    }

    check();
    const t = setInterval(check, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  function triggerTest() {
    const platforms: Platform[] = ["youtube", "facebook", "instagram"];
    const platform = platforms[Math.floor(Math.random() * platforms.length)];
    const delta = Math.floor(Math.random() * 5) + 1;
    const total = Math.floor(Math.random() * 50000) + 1000;
    const test: Pop = { platform, delta, total };
    setPopup(test);
    fireConfetti(META[platform].color);
    playSound();
    setTimeout(() => setPopup((p) => (p === test ? null : p)), 8000);
  }

  return (
    <>
      {enabled && (
        <button
          onClick={triggerTest}
          className="dl-fol-test-btn"
          aria-label="Test follower celebration"
          title="Test new follower celebration"
        >
          👥
          <style>{`
            .dl-fol-test-btn {
              position: fixed;
              bottom: 70px;
              right: 16px;
              z-index: 9997;
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: #1877F2;
              color: #fff;
              border: 2px solid #fff;
              box-shadow: 0 4px 14px rgba(0,0,0,0.2);
              font-size: 20px;
              cursor: pointer;
              display: inline-flex;
              align-items: center;
              justify-content: center;
              transition: transform 0.15s;
            }
            .dl-fol-test-btn:hover { transform: scale(1.1); }
          `}</style>
        </button>
      )}
      {popup && <FollowerPopup popup={popup} onDismiss={() => setPopup(null)} />}
    </>
  );
}

function FollowerPopup({
  popup,
  onDismiss,
}: {
  popup: Pop;
  onDismiss: () => void;
}) {
  const m = META[popup.platform];
  const word =
    popup.delta === 1
      ? m.suffix
      : m.suffix === "subscriber"
        ? "subscribers"
        : "followers";
  return (
    <div
      className="dl-fol-celebration"
      onClick={onDismiss}
      role="dialog"
      aria-label="New follower"
    >
      <div className="dl-fol-card" style={{ borderColor: m.color }}>
        <div className="dl-fol-icon" style={{ background: m.color }}>
          <svg width="44" height="44" viewBox="0 0 24 24" fill="#fff">
            <path d={m.icon} />
          </svg>
        </div>
        <div className="dl-fol-eyebrow" style={{ color: m.color }}>
          NEW {m.label.toUpperCase()} {word.toUpperCase()}!
        </div>
        <div className="dl-fol-amount">+{popup.delta}</div>
        <div className="dl-fol-total">
          Total: <strong>{popup.total.toLocaleString()}</strong>
        </div>
        <div className="dl-fol-tip">Click to dismiss</div>
      </div>
      <style>{`
        .dl-fol-celebration {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0,0,0,0.25);
          backdrop-filter: blur(2px);
          animation: dl-fol-fade 0.25s ease-out;
          cursor: pointer;
        }
        @keyframes dl-fol-fade { from { opacity: 0; } to { opacity: 1; } }
        .dl-fol-card {
          background: #fff;
          border: 4px solid;
          border-radius: 14px;
          padding: 30px 48px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          animation: dl-fol-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        @keyframes dl-fol-pop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .dl-fol-icon {
          width: 72px;
          height: 72px;
          border-radius: 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 16px;
        }
        .dl-fol-eyebrow {
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.12em;
          margin-bottom: 10px;
        }
        .dl-fol-amount {
          font-size: 84px;
          font-weight: 900;
          color: #2F2F2F;
          line-height: 1;
          margin-bottom: 14px;
        }
        .dl-fol-total {
          font-size: 18px;
          font-weight: 700;
          color: #2F2F2F;
        }
        .dl-fol-total strong { color: #EC6B23; }
        .dl-fol-tip {
          margin-top: 18px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #999;
        }
      `}</style>
    </div>
  );
}
