import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import AdminLogoutButton from "./AdminLogoutButton";

type SearchParams = Promise<{ event?: string }>;

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
}

function pct(a: number, b: number) {
  if (!b) return "0%";
  return `${Math.round((a / b) * 100)}%`;
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const selectedEventId = sp?.event;

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Load events (published)
  const { data: events } = await supabase
    .from("events")
    .select("id,title,slug,start_at,venue,status")
    .eq("status", "published")
    .order("start_at", { ascending: true });

  const eventId = selectedEventId || events?.[0]?.id;

  if (!eventId) {
    return (
      <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
        <section style={{ maxWidth: 1100, margin: "0 auto", padding: "30px 20px" }}>
          <h1 style={{ fontSize: 26, fontWeight: 950 }}>Organizer Dashboard</h1>
          <div style={{ opacity: 0.8, marginTop: 8 }}>No published events found.</div>
        </section>
      </main>
    );
  }

  // Load selected event (✅ include slug)
  const { data: event } = await supabase
    .from("events")
    .select("id,title,slug,start_at,venue,address")
    .eq("id", eventId)
    .single();

  // Ticket types
  const { data: ticketTypes } = await supabase
    .from("ticket_types")
    .select("id,name,price_cents,currency,capacity")
    .eq("event_id", eventId)
    .order("price_cents", { ascending: true });

  // Orders (revenue)
  const { data: orders } = await supabase
    .from("orders")
    .select("total_cents")
    .eq("event_id", eventId);

  const revenueCents = (orders || []).reduce((sum, o: any) => sum + Number(o.total_cents || 0), 0);

  // Counts by ticket type (sold + checked_in)
  const rows =
    (ticketTypes || []).length > 0
      ? await Promise.all(
          (ticketTypes || []).map(async (tt: any) => {
            const { count: sold } = await supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("event_id", eventId)
              .eq("ticket_type_id", tt.id)
              .in("status", ["active", "checked_in"]);

            const { count: checkedIn } = await supabase
              .from("tickets")
              .select("id", { count: "exact", head: true })
              .eq("event_id", eventId)
              .eq("ticket_type_id", tt.id)
              .eq("status", "checked_in");

            const cap = Number(tt.capacity || 0);
            const soldNum = Number(sold || 0);
            const checkedNum = Number(checkedIn || 0);
            const left = cap > 0 ? Math.max(0, cap - soldNum) : null;

            return {
              ...tt,
              cap,
              sold: soldNum,
              checked_in: checkedNum,
              left,
            };
          })
        )
      : [];

  const soldTotal = rows.reduce((s, r) => s + r.sold, 0);
  const checkedTotal = rows.reduce((s, r) => s + r.checked_in, 0);
  const totalCapacity = rows.reduce((s, r) => s + (r.cap || 0), 0);
  const leftTotal = totalCapacity > 0 ? Math.max(0, totalCapacity - soldTotal) : null;

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      <section style={{ maxWidth: 1100, margin: "0 auto", padding: "26px 20px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <div style={{ opacity: 0.75, fontSize: 13, letterSpacing: 1, fontWeight: 900 }}>STELLA EVENTS</div>
            <h1 style={{ margin: "8px 0 0", fontSize: 28, fontWeight: 950 }}>Organizer Dashboard</h1>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <form method="GET" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <select
                name="event"
                defaultValue={eventId}
                style={{
                  padding: 12,
                  borderRadius: 12,
                  background: "#111118",
                  color: "white",
                  border: "1px solid #2b2b33",
                  minWidth: 260,
                }}
              >
                {(events || []).map((e: any) => (
                  <option key={e.id} value={e.id}>
                    {e.title}
                  </option>
                ))}
              </select>

              <button className="se-btn se-btn-outline" type="submit">
                Load
              </button>
            </form>

            <AdminLogoutButton />
          </div>
        </div>

        <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.6 }}>
          <b>{event?.title}</b> • {event?.venue}
          {event?.address ? ` • ${event.address}` : ""}
        </div>

        {/* KPI cards */}
        <div
          className="kpi-grid"
          style={{
            marginTop: 16,
            display: "grid",
            gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
            gap: 12,
          }}
        >
          <Kpi label="Tickets Sold" value={String(soldTotal)} sub={leftTotal !== null ? `${leftTotal} left` : "—"} />
          <Kpi label="Checked-in" value={String(checkedTotal)} sub={`${pct(checkedTotal, soldTotal)} check-in rate`} />
          <Kpi label="Revenue" value={formatEUR(revenueCents)} sub={`${orders?.length || 0} order(s)`} />
          <Kpi label="Capacity" value={totalCapacity ? String(totalCapacity) : "—"} sub="Total available" />
        </div>

        {/* Table */}
        <div
          style={{
            marginTop: 14,
            border: "1px solid #23232b",
            borderRadius: 18,
            background: "rgba(255,255,255,0.02)",
            padding: 14,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>Ticket Type Breakdown</h2>

            {event?.slug ? (
              <Link
                href={`/events/${event.slug}`}
                style={{ color: "white", opacity: 0.8, textDecoration: "none" }}
              >
                View event page →
              </Link>
            ) : null}
          </div>

          <div style={{ marginTop: 10, overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
              <thead>
                <tr style={{ textAlign: "left", opacity: 0.8, fontSize: 13 }}>
                  <th style={th}>Type</th>
                  <th style={th}>Price</th>
                  <th style={th}>Capacity</th>
                  <th style={th}>Sold</th>
                  <th style={th}>Checked-in</th>
                  <th style={th}>Left</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} style={{ borderTop: "1px solid #23232b" }}>
                    <td style={td}><b>{r.name}</b></td>
                    <td style={td}>{typeof r.price_cents === "number" ? formatEUR(r.price_cents) : "—"}</td>
                    <td style={td}>{r.cap || "—"}</td>
                    <td style={td}>{r.sold}</td>
                    <td style={td}>{r.checked_in}</td>
                    <td style={td}>{r.left === null ? "—" : r.left}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, opacity: 0.75, fontSize: 12 }}>
            Tip: “Sold” counts tickets with status <b>active</b> or <b>checked_in</b>.
          </div>
        </div>

        <style>{`
          @media (max-width: 980px) {
            .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          }
          @media (max-width: 560px) {
            .kpi-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </section>
    </main>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div
      style={{
        border: "1px solid #23232b",
        borderRadius: 18,
        background: "rgba(255,255,255,0.02)",
        padding: 14,
        minWidth: 0,
      }}
    >
      <div style={{ opacity: 0.75, fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 950, marginTop: 6 }}>{value}</div>
      <div style={{ opacity: 0.75, fontSize: 12, marginTop: 6 }}>{sub}</div>
    </div>
  );
}

const th: React.CSSProperties = { padding: "10px 8px" };
const td: React.CSSProperties = { padding: "12px 8px", fontSize: 14 };