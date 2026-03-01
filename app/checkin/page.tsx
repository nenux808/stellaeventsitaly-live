"use client";

import { useEffect, useMemo, useState } from "react";

type CheckinResponse = {
  ok?: boolean;
  reason?: string;
  checked_in_at?: string;
  event?: { title?: string; venue?: string; start_at?: string } | null;
  ticketType?: { name?: string } | null;
  error?: string;
};

type Analytics = {
  ok: true;
  sold: number;
  checkedIn: number;
  left: number | null;
  event?: { id: string; title: string } | null;
};

export default function CheckinPage() {
  const [token, setToken] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<CheckinResponse | null>(null);

  // QR scanner
  const [scannerOn, setScannerOn] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // analytics (optional)
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [eventId, setEventId] = useState(""); // you can paste event id here
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const statusLabel = useMemo(() => {
    if (!res) return null;
    if (res.error) return { text: res.error, type: "bad" as const };
    if (res.ok) return { text: "✅ Check-in successful", type: "good" as const };
    if (res.reason === "ALREADY_USED") return { text: "⚠️ Already used", type: "warn" as const };
    if (res.reason === "INVALID_TICKET") return { text: "❌ Invalid ticket", type: "bad" as const };
    if (res.reason === "NOT_ACTIVE") return { text: "❌ Ticket not active", type: "bad" as const };
    if (res.reason === "UNAUTHORIZED") return { text: "🔒 Wrong PIN", type: "bad" as const };
    return { text: "❌ Check-in failed", type: "bad" as const };
  }, [res]);

  async function doCheckin(scannedToken?: string) {
    const useToken = (scannedToken ?? token).trim();
    if (!useToken) return;

    setLoading(true);
    setRes(null);
    try {
      const r = await fetch("/api/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: useToken, pin: pin || undefined }),
      });
      const data = await r.json();
      setRes(data);
      // auto refresh analytics after scan
      if (eventId) refreshAnalytics(eventId);
    } catch (e: any) {
      setRes({ error: e.message || "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function refreshAnalytics(eid: string) {
    setAnalyticsLoading(true);
    try {
      const r = await fetch(`/api/checkin/stats?eventId=${encodeURIComponent(eid)}`, {
        method: "GET",
      });
      const data = await r.json();
      setAnalytics(data);
    } catch (e: any) {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  // Camera scanner (BarcodeDetector)
  useEffect(() => {
    if (!scannerOn) return;

    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;

    async function start() {
      setScanError(null);

      if (!("mediaDevices" in navigator) || !navigator.mediaDevices.getUserMedia) {
        setScanError("Camera not supported in this browser.");
        return;
      }

      // BarcodeDetector is supported in Chrome/Android, some others
      // If not supported, we’ll show a fallback message.
      const BD = (window as any).BarcodeDetector;
      if (!BD) {
        setScanError("Barcode scanner not supported here. Use paste token method.");
        return;
      }

      const detector = new BD({ formats: ["qr_code"] });

      const video = document.getElementById("qr-video") as HTMLVideoElement | null;
      if (!video) return;

      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });

      video.srcObject = stream;
      await video.play();

      const scan = async () => {
        if (stopped) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes?.length) {
            const value = barcodes[0]?.rawValue;
            if (value) {
              setToken(value);
              setScannerOn(false);
              await doCheckin(value);
              return;
            }
          }
        } catch {
          // ignore frame errors
        }
        raf = requestAnimationFrame(scan);
      };

      raf = requestAnimationFrame(scan);
    }

    start().catch((e) => setScanError(e.message || "Scanner error"));

    return () => {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scannerOn]);

  return (
    <main style={wrap}>
      <div style={card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, letterSpacing: 1 }}>STELLA EVENTS</div>
            <h1 style={{ margin: "6px 0 0", fontSize: 22, fontWeight: 950 }}>Gate Check-in</h1>
          </div>
          <a href="/" style={{ color: "white", opacity: 0.85, textDecoration: "none" }}>
            ← Home
          </a>
        </div>

        {/* PIN */}
        <div style={{ marginTop: 14 }}>
          <label style={label}>Gate PIN (if enabled)</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Enter PIN"
            style={input}
          />
        </div>

        {/* Token */}
        <div style={{ marginTop: 14 }}>
          <label style={label}>Ticket Token</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste token from QR / email"
            style={input}
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => doCheckin()} disabled={loading} style={btnPrimary}>
            {loading ? "Checking..." : "Check In"}
          </button>

          <button onClick={() => setScannerOn((v) => !v)} style={btnSecondary} type="button">
            {scannerOn ? "Stop Scanner" : "Scan QR"}
          </button>

          <button
            onClick={() => {
              setToken("");
              setRes(null);
            }}
            style={btnGhost}
            type="button"
          >
            Reset
          </button>
        </div>

        {/* Scanner UI */}
        {scannerOn ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              Point the camera at the QR code
            </div>
            <div style={videoWrap}>
              <video id="qr-video" style={video} playsInline muted />
              <div style={scanBox} />
            </div>
            {scanError ? <div style={{ marginTop: 10, color: "#ff6b6b" }}>{scanError}</div> : null}
          </div>
        ) : null}

        {/* Result */}
        {statusLabel ? (
          <div style={{ ...resultBox, ...(statusLabel.type === "good" ? good : statusLabel.type === "warn" ? warn : bad) }}>
            <div style={{ fontWeight: 950 }}>{statusLabel.text}</div>

            {res?.event?.title ? (
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                <div><b>Event:</b> {res.event.title}</div>
                {res.ticketType?.name ? <div><b>Ticket:</b> {res.ticketType.name}</div> : null}
                {res.event?.venue ? <div><b>Venue:</b> {res.event.venue}</div> : null}
                {res.event?.start_at ? <div><b>Time:</b> {new Date(res.event.start_at).toLocaleString("en-GB")}</div> : null}
                {res.checked_in_at ? (
                  <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                    <b>Checked in at:</b> {new Date(res.checked_in_at).toLocaleString("en-GB")}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Analytics panel */}
      <div style={card}>
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>Live Analytics (Optional)</h2>
        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
          Paste an <b>event ID</b> to see Sold / Checked-in / Left.
        </div>

        <div style={{ marginTop: 10 }}>
          <label style={label}>Event ID</label>
          <input value={eventId} onChange={(e) => setEventId(e.target.value)} placeholder="UUID..." style={input} />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => eventId && refreshAnalytics(eventId)}
            disabled={!eventId || analyticsLoading}
            style={btnSecondary}
          >
            {analyticsLoading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {analytics?.ok ? (
          <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 }}>
            <Stat label="Sold" value={analytics.sold} />
            <Stat label="Checked-in" value={analytics.checkedIn} />
            <Stat label="Left" value={analytics.left ?? "∞"} />
          </div>
        ) : (
          <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>
            No stats loaded yet.
          </div>
        )}
      </div>

      <style>{`
        @media (max-width: 760px) {
          main { padding: 16px !important; }
        }
      `}</style>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={statCard}>
      <div style={{ fontSize: 12, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 950, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const wrap: React.CSSProperties = {
  minHeight: "100vh",
  background: "#0b0b0f",
  color: "white",
  padding: 24,
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
  gap: 16,
  maxWidth: 900,
  margin: "0 auto",
};

const card: React.CSSProperties = {
  border: "1px solid #23232b",
  borderRadius: 18,
  padding: 18,
  background: "rgba(255,255,255,0.02)",
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  opacity: 0.85,
  marginBottom: 6,
};

const input: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  border: "1px solid #2b2b33",
  background: "#111118",
  color: "white",
};

const btnPrimary: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "none",
  cursor: "pointer",
  fontWeight: 950,
  background: "white",
  color: "black",
};

const btnSecondary: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.25)",
  cursor: "pointer",
  fontWeight: 950,
  background: "rgba(255,255,255,0.04)",
  color: "white",
};

const btnGhost: React.CSSProperties = {
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.12)",
  cursor: "pointer",
  fontWeight: 950,
  background: "transparent",
  color: "white",
  opacity: 0.9,
};

const resultBox: React.CSSProperties = {
  marginTop: 14,
  borderRadius: 16,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.12)",
};

const good: React.CSSProperties = { background: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.35)" };
const warn: React.CSSProperties = { background: "rgba(245,158,11,0.12)", borderColor: "rgba(245,158,11,0.35)" };
const bad: React.CSSProperties = { background: "rgba(239,68,68,0.12)", borderColor: "rgba(239,68,68,0.35)" };

const videoWrap: React.CSSProperties = {
  position: "relative",
  borderRadius: 16,
  overflow: "hidden",
  border: "1px solid #23232b",
  background: "#000",
  aspectRatio: "16/10",
};

const video: React.CSSProperties = {
  width: "100%",
  height: "100%",
  objectFit: "cover",
};

const scanBox: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  margin: "auto",
  width: "65%",
  height: "65%",
  border: "2px solid rgba(255,255,255,0.9)",
  borderRadius: 18,
  boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)",
};

const statCard: React.CSSProperties = {
  border: "1px solid #23232b",
  borderRadius: 16,
  padding: 12,
  background: "rgba(0,0,0,0.25)",
};