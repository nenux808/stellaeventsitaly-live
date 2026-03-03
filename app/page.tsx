import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format(cents / 100);
}

function safeNumber(v: any): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default async function Home() {
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

  // fetch published events (+ capacities + sold count via tickets relation)
  const { data: events, error } = await supabase
    .from("events")
    .select(
      `
      id,title,slug,venue,address,start_at,status,
      ticket_types(price_cents,capacity),
      tickets(count)
    `
    )
    .eq("status", "published")
    .order("start_at", { ascending: true });

  const featured = events?.[0];

  // HERO banner
  const heroSrc = "/banner-v2.jpg";

  // helper: compute min price + left badge
  function getEventMeta(e: any) {
    const prices = (e.ticket_types ?? [])
      .map((t: any) => safeNumber(t.price_cents))
      .filter((x: any) => typeof x === "number") as number[];
    const minPrice = prices.length ? Math.min(...prices) : null;

    const totalCapacity = (e.ticket_types ?? [])
      .map((t: any) => safeNumber(t.capacity) ?? 0)
      .reduce((a: number, b: number) => a + b, 0);

    const sold = safeNumber(e?.tickets?.[0]?.count) ?? 0; // PostgREST aggregate shape
    const left = totalCapacity > 0 ? Math.max(0, totalCapacity - sold) : null;

    return { minPrice, totalCapacity, sold, left };
  }

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      <section style={{ position: "relative", height: 520 }} className="hero">
        <Image
          src={heroSrc}
          alt="Stella Events Movie Show Banner"
          fill
          priority
          style={{ objectFit: "cover", filter: "brightness(0.65)" }}
        />

        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,0.65) 0%, rgba(0,0,0,0.85) 70%, rgba(11,11,15,1) 100%)",
          }}
        />

        <div
          style={{
            position: "relative",
            maxWidth: 1100,
            margin: "0 auto",
            padding: "60px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
          className="container stack-14 hero-inner"
        >
          <div style={{ fontSize: 14, letterSpacing: 1, opacity: 0.85 }}>STELLA EVENTS</div>

          <h1 style={{ fontSize: 42, fontWeight: 950, lineHeight: 1.1, margin: 0 }} className="hero-title">
            Movie Shows in Brescia
          </h1>

          <p style={{ maxWidth: 720, opacity: 0.9, lineHeight: 1.6, margin: 0 }} className="hero-desc">
            Book your tickets online for an exclusive movie screening by Stella Events. QR-code entry,
            fast gate check-in, and secure online payments.
          </p>

          {/* ✅ FEATURED quick card (added) */}
          {featured ? (
            (() => {
              const meta = getEventMeta(featured);
              return (
                <div
                  className="featured-card"
                  style={{
                    marginTop: 8,
                    border: "1px solid #23232b",
                    borderRadius: 18,
                    padding: 14,
                    background: "rgba(255,255,255,0.03)",
                    maxWidth: 720,
                  }}
                >
                  <div className="featured-top" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 950,
                        padding: "6px 10px",
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.12)",
                        border: "1px solid rgba(255,255,255,0.18)",
                      }}
                    >
                      🔥 Featured
                    </span>

                    {meta.left !== null ? (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 950,
                          padding: "6px 10px",
                          borderRadius: 999,
                          background:
                            meta.left <= 20 ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.14)",
                          border:
                            meta.left <= 20
                              ? "1px solid rgba(239,68,68,0.30)"
                              : "1px solid rgba(34,197,94,0.26)",
                        }}
                      >
                        {meta.left} tickets left
                      </span>
                    ) : null}
                  </div>

                  <div className="featured-title" style={{ marginTop: 10, fontSize: 18, fontWeight: 950 }}>
                    {featured.title}
                  </div>

                  <div className="featured-meta" style={{ marginTop: 6, opacity: 0.85, lineHeight: 1.5 }}>
                    {featured.venue}
                    {featured.address ? ` • ${featured.address}` : ""}
                    <br />
                    {new Date(featured.start_at).toLocaleString("en-GB")}
                  </div>

                  <div className="featured-actions" style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <a
                      href={`/events/${featured.slug}`}
                      style={{
                        display: "inline-block",
                        padding: "12px 14px",
                        borderRadius: 14,
                        background: "white",
                        color: "black",
                        fontWeight: 900,
                        textDecoration: "none",
                      }}
                    >
                      Buy Tickets
                    </a>

                    <a
                      href="#events"
                      style={{
                        display: "inline-block",
                        padding: "12px 14px",
                        borderRadius: 14,
                        border: "1px solid rgba(255,255,255,0.25)",
                        color: "white",
                        fontWeight: 900,
                        textDecoration: "none",
                        background: "rgba(255,255,255,0.04)",
                      }}
                    >
                      View All Events
                    </a>
                  </div>

                  <div className="featured-foot" style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
                    {meta.minPrice !== null ? `From ${formatEUR(meta.minPrice)}` : "Price TBD"}
                    {meta.totalCapacity ? ` • Capacity ${meta.totalCapacity}` : ""}
                  </div>
                </div>
              );
            })()
          ) : null}

          <div className="hero-actions" style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <a
              href="#events"
              style={{
                display: "inline-block",
                padding: "12px 14px",
                borderRadius: 14,
                border: "1px solid rgba(255,255,255,0.25)",
                color: "white",
                fontWeight: 900,
                textDecoration: "none",
                background: "rgba(255,255,255,0.04)",
              }}
            >
              View Events
            </a>

            <a
              href="#contact"
              style={{
                display: "inline-block",
                padding: "12px 14px",
                borderRadius: 14,
                color: "white",
                fontWeight: 900,
                textDecoration: "none",
                opacity: 0.9,
              }}
            >
              Contact
            </a>
          </div>

          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>Presale €12</div>

          {error ? (
            <div style={{ marginTop: 10, color: "#ff6b6b", fontSize: 13 }}>
              Supabase error: {error.message}
            </div>
          ) : null}
        </div>
      </section>

      <section
        id="events"
        style={{ maxWidth: 1100, margin: "0 auto", padding: "30px 20px 40px" }}
        className="container"
      >
        <h2 style={{ fontSize: 22, fontWeight: 950, marginBottom: 15 }} className="section-title">
          Events
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
          className="cards-grid"
        >
          {events?.map((e: any, idx: number) => {
            const meta = getEventMeta(e);

            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                className="event-card"
                style={{
                  border: "1px solid #23232b",
                  borderRadius: 18,
                  padding: 16,
                  textDecoration: "none",
                  color: "inherit",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div className="card-top" style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div className="card-title" style={{ fontSize: 18, fontWeight: 950 }}>
                    {e.title}
                  </div>

                  {/* ✅ badges */}
                  <div className="card-badges" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {idx === 0 ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 950,
                          padding: "5px 9px",
                          borderRadius: 999,
                          background: "rgba(255,255,255,0.12)",
                          border: "1px solid rgba(255,255,255,0.18)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Featured
                      </span>
                    ) : null}

                    {meta.left !== null ? (
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 950,
                          padding: "5px 9px",
                          borderRadius: 999,
                          background:
                            meta.left <= 20 ? "rgba(239,68,68,0.18)" : "rgba(34,197,94,0.14)",
                          border:
                            meta.left <= 20
                              ? "1px solid rgba(239,68,68,0.30)"
                              : "1px solid rgba(34,197,94,0.26)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {meta.left} left
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className="card-venue" style={{ opacity: 0.8, marginTop: 6 }}>
                  {e.venue}
                </div>
                <div className="card-date" style={{ opacity: 0.8, marginTop: 6 }}>
                  {new Date(e.start_at).toLocaleString("en-GB")}
                </div>

                <div className="card-price" style={{ marginTop: 10, fontWeight: 900 }}>
                  {meta.minPrice !== null ? `From ${formatEUR(meta.minPrice)}` : "Price TBD"}
                </div>

                {meta.totalCapacity ? (
                  <div className="card-foot" style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                    Sold {meta.sold} • Capacity {meta.totalCapacity}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </section>

      <section
        id="contact"
        style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 60px" }}
        className="container"
      >
        <div
          style={{
            border: "1px solid #23232b",
            borderRadius: 18,
            padding: 18,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <h2 style={{ fontSize: 20, fontWeight: 950, marginTop: 0 }}>Contact</h2>
          <div style={{ opacity: 0.9, lineHeight: 1.8 }}>
            <div>
              <b>Dulanji:</b> +39 324 568 9483
            </div>
            <div>{/* keep your empty line as-is */}</div>
          </div>
        </div>
      </section>

      {/* ✅ Global responsive CSS for this page */}
      <style>{`
        /* Prevent overflow + weird overlaps */
        .container, .event-card, .cards-grid, .hero-inner { min-width: 0; }
        .event-card { display: block; }
        .card-top, .card-badges { min-width: 0; }

        /* HERO responsiveness */
        @media (max-width: 980px) {
          .hero { height: 560px !important; }
          .hero-inner { padding: 44px 18px !important; }
          .hero-title { font-size: 36px !important; }
        }

        @media (max-width: 640px) {
          .hero { height: 620px !important; }
          .hero-inner { padding: 32px 14px !important; }
          .hero-title { font-size: 30px !important; line-height: 1.12 !important; }
          .hero-desc { max-width: 100% !important; }

          /* Featured card buttons + spacing */
          .featured-card { padding: 14px !important; border-radius: 16px !important; }
          .featured-actions { gap: 10px !important; }
          .featured-actions a { flex: 1 1 160px; min-width: 160px; }

          /* Hero bottom actions (View Events / Contact) */
          .hero-actions a { flex: 1 1 150px; min-width: 150px; text-align: center; }

          /* Event cards: FIX OVERLAP ISSUE */
          .card-top {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 10px !important;
            align-items: flex-start !important;
          }

          .card-title {
            flex: 1 1 100% !important;
            word-break: break-word !important;
            line-height: 1.15 !important;
          }

          .card-badges {
            flex: 1 1 100% !important;
            justify-content: flex-start !important;
            flex-wrap: wrap !important;
            gap: 8px !important;
          }

          .cards-grid {
            grid-template-columns: 1fr !important;
          }
        }

        @media (max-width: 420px) {
          .hero { height: 680px !important; }
          .hero-inner { padding: 26px 12px !important; }
          .hero-title { font-size: 26px !important; }

          .featured-actions a { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; }
          .hero-actions a { flex: 1 1 100% !important; min-width: 0 !important; width: 100% !important; }
        }
      `}</style>
    </main>
  );
}
