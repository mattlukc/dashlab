
import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import kaChing from "../assets/chaching.mp3";

interface LatestOrder {
  id: string;
  orderNumber: string;
  customerName: string | null;
  channel: string;
  storeName: string | null;
  sales: number;
  totalItems: number;
  createdAt: string;
}

interface Props {
  /** Whether the celebration is enabled. Pulled from settings server-side. */
  enabled: boolean;
}

/** Play the ka-ching sound effect from /public/chaching.mp3 */
function playKaChing() {
  try {
    const audio = new Audio(kaChing);
    audio.volume = 0.85;
    audio.play().catch(() => {
      // Autoplay might be blocked until user interacts with the page
    });
  } catch {
    // silent fail
  }
}

function fireConfetti() {
  // Brand-colored: Neat Orange + Slate Dark + white
  const colors = ["#EC6B23", "#2F2F2F", "#FFFFFF"];
  confetti({
    particleCount: 120,
    spread: 80,
    startVelocity: 45,
    origin: { y: 0.5 },
    colors,
  });
  setTimeout(() => {
    confetti({
      particleCount: 60,
      angle: 60,
      spread: 55,
      origin: { x: 0, y: 0.6 },
      colors,
    });
    confetti({
      particleCount: 60,
      angle: 120,
      spread: 55,
      origin: { x: 1, y: 0.6 },
      colors,
    });
  }, 200);
}

function channelLabel(channel: string): string {
  switch (channel) {
    case "shopify":
      return "Shopify";
    case "amazon_fbm":
      return "Amazon FBM";
    case "amazon_fba":
      return "Amazon FBA";
    case "etsy":
      return "Etsy";
    case "ebay":
      return "eBay";
    case "manual":
      return "Manual";
    default:
      return "Other";
  }
}

export function NewOrderCelebration({ enabled }: Props) {
  const [popup, setPopup] = useState<LatestOrder | null>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;

    async function checkLatest() {
      try {
        const res = await fetch("/api/orders/latest", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { order: LatestOrder | null };
        if (cancelled || !data.order) return;
        const order = data.order;

        if (initialLoadRef.current) {
          // First load — record current latest, don't celebrate
          initialLoadRef.current = false;
          lastSeenIdRef.current = order.id;
          return;
        }

        if (lastSeenIdRef.current !== order.id) {
          lastSeenIdRef.current = order.id;
          setPopup(order);
          fireConfetti();
          playKaChing();
          // Auto-dismiss
          setTimeout(() => {
            if (!cancelled) setPopup(null);
          }, 8000);
        }
      } catch {
        // network errors — swallow
      }
    }

    // Initial probe + poll every 15s
    checkLatest();
    const t = setInterval(checkLatest, 15_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [enabled]);

  function triggerTest() {
    setPopup({
      id: "test",
      orderNumber: "TEST",
      customerName: "Test Customer",
      channel: "shopify",
      storeName: "Shopify",
      sales: 42.0,
      totalItems: 3,
      createdAt: new Date().toISOString(),
    });
    fireConfetti();
    playKaChing();
    setTimeout(() => setPopup((p) => (p?.id === "test" ? null : p)), 8000);
  }

  return (
    <>
      {enabled && (
        <button
          onClick={triggerTest}
          className="dl-celebration-test"
          aria-label="Test celebration animation"
          title="Test new-order celebration"
        >
          🎉
          <style>{`
            .dl-celebration-test {
              position: fixed;
              bottom: 16px;
              right: 16px;
              z-index: 9998;
              width: 44px;
              height: 44px;
              border-radius: 50%;
              background: var(--dl-primary);
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
            .dl-celebration-test:hover {
              transform: scale(1.1);
            }
          `}</style>
        </button>
      )}
      {popup && (
        <CelebrationOverlay popup={popup} onDismiss={() => setPopup(null)} />
      )}
    </>
  );
}

function CelebrationOverlay({
  popup,
  onDismiss,
}: {
  popup: LatestOrder;
  onDismiss: () => void;
}) {
  return (
    <div
      className="dl-celebration"
      onClick={onDismiss}
      role="dialog"
      aria-label="New order"
    >
      <div className="dl-celebration-card">
        <div className="dl-celebration-eyebrow">New Order!</div>
        <div className="dl-celebration-amount">
          ${Math.round(popup.sales).toLocaleString()}
        </div>
        <div className="dl-celebration-meta">
          <span className="dl-celebration-order">#{popup.orderNumber}</span>
          <span className="dl-celebration-divider">·</span>
          <span>{popup.customerName ?? "Unknown"}</span>
        </div>
        <div className="dl-celebration-channel">
          {popup.storeName ?? channelLabel(popup.channel)} ·{" "}
          {popup.totalItems} item{popup.totalItems === 1 ? "" : "s"}
        </div>
        <div className="dl-celebration-tip">Click to dismiss</div>
      </div>
      <style>{`
        .dl-celebration {
          position: fixed;
          inset: 0;
          z-index: 10000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.25);
          backdrop-filter: blur(2px);
          animation: dl-fade-in 0.25s ease-out;
          cursor: pointer;
        }
        @keyframes dl-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .dl-celebration-card {
          background: #fff;
          border: 4px solid #EC6B23;
          border-radius: 14px;
          padding: 36px 56px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0,0,0,0.25);
          animation: dl-pop 0.45s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-family: inherit;
        }
        @keyframes dl-pop {
          from { transform: scale(0.5); opacity: 0; }
          to   { transform: scale(1);   opacity: 1; }
        }
        .dl-celebration-eyebrow {
          font-size: 22px;
          font-weight: 900;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #EC6B23;
          margin-bottom: 10px;
        }
        .dl-celebration-amount {
          font-size: 84px;
          font-weight: 900;
          color: #2F2F2F;
          line-height: 1;
          margin-bottom: 14px;
          font-variant-numeric: tabular-nums;
        }
        .dl-celebration-meta {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          font-size: 18px;
          font-weight: 700;
          color: #2F2F2F;
        }
        .dl-celebration-order { color: #EC6B23; }
        .dl-celebration-divider { color: #999; }
        .dl-celebration-channel {
          margin-top: 8px;
          font-size: 14px;
          font-weight: 600;
          color: #6d7175;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .dl-celebration-tip {
          margin-top: 20px;
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #999;
        }
      `}</style>
    </div>
  );
}
