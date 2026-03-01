"use client";

import { useEffect, useMemo, useState } from "react";

type TicketType = {
  id: string;
  name: string;
  price_cents: number;
  currency?: string;
  capacity: number;
  // ✅ optional: if Event page passes this, we can enforce capacity UX
  tickets_left?: number | null;
};

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

export default function BuyTickets({
  eventId,
  ticketTypes,
}: {
  eventId: string;
  ticketTypes: TicketType[];
}) {
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes?.[0]?.id || "");
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => ticketTypes.find((t) => t.id === ticketTypeId),
    [ticketTypes, ticketTypeId]
  );

  // ✅ if tickets_left is available, enforce max buy quantity
  const maxAllowed = useMemo(() => {
    const left = selected?.tickets_left;
    if (typeof left === "number") return Math.max(0, Math.min(10, left));
    return 10; // fallback old behavior
  }, [selected?.tickets_left]);

  const soldOut = useMemo(() => {
    const left = selected?.tickets_left;
    return typeof left === "number" ? left <= 0 : false;
  }, [selected?.tickets_left]);

  // ✅ keep quantity always valid if switching ticket type
  useEffect(() => {
    setQuantity((q) => {
      if (maxAllowed <= 0) return 1;
      return Math.max(1, Math.min(q, maxAllowed));
    });
  }, [maxAllowed, ticketTypeId]);

  // ✅ fix if price_cents comes as string (just in case)
  const priceNum = selected ? Number(selected.price_cents) : 0;
  const total = selected ? priceNum * quantity : 0;

  async function checkout() {
    setErr(null);

    if (!ticketTypeId) return setErr("Select a ticket type.");
    if (!buyerEmail.includes("@")) return setErr("Enter a valid email.");
    if (quantity < 1) return setErr("Quantity must be at least 1.");

    // ✅ capacity guard UX
    if (soldOut) return setErr("This ticket type is sold out.");
    if (quantity > maxAllowed) return setErr(`Only ${maxAllowed} ticket(s) left.`);

    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, ticketTypeId, quantity, buyerEmail, buyerName }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      window.location.href = data.url;
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="buy-box"
      style={{
        position: "sticky",
        top: 18,
        border: "1px solid #23232b",
        borderRadius: 18,
        padding: 18,
        background: "rgba(255,255,255,0.02)",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>Checkout</h2>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Secure payment</div>
      </div>

      <label style={label}>Ticket type</label>
      <select value={ticketTypeId} onChange={(e) => setTicketTypeId(e.target.value)} style={field}>
        {ticketTypes.map((t) => {
          const left = (t as any).tickets_left;
          const isSoldOut = typeof left === "number" ? left <= 0 : false;

          return (
            <option key={t.id} value={t.id} disabled={isSoldOut}>
              {t.name} — {formatEUR(Number(t.price_cents))}
              {typeof left === "number" ? (isSoldOut ? " • SOLD OUT" : ` • ${left} left`) : ""}
            </option>
          );
        })}
      </select>

      {/* ✅ show tickets left under selector */}
      {typeof selected?.tickets_left === "number" ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.85 }}>
          {soldOut ? (
            <span style={{ color: "#ff6b6b", fontWeight: 900 }}>Sold out</span>
          ) : (
            <span style={{ fontWeight: 900 }}>{selected.tickets_left} ticket(s) left</span>
          )}
        </div>
      ) : null}

      <label style={label}>Quantity</label>
      <div className="qty-row" style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button
          className="qty-btn"
          onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          style={smallBtn}
          type="button"
          disabled={loading || soldOut}
        >
          -
        </button>

        <div className="qty-box" style={qtyBox}>{quantity}</div>

        <button
          className="qty-btn"
          onClick={() => setQuantity((q) => Math.min(maxAllowed, q + 1))}
          style={smallBtn}
          type="button"
          disabled={loading || soldOut || quantity >= maxAllowed}
        >
          +
        </button>
      </div>

      {/* ✅ show a small helper when max is limited */}
      {maxAllowed < 10 && !soldOut ? (
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          Max available right now: <b>{maxAllowed}</b>
        </div>
      ) : null}

      <label style={label}>Name (optional)</label>
      <input
        value={buyerName}
        onChange={(e) => setBuyerName(e.target.value)}
        placeholder="Your name"
        style={field}
        disabled={loading}
      />

      <label style={label}>Email *</label>
      <input
        value={buyerEmail}
        onChange={(e) => setBuyerEmail(e.target.value)}
        placeholder="you@example.com"
        style={field}
        disabled={loading}
      />

      <div
        style={{
          marginTop: 14,
          borderTop: "1px solid #23232b",
          paddingTop: 12,
          display: "flex",
          justifyContent: "space-between",
          fontWeight: 950,
        }}
      >
        <span>Total</span>
        <span>{formatEUR(total)}</span>
      </div>

      {err && <div style={{ marginTop: 10, color: "#ff6b6b" }}>{err}</div>}

      <button
        onClick={checkout}
        disabled={loading || soldOut}
        style={{
          ...payBtn,
          opacity: loading || soldOut ? 0.7 : 1,
          cursor: loading || soldOut ? "not-allowed" : "pointer",
        }}
      >
        {soldOut ? "Sold Out" : loading ? "Redirecting..." : "Pay with Stripe"}
      </button>

      <div style={{ marginTop: 10, opacity: 0.7, fontSize: 12, lineHeight: 1.5 }}>
        After payment, tickets will be delivered via email with a QR code (we’ll add auto-email next).
      </div>

      <style>{`
        /* Safety */
        .buy-box { min-width: 0; }
        .buy-box select, .buy-box input, .buy-box button { max-width: 100%; }

        /* Tablet */
        @media (max-width: 980px) {
          .buy-box {
            padding: 16px !important;
            border-radius: 16px !important;
            top: 14px !important;
          }
        }

        /* Mobile: disable sticky */
        @media (max-width: 640px) {
          .buy-box {
            position: relative !important;
            top: auto !important;
            padding: 14px !important;
            border-radius: 16px !important;
          }

          .buy-box select,
          .buy-box input {
            padding: 12px !important;
            border-radius: 12px !important;
            font-size: 16px !important; /* stops iOS zoom */
          }

          .qty-row {
            gap: 10px !important;
            align-items: stretch !important;
          }

          .qty-btn {
            flex: 0 0 52px !important;
            min-width: 52px !important;
            padding: 12px 0 !important;
            border-radius: 12px !important;
          }

          .qty-box {
            flex: 1 1 auto !important;
            min-width: 0 !important;
            padding: 12px 12px !important;
            border-radius: 12px !important;
          }
        }

        /* Small phones */
        @media (max-width: 420px) {
          .qty-row {
            flex-wrap: wrap !important;
          }

          .qty-btn {
            flex: 1 1 48% !important;
            min-width: 0 !important;
          }

          .qty-box {
            flex: 1 1 100% !important;
            order: 3 !important;
            text-align: center !important;
          }
        }
      `}</style>
    </div>
  );
}

const label: React.CSSProperties = {
  display: "block",
  marginTop: 12,
  opacity: 0.85,
  fontSize: 13,
};

const field: React.CSSProperties = {
  width: "100%",
  padding: 12,
  borderRadius: 12,
  background: "#111118",
  color: "white",
  border: "1px solid #2b2b33",
  marginTop: 6,
};

const smallBtn: React.CSSProperties = {
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #2b2b33",
  background: "#111118",
  color: "white",
  cursor: "pointer",
  fontWeight: 950,
};

const qtyBox: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #2b2b33",
  borderRadius: 12,
  minWidth: 60,
  textAlign: "center",
  fontWeight: 950,
};

const payBtn: React.CSSProperties = {
  marginTop: 14,
  width: "100%",
  padding: "12px 14px",
  borderRadius: 14,
  border: "none",
  cursor: "pointer",
  fontWeight: 950,
  background: "white",
  color: "black",
};