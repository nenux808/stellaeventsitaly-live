"use client";

import { useMemo, useState } from "react";
import Scanner from "./Scanner";

type CheckinResponse = {
  ok?: boolean;
  reason?: string;
  checked_in_at?: string;
  event?: { title?: string; venue?: string; start_at?: string } | null;
  ticketType?: { name?: string } | null;
  error?: string;
  message?: string;
  details?: any;
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

  // Scanner
  const [scannerOn, setScannerOn] = useState(false);

  // analytics (optional)
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [eventId, setEventId] = useState("");
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  const statusLabel = useMemo(() => {
    if (!res) return null;

    const msg =
      res.message ||
      (typeof res.details === "string" ? res.details : null) ||
      res.error;

    if (res.ok) return { text: "✅ Check-in successful", type: "good" as const };

    if (res.reason === "ALREADY_USED") return { text: "⚠️ Already used", type: "warn" as const };
    if (res.reason === "INVALID_TICKET") return { text: msg || "❌ Invalid ticket", type: "bad" as const };
    if (res.reason === "NOT_ACTIVE") return { text: msg || "❌ Ticket not active", type: "bad" as const };
    if (res.reason === "UNAUTHORIZED") return { text: msg || "🔒 Wrong PIN", type: "bad" as const };

    return { text: msg || "❌ Check-in failed", type: "bad" as const };
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

      if (eventId) refreshAnalytics(eventId);
    } catch (e: any) {
      setRes({ error: e?.message || "Network error" });
    } finally {
      setLoading(false);
    }
  }

  async function refreshAnalytics(eid: string) {
    setAnalyticsLoading(true);
    try {
      const r = await fetch(`/api/checkin/stats?eventId=${encodeURIComponent(eid)}`);
      const data = await r.json();
      setAnalytics(data);
    } catch {
      setAnalytics(null);
    } finally {
      setAnalyticsLoading(false);
    }
  }

  return (
    <main style={wrap}>
      {/* Main check-in card */}
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
            inputMode="numeric"
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
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => doCheckin()} disabled={loading} style={btnPrimary} type="button">
            {loading ? "Checking..." : "Check In"}
          </button>

          <button onClick={() => setScannerOn(true)} style={btnSecondary} type="button" disabled={loading}>
            Scan QR
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

        {/* Scanner */}
        {scannerOn ? (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>
              Point the camera at the QR code
            </div>

            <Scanner
              onToken={async (t) => {
                setToken(t);
                setScannerOn(false);
                await doCheckin(t);
              }}
              onClose={() => setScannerOn(false)}
            />

            <button onClick={() => setScannerOn(false)} style={{ ...btnGhost, marginTop: 10 }} type="button">
              Close Scanner
            </button>
          </div>
        ) : null}

        {/* Result */}
        {statusLabel ? (
          <div
            style={{
              ...resultBox,
              ...(statusLabel.type === "good" ? good : statusLabel.type === "warn" ? warn : bad),
            }}
          >
            <div style={{ fontWeight: 950 }}>{statusLabel.text}</div>

            {res?.event?.title ? (
              <div style={{ marginTop: 8, opacity: 0.9 }}>
                <div>
                  <b>Event:</b> {res.event.title}
                </div>
                {res.ticketType?.name ? (
                  <div>
                    <b>Ticket:</b> {res.ticketType.name}
                  </div>
                ) : null}
                {res.event?.venue ? (
                  <div>
                    <b>Venue:</b> {res.event.venue}
                  </div>
                ) : null}
                {res.event?.start_at ? (
                  <div>
                    <b>Time:</b> {new Date(res.event.start_at).toLocaleString("en-GB")}
                  </div>
                ) : null}
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
          <input
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
            placeholder="UUID..."
            style={input}
            autoCapitalize="none"
            autoCorrect="off"
          />
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => eventId && refreshAnalytics(eventId)}
            disabled={!eventId || analyticsLoading}
            style={btnSecondary}
            type="button"
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
          <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>No stats loaded yet.</div>
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

const statCard: React.CSSProperties = {
  border: "1px solid #23232b",
  borderRadius: 16,
  padding: 12,
  background: "rgba(0,0,0,0.25)",
};