import Link from "next/link";

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const sp = await searchParams;
  const _sessionId = sp?.session_id; // keep for later, don’t show user

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      <section className="success-wrap" style={{ maxWidth: 900, margin: "0 auto", padding: "56px 20px 70px" }}>
        <div
          className="success-card"
          style={{
            border: "1px solid #23232b",
            borderRadius: 22,
            background: "rgba(255,255,255,0.02)",
            padding: 22,
          }}
        >
          <div className="success-top" style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div
              className="success-icon"
              style={{
                width: 46,
                height: 46,
                borderRadius: 16,
                display: "grid",
                placeItems: "center",
                background: "rgba(34,197,94,0.14)",
                border: "1px solid rgba(34,197,94,0.26)",
                fontSize: 20,
                flex: "0 0 auto",
              }}
              aria-hidden="true"
            >
              ✅
            </div>

            <div className="success-titleblock" style={{ minWidth: 0, flex: 1 }}>
              <div style={{ opacity: 0.75, fontSize: 13, letterSpacing: 1, fontWeight: 900 }}>
                STELLA EVENTS
              </div>

              <h1
                className="success-title"
                style={{ margin: "8px 0 6px", fontSize: 34, fontWeight: 950, lineHeight: 1.12 }}
              >
                Payment successful
              </h1>

              <p className="success-sub" style={{ margin: 0, opacity: 0.9, lineHeight: 1.7, maxWidth: 680 }}>
                You’re all set. Your ticket(s) will be delivered to your email with a QR code for fast gate entry.
              </p>
            </div>
          </div>

          <div
            className="success-body"
            style={{
              marginTop: 18,
              borderTop: "1px solid #23232b",
              paddingTop: 16,
              display: "grid",
              gap: 12,
            }}
          >
            <div
              className="success-box"
              style={{
                border: "1px solid #2b2b33",
                borderRadius: 16,
                padding: 14,
                background: "rgba(0,0,0,0.22)",
              }}
            >
              <div style={{ fontWeight: 950, marginBottom: 6 }}>What happens next?</div>
              <ul style={{ margin: 0, paddingLeft: 18, opacity: 0.9, lineHeight: 1.7 }}>
                <li>Check your inbox for your QR ticket email.</li>
                <li>If it doesn’t arrive in 5 minutes, check spam/junk.</li>
                <li>At the venue, show the QR code for quick check-in.</li>
              </ul>
            </div>

            <div className="success-actions" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href="/" className="se-btn se-btn-primary se-btn-block-mobile">
                Back to Home
              </Link>
              <Link href="/checkin" className="se-btn se-btn-outline se-btn-block-mobile">
                Gate Check-in
              </Link>
              <a href="/#contact" className="se-btn se-btn-ghost se-btn-block-mobile">
                Need help?
              </a>
            </div>

            <div className="success-foot" style={{ opacity: 0.7, fontSize: 12, lineHeight: 1.6 }}>
              If you used the wrong email or need support, contact us via WhatsApp.
            </div>
          </div>
        </div>

        <style>{`
          .success-wrap, .success-card, .success-titleblock { min-width: 0; }
          .success-title { word-break: break-word; }

          @media (max-width: 640px) {
            .success-wrap { padding: 44px 14px 60px !important; }
            .success-card { padding: 16px !important; border-radius: 18px !important; }
            .success-icon { width: 44px !important; height: 44px !important; border-radius: 14px !important; }
            .success-title { font-size: 28px !important; line-height: 1.15 !important; }
            .success-sub { max-width: 100% !important; }
            .success-box { padding: 12px !important; border-radius: 14px !important; }
          }

          @media (max-width: 520px) {
            .se-btn-block-mobile { width: 100% !important; justify-content: center !important; }
            .success-actions { gap: 10px !important; }
          }
        `}</style>
      </section>
    </main>
  );
}