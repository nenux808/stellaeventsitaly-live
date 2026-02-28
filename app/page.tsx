import Link from "next/link";
import Image from "next/image";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
  }).format(cents / 100);
}

function toNumber(x: any) {
  const n = typeof x === "string" ? Number(x) : x;
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
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );

  // ✅ Fetch published events + ticket types (full enough for pricing)
  const { data: events, error } = await supabase
    .from("events")
    .select(
      `
        id,
        title,
        slug,
        venue,
        address,
        start_at,
        status,
        ticket_types (
          id,
          name,
          price_cents,
          currency,
          capacity
        )
      `
    )
    .eq("status", "published")
    .order("start_at", { ascending: true });

  const featured = events?.[0];

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      {/* HERO */}
      <section style={{ position: "relative", height: 520 }}>
        <Image
          src="/banner.jpg"
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
        >
          <div style={{ fontSize: 14, letterSpacing: 1, opacity: 0.85 }}>
            STELLA EVENTS
          </div>

          <h1 style={{ fontSize: 42, fontWeight: 950, lineHeight: 1.1, margin: 0 }}>
            Movie Show in Brescia
          </h1>

          <p style={{ maxWidth: 720, opacity: 0.9, lineHeight: 1.6, margin: 0 }}>
            Book your tickets online for an exclusive movie screening by Stella Events.
            QR-code entry, fast gate check-in, and secure online payments.
          </p>

          {/* CTA */}
          <div style={{ display: "flex", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
            <a
              href={featured ? `/events/${featured.slug}` : "#events"}
              style={{
                display: "inline-block",
                padding: "12px 14px",
                borderRadius: 14,
                background: "white",
                color: "black",
                fontWeight: 900,
                textDecoration: "none",
                opacity: featured ? 1 : 0.6,
                pointerEvents: featured ? "auto" : "none",
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

          <div style={{ marginTop: 10, opacity: 0.85, fontSize: 13 }}>
            Presale €12 • At Gate €15
          </div>

          {error ? (
            <div style={{ marginTop: 10, color: "#ff6b6b", fontSize: 13 }}>
              Supabase error: {error.message}
            </div>
          ) : null}
        </div>
      </section>

      {/* EVENTS LIST */}
      <section id="events" style={{ maxWidth: 1100, margin: "0 auto", padding: "30px 20px 40px" }}>
        <h2 style={{ fontSize: 22, fontWeight: 950, marginBottom: 12 }}>Events</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            gap: 14,
          }}
        >
          {events?.map((e: any) => {
            const prices =
              (e.ticket_types ?? [])
                .map((t: any) => toNumber(t.price_cents))
                .filter((n: any) => typeof n === "number" && n > 0) || [];

            const minPrice = prices.length ? Math.min(...prices) : null;

            return (
              <Link
                key={e.id}
                href={`/events/${e.slug}`}
                style={{
                  border: "1px solid #23232b",
                  borderRadius: 18,
                  padding: 16,
                  textDecoration: "none",
                  color: "inherit",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ fontSize: 18, fontWeight: 950 }}>{e.title}</div>
                <div style={{ opacity: 0.8, marginTop: 6 }}>{e.venue}</div>
                <div style={{ opacity: 0.8, marginTop: 6 }}>
                  {new Date(e.start_at).toLocaleString("en-GB")}
                </div>

                <div style={{ marginTop: 10, fontWeight: 900 }}>
                  {minPrice !== null ? `From ${formatEUR(minPrice)}` : "Price TBD"}
                </div>

                {/* Optional debug (remove later) */}
                {/* <div style={{ marginTop: 8, opacity: 0.6, fontSize: 12 }}>
                  ticket_types: {(e.ticket_types?.length ?? 0).toString()}
                </div> */}
              </Link>
            );
          })}
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px 60px" }}>
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
            <div>
              
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}