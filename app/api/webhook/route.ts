import Stripe from "stripe";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

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

export async function POST(req: Request) {
  const stripe = getStripe();
  const supabase = getSupabaseAdmin();
  const resend = getResend();

  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing stripe-signature" }, { status: 400 });

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "Missing STRIPE_WEBHOOK_SECRET" }, { status: 500 });

  // ✅ MUST use raw body exactly as Stripe sent it
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, secret);
  } catch (err: any) {
    console.error("❌ Webhook signature verification failed:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    // Only care about checkout completion
    if (event.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    const eventId = session.metadata?.event_id;
    const ticketTypeId = session.metadata?.ticket_type_id;
    const qty = Math.max(1, Math.min(10, Number(session.metadata?.quantity || 1)));
    const buyerEmail = session.metadata?.buyer_email || session.customer_email;
    const buyerName = session.metadata?.buyer_name || "";

    if (!eventId || !ticketTypeId || !buyerEmail) {
      console.error("❌ Missing required metadata:", session.metadata);
      return NextResponse.json({ error: "Missing required metadata" }, { status: 400 });
    }

    // ✅ Idempotency
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingOrder?.id) {
      return NextResponse.json({ received: true });
    }

    // Load event
    const { data: dbEvent, error: eventErr } = await supabase
      .from("events")
      .select("id,title,venue,address,start_at,slug")
      .eq("id", eventId)
      .single();
    if (eventErr || !dbEvent) throw new Error("Event not found in DB");

    // Load ticket type
    const { data: ticketType, error: ttErr } = await supabase
      .from("ticket_types")
      .select("id,name,price_cents,currency,capacity")
      .eq("id", ticketTypeId)
      .single();
    if (ttErr || !ticketType) throw new Error("Ticket type not found in DB");

    const currency = ticketType.currency ?? "EUR";
    const price = Number(ticketType.price_cents ?? 0);
    const capacity = Number(ticketType.capacity ?? 0);

    // Create order
    const total = price * qty;
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
    if (orderErr || !order) throw new Error(orderErr?.message || "Order insert failed");

    // Create tickets + QR
    const qrAttachments: { filename: string; content: string }[] = [];
    const ticketLines: string[] = [];

    for (let i = 0; i < qty; i++) {
      const token = randomUUID();
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

      if (ticketErr) throw new Error(ticketErr.message);

      const filename = `ticket-${i + 1}.png`;
      qrAttachments.push({
        filename,
        content: Buffer.from(pngBuffer).toString("base64"),
      });

      ticketLines.push(`
        <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:14px 0;background:#fff;">
          <div style="font-weight:800;margin-bottom:6px;">
            Ticket ${i + 1} — ${ticketType.name}
          </div>
          <div style="font-size:12px;color:#6b7280;">Ref: ${created?.id || token}</div>
        </div>
      `);
    }

    const from = process.env.EMAIL_FROM || process.env.TICKETS_FROM_EMAIL;
    if (!from) throw new Error("EMAIL_FROM (or TICKETS_FROM_EMAIL) is missing");

    const html = `
      <div style="font-family:Inter,system-ui,Arial,sans-serif; background:#0b0b0f; padding:24px;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;">
          <div style="padding:22px 22px 14px;border-bottom:1px solid #eef2f7;">
            <div style="font-size:12px;letter-spacing:1px;color:#6b7280;font-weight:700;">STELLA EVENTS</div>
            <div style="font-size:26px;font-weight:900;margin-top:6px;color:#111827;">
              Your Tickets — ${dbEvent.title}
            </div>
            <div style="margin-top:10px;color:#6b7280;">
              📍 ${dbEvent.venue}${dbEvent.address ? ` • ${dbEvent.address}` : ""}<br/>
              🗓️ ${new Date(dbEvent.start_at).toLocaleString("en-GB")}
            </div>
            <div style="margin-top:12px;color:#111827;">
              Hi ${buyerName || "there"},<br/>
              Payment confirmed ✅ Your QR ticket(s) are attached as PNG files.
            </div>
          </div>

          <div style="padding:18px 22px;background:#f9fafb;">
            ${ticketLines.join("")}
            <div style="margin-top:10px;color:#6b7280;font-size:13px;">
              Open the attached PNG(s) to view your QR code(s).
            </div>
          </div>

          <div style="padding:18px 22px;">
            <div style="color:#111827;">Enjoy the show 🍿</div>
            <div style="margin-top:10px;color:#6b7280;">— Stella Events</div>
          </div>
        </div>
      </div>
    `;

    await resend.emails.send({
      from,
      to: buyerEmail,
      subject: `🎟️ Your Tickets — ${dbEvent.title} (Stella Events)`,
      html,
      attachments: qrAttachments.map((a) => ({
        filename: a.filename,
        content: a.content,
        content_type: "image/png",
      })),
    });

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("❌ Webhook processing error:", err?.message || err);
    return NextResponse.json({ error: err?.message || "Webhook error" }, { status: 500 });
  }
}
