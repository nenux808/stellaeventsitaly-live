import Link from "next/link";
import React from "react";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer
      className="site-footer"
      style={{
        marginTop: 40,
        borderTop: "1px solid #23232b",
        background: "#0b0b0f",
        color: "white",
      }}
    >
      <div
        className="footer-inner"
        style={{
          maxWidth: 1100,
          margin: "0 auto",
          padding: "28px 20px",
          display: "grid",
          gridTemplateColumns: "1.2fr 1fr 1fr",
          gap: 18,
        }}
      >
        {/* Brand */}
        <div className="footer-col footer-brand">
          <div style={{ fontSize: 13, letterSpacing: 1, opacity: 0.8, fontWeight: 800 }}>
            STELLA EVENTS
          </div>
          <div style={{ marginTop: 10, opacity: 0.85, lineHeight: 1.6, maxWidth: 420 }}>
            Movie shows with fast online booking, QR-code entry, and smooth gate check-in.
          </div>

          <div className="footer-chips" style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Chip text="Secure Payments" />
            <Chip text="QR Tickets" />
            <Chip text="Gate Check-in" />
          </div>
        </div>

        {/* Quick links */}
        <div className="footer-col footer-links">
          <div style={{ fontWeight: 950, marginBottom: 10 }}>Quick Links</div>
          <div className="footer-links-grid" style={{ display: "grid", gap: 10, opacity: 0.9 }}>
            <a href="#events" style={linkStyle}>Events</a>
            <a href="#contact" style={linkStyle}>Contact</a>
            <Link href="/checkin" style={linkStyle}>Gate Check-in</Link>
          </div>
        </div>

        {/* Contacts */}
        <div className="footer-col footer-contact">
          <div style={{ fontWeight: 950, marginBottom: 10 }}>Contact</div>
          <div style={{ opacity: 0.9, lineHeight: 1.8 }}>
            <div><b>Dulanji:</b> +39 324 568 9483</div>
            <div style={{ marginTop: 8, opacity: 0.75, fontSize: 13 }}>
              Need help? Call or WhatsApp us.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        className="footer-bottom"
        style={{
          borderTop: "1px solid #23232b",
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <div
          className="footer-bottom-inner"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            padding: "14px 20px",
            display: "flex",
            flexWrap: "wrap",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            opacity: 0.85,
            fontSize: 13,
          }}
        >
          <div>© {year} Stella Events. All rights reserved.</div>
          <div style={{ opacity: 0.75 }}>
            Powered by <b>NENUX WEB SOLUTIONS</b>
          </div>
        </div>
      </div>

      {/* ✅ Responsive layout */}
      <style>{`
        .site-footer, .footer-inner, .footer-bottom-inner { min-width: 0; }
        .footer-col { min-width: 0; }
        .footer-links-grid a { display: inline-block; max-width: 100%; }

        /* Tablet: stack columns */
        @media (max-width: 860px) {
          .footer-inner {
            grid-template-columns: 1fr !important;
            gap: 16px !important;
            padding: 22px 16px !important;
          }

          .footer-brand > div:nth-child(2) {
            max-width: 100% !important;
          }

          .footer-bottom-inner {
            padding: 14px 16px !important;
          }
        }

        /* Mobile: tighten spacing + keep chips nice */
        @media (max-width: 520px) {
          .footer-inner {
            padding: 20px 12px !important;
          }

          .footer-chips {
            gap: 8px !important;
          }

          .footer-bottom-inner {
            padding: 12px 12px !important;
            justify-content: flex-start !important;
          }

          .footer-bottom-inner > div {
            width: 100% !important;
          }

        @media (max-width: 520px) {
  .footer-bottom-inner {
    padding: 12px 12px !important;
    justify-content: center !important;
    text-align: center !important;
  }

  .footer-bottom-inner > div {
    width: 100% !important;
  }
}
        }
      `}</style>
    </footer>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "7px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.14)",
        background: "rgba(255,255,255,0.03)",
        fontSize: 12,
        fontWeight: 800,
        opacity: 0.9,
        maxWidth: "100%",
      }}
    >
      {text}
    </span>
  );
}

const linkStyle: React.CSSProperties = {
  color: "white",
  textDecoration: "none",
  opacity: 0.85,
};