import BuyTickets from "./BuyTickets";
import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import React from "react";

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function safeNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function EventPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) =>
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  );

  // ✅ Fetch event + ticket types + issued tickets (for sold/capacity tracking)
  const { data: event, error } = await supabase
    .from("events")
    .select(
      "id,title,slug,description,venue,address,start_at,status,poster_url,ticket_types(id,name,price_cents,currency,capacity),tickets(id,status,ticket_type_id)"
    )
    .eq("slug", slug)
    .single();

  if (error || !event) {
    return (
      <main style={{ padding: 40, color: "white", background: "#0b0b0f", minHeight: "100vh" }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Event not found</h1>
        <Link href="/" style={{ color: "white", opacity: 0.8 }}>
          Back to Home
        </Link>
      </main>
    );
  }

  // ✅ soldByType: count issued tickets for each ticket_type_id
  const soldByType: Record<string, number> = {};
  for (const t of (event.tickets || []) as any[]) {
    // treat both active + checked_in as sold
    if (t.status === "active" || t.status === "checked_in") {
      soldByType[t.ticket_type_id] = (soldByType[t.ticket_type_id] || 0) + 1;
    }
  }

  // ✅ add tickets_left to each ticket type
  const ticketTypesWithLeft = (event.ticket_types || []).map((tt: any) => {
    const cap = safeNumber(tt.capacity) ?? 0;
    const sold = soldByType[tt.id] || 0;
    const left = Math.max(0, cap - sold);
    return { ...tt, tickets_left: left };
  });

  // ✅ totals
  const totalCapacity = ticketTypesWithLeft.reduce(
    (sum: number, t: any) => sum + (safeNumber(t.capacity) ?? 0),
    0
  );
  const soldTotal = Object.values(soldByType).reduce((a, b) => a + b, 0);
  const totalLeft = totalCapacity > 0 ? Math.max(0, totalCapacity - soldTotal) : null;
  const soldOut = totalLeft !== null ? totalLeft <= 0 : false;

  // ✅ min price
  const prices = ticketTypesWithLeft
    .map((t: any) => safeNumber(t.price_cents))
    .filter((x: any) => typeof x === "number") as number[];
  const minPrice = prices.length ? Math.min(...prices) : null;

  // Banner logic (kept exactly)
  const guessLocal = `/events/${event.slug}.jpg`;
  const altSrc = `/banner.jpg`;
  const bannerSrc = event.poster_url ? event.poster_url : guessLocal;

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      {/* ✅ Cinematic poster header */}
      <section
        className="event-hero"
        style={{ borderBottom: "1px solid #1f1f27", position: "relative", height: 440 }}
      >
        <Image
          src={bannerSrc || altSrc}
          alt={`${event.title} banner`}
          fill
          priority
          style={{ objectFit: "cover", filter: "brightness(0.58)" }}
        />

        {/* cinematic overlays */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(11,11,15,0.35) 0%, rgba(11,11,15,0.70) 55%, rgba(11,11,15,1) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(70% 60% at 20% 25%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%)",
          }}
        />

        <div
          className="hero-inner"
          style={{ position: "relative", maxWidth: 1100, margin: "0 auto", padding: "28px 20px" }}
        >
          <Link href="/" style={{ color: "white", opacity: 0.8, textDecoration: "none" }}>
            ← Back
          </Link>

          <div style={{ marginTop: 12, opacity: 0.8, fontSize: 13, letterSpacing: 1 }}>STELLA EVENTS</div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            {totalLeft !== null ? (
              <Badge
                text={soldOut ? "Sold out" : `${totalLeft} tickets left`}
                tone={soldOut ? "danger" : totalLeft <= 20 ? "warn" : "good"}
              />
            ) : null}
            <Badge text="QR entry" tone="neutral" />
            <Badge text="Fast gate check-in" tone="neutral" />
          </div>

          <h1
            className="event-title"
            style={{ fontSize: 40, fontWeight: 950, margin: "10px 0 6px", lineHeight: 1.08 }}
          >
            {event.title}
          </h1>

          <div className="chips-row" style={{ display: "flex", flexWrap: "wrap", gap: 10, opacity: 0.9 }}>
            <InfoChip label="When" value={formatDateTime(event.start_at)} />
            <InfoChip label="Where" value={event.venue} />
            {event.address ? <InfoChip label="Address" value={event.address} /> : null}
            {minPrice !== null ? <InfoChip label="From" value={formatEUR(minPrice)} /> : null}
          </div>

          {event.description ? (
            <p className="event-desc" style={{ marginTop: 14, maxWidth: 900, lineHeight: 1.7, opacity: 0.92 }}>
              {event.description}
            </p>
          ) : null}
        </div>
      </section>

      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "22px 20px 60px" }}>
        <div
          className="event-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "1.1fr 0.9fr",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* Ticket list */}
          <div
            className="tickets-card"
            style={{
              border: "1px solid #23232b",
              borderRadius: 18,
              padding: 18,
              background: "rgba(255,255,255,0.02)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 950 }}>Tickets</h2>

              {totalCapacity ? (
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  Sold {soldTotal} / {totalCapacity}
                </div>
              ) : null}
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {ticketTypesWithLeft.map((t: any) => {
                const cap = safeNumber(t.capacity) ?? 0;
                const sold = soldByType[t.id] ?? 0;
                const left = typeof t.tickets_left === "number" ? t.tickets_left : null;
                const isSoldOut = left !== null ? left <= 0 : false;

                return (
                  <div
                    key={t.id}
                    className="ticket-row"
                    style={{
                      border: "1px solid #2b2b33",
                      borderRadius: 16,
                      padding: 14,
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 14,
                      background: "rgba(0,0,0,0.25)",
                      opacity: isSoldOut ? 0.6 : 1,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 950, fontSize: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {t.name}
                        {left !== null ? (
                          <span
                            style={{
                              fontSize: 12,
                              fontWeight: 950,
                              padding: "4px 9px",
                              borderRadius: 999,
                              background: isSoldOut
                                ? "rgba(239,68,68,0.18)"
                                : left <= 10
                                ? "rgba(245,158,11,0.16)"
                                : "rgba(34,197,94,0.14)",
                              border: isSoldOut
                                ? "1px solid rgba(239,68,68,0.30)"
                                : left <= 10
                                ? "1px solid rgba(245,158,11,0.28)"
                                : "1px solid rgba(34,197,94,0.26)",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isSoldOut ? "Sold out" : `${left} left`}
                          </span>
                        ) : null}
                      </div>

                      <div style={{ opacity: 0.75, fontSize: 13 }}>
                        Capacity: {cap} • Sold: {sold}
                      </div>
                    </div>

                    <div style={{ fontWeight: 950, whiteSpace: "nowrap" }}>
                      {typeof t.price_cents === "number" ? formatEUR(t.price_cents) : "TBD"}
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 14, opacity: 0.7, fontSize: 13 }}>
              After payment, your ticket will be sent to your email with a QR code.
            </div>
          </div>

          {/* ✅ Buy box uses ticketTypesWithLeft so your BuyTickets can enforce tickets_left */}
          <BuyTickets eventId={event.id} ticketTypes={ticketTypesWithLeft} />
        </div>

        <style>{`
          /* Base safety */
          .event-grid { min-width: 0; }
          .tickets-card { min-width: 0; }
          .ticket-row { min-width: 0; }
          .chips-row { min-width: 0; }
          .hero-inner { min-width: 0; }

          /* Tablet and below */
          @media (max-width: 980px) {
            .event-grid {
              grid-template-columns: 1fr !important;
              gap: 14px !important;
            }

            .hero-inner {
              padding: 24px 18px !important;
            }
          }

          /* Mobile */
          @media (max-width: 640px) {
            .event-hero { height: 520px !important; }

            .hero-inner {
              padding: 18px 14px !important;
            }

            .event-title {
              font-size: 30px !important;
              line-height: 1.12 !important;
              margin: 10px 0 8px !important;
              word-break: break-word;
            }

            .event-desc {
              margin-top: 12px !important;
              line-height: 1.65 !important;
            }

            .chips-row {
              gap: 8px !important;
            }

            /* Make InfoChips behave nicely on small screens */
            .chips-row > div {
              max-width: 100% !important;
              overflow: hidden !important;
            }
            .chips-row > div span:last-child {
              display: inline-block !important;
              max-width: 100% !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              vertical-align: bottom !important;
              white-space: nowrap !important;
            }

            /* Tickets card spacing on mobile */
            .tickets-card {
              padding: 14px !important;
              border-radius: 16px !important;
            }

            /* Ticket row: nicer spacing on mobile */
            .ticket-row {
              padding: 12px !important;
              border-radius: 14px !important;
              gap: 10px !important;
              align-items: flex-start !important;
            }
          }

          /* Small mobile (tight devices) */
          @media (max-width: 420px) {
            .event-hero { height: 560px !important; }

            .event-title {
              font-size: 26px !important;
            }

            .hero-inner {
              padding: 16px 12px !important;
            }

            /* Stack the ticket row layout cleanly */
            .ticket-row {
              flex-direction: column !important;
            }

            .ticket-row > div:last-child {
              width: 100% !important;
              text-align: left !important;
              opacity: 0.95 !important;
            }
          }
        `}</style>
      </section>
    </main>
  );
}

function Badge({ text, tone }: { text: string; tone: "good" | "warn" | "danger" | "neutral" }) {
  const styles: Record<string, React.CSSProperties> = {
    good: { background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.26)" },
    warn: { background: "rgba(245,158,11,0.16)", border: "1px solid rgba(245,158,11,0.28)" },
    danger: { background: "rgba(239,68,68,0.18)", border: "1px solid rgba(239,68,68,0.30)" },
    neutral: { background: "rgba(255,255,255,0.10)", border: "1px solid rgba(255,255,255,0.16)" },
  };

  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 950,
        padding: "6px 10px",
        borderRadius: 999,
        ...styles[tone],
      }}
    >
      {text}
    </span>
  );
}

function InfoChip({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: 999,
        padding: "8px 12px",
        background: "rgba(255,255,255,0.03)",
        maxWidth: "100%",
      }}
    >
      <span style={{ fontSize: 12, opacity: 0.7, marginRight: 8 }}>{label}:</span>
      <span style={{ fontWeight: 900 }}>{value}</span>
    </div>
  );
}