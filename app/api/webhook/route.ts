import Stripe from "stripe";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/** ---------- Helpers ---------- */

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return new Stripe(key);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!serviceKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");
  return createClient(url, serviceKey);
}

function getResend() {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is missing");
  return new Resend(key);
}

function getWebhookSecrets(): string[] {
  // Supports either STRIPE_WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRETS="whsec1,whsec2"
  const many = process.env.STRIPE_WEBHOOK_SECRETS;
  const one = process.env.STRIPE_WEBHOOK_SECRET;

  const secrets = [
    ...(many ? many.split(",").map((s) => s.trim()).filter(Boolean) : []),
    ...(one ? [one.trim()] : []),
  ];

  // unique
  return Array.from(new Set(secrets));
}

function formatEUR(cents: number) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency: "EUR" }).format((cents || 0) / 100);
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

/** Try verifying signature with one of multiple secrets */
function constructStripeEvent(stripe: Stripe, rawBody: string, sig: string, secrets: string[]) {
  let lastErr: any = null;
  for (const secret of secrets) {
    try {
      return stripe.webhooks.constructEvent(rawBody, sig, secret);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** ---------- Route ---------- */

export async function POST(req: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  const resend = getResend();

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const secrets = getWebhookSecrets();
  if (!secrets.length) {
    return NextResponse.json(
      { error: "Missing STRIPE_WEBHOOK_SECRET (or STRIPE_WEBHOOK_SECRETS)" },
      { status: 500 }
    );
  }

  // ✅ Must use RAW body for signature verification
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = constructStripeEvent(stripe, rawBody, sig, secrets);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    // Only handle final checkout completion
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const eventId = session.metadata?.event_id;
    const ticketTypeId = session.metadata?.ticket_type_id;
    const qty = Math.max(1, Math.min(10, Number(session.metadata?.quantity || 1)));

    const buyerEmail =
      session.customer_details?.email ||
      session.customer_email ||
      session.metadata?.buyer_email;

    const buyerName =
      session.customer_details?.name ||
      session.metadata?.buyer_name ||
      "";

    if (!eventId || !ticketTypeId || !buyerEmail) {
      console.error("❌ Missing required metadata/email:", {
        metadata: session.metadata,
        customer_email: session.customer_email,
        customer_details: session.customer_details,
      });
      return NextResponse.json({ error: "Missing required metadata/email" }, { status: 400 });
    }

    console.log("✅ checkout.session.completed", {
      sessionId: session.id,
      buyerEmail,
      qty,
      eventId,
      ticketTypeId,
    });

    /** -------- Idempotency: if order exists, stop -------- */
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingOrder?.id) {
      console.log("ℹ️ Order already exists for session. Skipping:", existingOrder.id);
      return NextResponse.json({ received: true });
    }

    /** -------- Load event -------- */
    const { data: dbEvent, error: eventErr } = await supabase
      .from("events")
      .select("id,title,venue,address,start_at,slug")
      .eq("id", eventId)
      .single();

    if (eventErr || !dbEvent) throw new Error("Event not found in DB");

    /** -------- Load ticket type -------- */
    const { data: ticketType, error: ttErr } = await supabase
      .from("ticket_types")
      .select("id,name,price_cents,currency,capacity,event_id")
      .eq("id", ticketTypeId)
      .single();

    if (ttErr || !ticketType) throw new Error("Ticket type not found in DB");

    const currency = ticketType.currency ?? "EUR";
    const price = Number(ticketType.price_cents ?? 0);
    const total = price * qty;

    /** -------- Create order -------- */
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        stripe_session_id: session.id,
        stripe_payment_intent_id: session.payment_intent?.toString() || null,
        event_id: eventId,
        buyer_email: buyerEmail,
        buyer_name: buyerName,
        currency,
        subtotal_cents: total,
        total_cents: total,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("❌ Order insert failed:", orderErr);
      throw new Error(orderErr?.message || "Order insert failed");
    }

    /** -------- Create tickets + QR -------- */
    const qrAttachments: { filename: string; content: string }[] = [];
    const ticketLines: string[] = [];

    for (let i = 0; i < qty; i++) {
      const token = randomUUID();
      const filename = `ticket-${i + 1}.png`;

      const pngBuffer = await QRCode.toBuffer(token, { width: 420, margin: 1 });

      const { data: created, error: ticketErr } = await supabase
        .from("tickets")
        .insert({
          order_id: order.id,
          event_id: eventId,
          ticket_type_id: ticketTypeId,
          token,
          status: "active",
        })
        .select("id")
        .single();

      if (ticketErr) {
        console.error("❌ Ticket insert failed:", ticketErr);
        throw new Error(ticketErr.message);
      }

      qrAttachments.push({
        filename,
        content: Buffer.from(pngBuffer).toString("base64"),
      });

      ticketLines.push(`
        <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:14px;margin:10px 0;">
          <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;">
            <div style="font-weight:950;">Ticket ${i + 1} — ${ticketType.name}</div>
            <div style="font-weight:900;color:#111827;">${formatEUR(price)}</div>
          </div>
          <div style="margin-top:6px;font-size:12px;color:#6b7280;">
            QR attached as <b>${filename}</b>
          </div>
          <div style="margin-top:6px;font-size:12px;color:#6b7280;">
            Ref: ${created?.id || token}
          </div>
        </div>
      `);
    }

    console.log("✅ Tickets created:", qty);

    /** -------- Email (Resend) -------- */
    const from = process.env.EMAIL_FROM || process.env.TICKETS_FROM_EMAIL;
    if (!from) throw new Error("EMAIL_FROM (or TICKETS_FROM_EMAIL) is missing");

    const supportPhone = "+39 324 568 9483"; // change if needed
    const brand = "Stella Events";

    const html = `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Your Tickets</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0b0f;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
      Your tickets are ready — show the QR at the entrance.
    </div>

    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0b0b0f;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="720" cellspacing="0" cellpadding="0" style="width:100%;max-width:720px;background:#ffffff;border-radius:18px;overflow:hidden;">
            
            <tr>
              <td style="padding:22px 22px 14px;background:#0b0b0f;">
                <div style="font-family:Inter,system-ui,Arial,sans-serif;color:#ffffff;">
                  <div style="font-size:12px;letter-spacing:1.5px;font-weight:800;opacity:0.85;">
                    ${brand.toUpperCase()}
                  </div>
                  <div style="margin-top:8px;font-size:24px;font-weight:950;line-height:1.15;">
                    Your ticket${qty > 1 ? "s" : ""} are confirmed ✅
                  </div>
                  <div style="margin-top:8px;font-size:14px;opacity:0.85;line-height:1.6;">
                    QR code${qty > 1 ? "s" : ""} attached as PNG file${qty > 1 ? "s" : ""}. Please show at the entrance.
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 22px;border-bottom:1px solid #eef2f7;">
                <div style="font-family:Inter,system-ui,Arial,sans-serif;color:#111827;">
                  <div style="font-size:18px;font-weight:950;">${dbEvent.title}</div>

                  <div style="margin-top:10px;font-size:14px;line-height:1.7;color:#374151;">
                    <div><b>When:</b> ${formatDateTime(dbEvent.start_at)}</div>
                    <div><b>Where:</b> ${dbEvent.venue}${dbEvent.address ? ` • ${dbEvent.address}` : ""}</div>
                    <div><b>Name:</b> ${buyerName || "—"}</div>
                    <div><b>Email:</b> ${buyerEmail}</div>
                  </div>

                  <div style="margin-top:12px;display:inline-block;padding:10px 12px;border-radius:14px;background:#f3f4f6;color:#111827;font-weight:800;font-size:13px;">
                    Order total: ${formatEUR(total)}
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 22px;background:#f9fafb;">
                <div style="font-family:Inter,system-ui,Arial,sans-serif;color:#111827;">
                  <div style="font-weight:950;font-size:14px;margin-bottom:10px;">
                    Ticket details
                  </div>

                  ${ticketLines.join("")}

                  <div style="margin-top:12px;font-size:12px;line-height:1.6;color:#6b7280;">
                    Tip: If you can’t open the QR in your email app, download the attached PNG file and show it at the gate.
                  </div>
                </div>
              </td>
            </tr>

            <tr>
              <td style="padding:18px 22px;">
                <div style="font-family:Inter,system-ui,Arial,sans-serif;color:#111827;">
                  <div style="font-size:14px;line-height:1.6;">
                    Enjoy the show 🍿<br/>
                    <span style="color:#6b7280;">— ${brand}</span>
                  </div>

                  <div style="margin-top:12px;padding-top:12px;border-top:1px solid #eef2f7;font-size:12px;line-height:1.7;color:#6b7280;">
                    Need help? WhatsApp/Call: <b style="color:#111827;">${supportPhone}</b><br/>
                    Powered by <b style="color:#111827;">NENUX WEB SOLUTIONS</b>
                  </div>
                </div>
              </td>
            </tr>

          </table>

          <div style="margin-top:12px;font-family:Inter,system-ui,Arial,sans-serif;font-size:11px;color:rgba(255,255,255,0.65);">
            This email was sent to ${buyerEmail}.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>
`;

    const sendRes = await resend.emails.send({
      from,
      to: buyerEmail,
      subject: `🎟️ Your Tickets — ${dbEvent.title} (${brand})`,
      html,
      attachments: qrAttachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: "image/png",
      })),
    });

    if ((sendRes as any)?.error) {
      console.error("❌ Resend error:", (sendRes as any).error);
      return NextResponse.json({ error: "Email send failed", details: (sendRes as any).error }, { status: 500 });
    }

    console.log("✅ Email sent:", (sendRes as any)?.data?.id || sendRes);

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err);
    return NextResponse.json({ error: err?.message || "Webhook error" }, { status: 500 });
  }
}