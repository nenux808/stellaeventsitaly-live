import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";
import QRCode from "qrcode";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

/**
 * ✅ FINAL WEBHOOK
 * Path: app/api/webhook/route.ts
 */

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is missing");
  return new Stripe(key);
}

function getAdmin() {
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

/**
 * Detect optional columns on tickets table to avoid PGRST204 crashes.
 */
async function detectTicketColumns(supabase: SupabaseClient) {
  const result = {
    buyer_email: false,
    buyer_name: false,
    stripe_session_id: false,
  };

  const probes: Array<keyof typeof result> = ["buyer_email", "buyer_name", "stripe_session_id"];

  for (const col of probes) {
    const { error } = await supabase.from("tickets").select(col).limit(1);
    if (!error) result[col] = true;
  }

  return result;
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  if (!sig) return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });

  const stripe = getStripe();
  const supabase = getAdmin();
  const resend = getResend();

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET is missing" }, { status: 500 });
  }

  const rawBody = await req.text();

  let stripeEvent: Stripe.Event;
  try {
    stripeEvent = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err: any) {
    console.error("Webhook signature error:", err?.message);
    return new Response(`Webhook Error: ${err?.message}`, { status: 400 });
  }

  try {
    // Only process successful checkout completion
    if (stripeEvent.type !== "checkout.session.completed") {
      return NextResponse.json({ received: true });
    }

    const session = stripeEvent.data.object as Stripe.Checkout.Session;

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

    // ---- Load event ----
    const { data: dbEvent, error: eventErr } = await supabase
      .from("events")
      .select("id,title,venue,address,start_at")
      .eq("id", eventId)
      .single();

    if (eventErr || !dbEvent) throw new Error("Event not found in DB");

    // ---- Load ticket type ----
    const { data: ticketType, error: ttErr } = await supabase
      .from("ticket_types")
      .select("id,name,price_cents,currency,capacity")
      .eq("id", ticketTypeId)
      .single();

    if (ttErr || !ticketType) throw new Error("Ticket type not found in DB");

    const currency = ticketType.currency ?? "EUR";
    const price = Number(ticketType.price_cents ?? 0);
    const capacity = Number(ticketType.capacity ?? 0);
    const hasCap = Number.isFinite(capacity) && capacity > 0;

    // Capacity re-check
    if (hasCap) {
      const { count, error: countErr } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("ticket_type_id", ticketTypeId)
        .in("status", ["active", "checked_in"]);

      if (countErr) throw new Error("Failed to check capacity");

      const sold = Number(count ?? 0);
      const left = Math.max(0, capacity - sold);

      if (left <= 0) return NextResponse.json({ error: "Sold out" }, { status: 409 });
      if (qty > left) return NextResponse.json({ error: `Only ${left} ticket(s) left.` }, { status: 409 });
    }

    // Detect optional ticket columns once
    const ticketCols = await detectTicketColumns(supabase);

    // ---- Idempotency with resume safety ----
    let orderId: string | null = null;

    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("stripe_session_id", session.id)
      .maybeSingle();

    if (existingOrder?.id) {
      orderId = existingOrder.id;

      const { count: ticketCount } = await supabase
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("order_id", orderId);

      if ((ticketCount ?? 0) > 0) {
        console.log("ℹ️ Order exists and tickets exist. Skipping duplicate work:", orderId);
        return NextResponse.json({ received: true });
      }

      console.log("ℹ️ Order exists but tickets missing. Resuming ticket creation for:", orderId);
    }

    // ---- Create ORDER row if needed ----
    if (!orderId) {
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

      if (orderErr || !order) throw new Error("Order insert failed");
      orderId = order.id;
    }

    // ---- Create tickets + QR attachments ----
    const qrAttachments: { filename: string; content: string }[] = [];
    const ticketBlocks: string[] = [];

    for (let i = 0; i < qty; i++) {
      const token = randomUUID();

      const pngBuffer = await QRCode.toBuffer(token, { width: 420, margin: 1 });
      const filename = `ticket-${i + 1}.png`;

      const insertPayload: Record<string, any> = {
        order_id: orderId,
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        token,
        status: "active",
      };

      if (ticketCols.buyer_email) insertPayload.buyer_email = buyerEmail;
      if (ticketCols.buyer_name) insertPayload.buyer_name = buyerName;
      if (ticketCols.stripe_session_id) insertPayload.stripe_session_id = session.id;

      const { error: ticketErr, data: created } = await supabase
        .from("tickets")
        .insert(insertPayload)
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

      // ✅ No CID inline images (attachments only)
      ticketBlocks.push(`
        <div style="border:1px solid #e5e7eb;border-radius:14px;padding:14px;margin:14px 0;background:#fff;">
          <div style="font-weight:800;margin-bottom:6px;color:#111827;">
            Ticket ${i + 1} — ${ticketType.name} (${formatEUR(price)})
          </div>
          <div style="margin-top:8px;font-size:13px;color:#111827;">
            QR Code is attached as <b>${filename}</b>
          </div>
          <div style="margin-top:8px;font-size:12px;color:#6b7280;">
            Ref: ${created?.id || token}
          </div>
        </div>
      `);
    }

    console.log("✅ Tickets created:", qty);

    // ---- Email ----
    const movieTitle = dbEvent.title || "Movie Show";

    const html = `
      <div style="font-family:Inter,system-ui,Arial,sans-serif;background:#0b0b0f;padding:24px;">
        <div style="max-width:720px;margin:0 auto;background:#ffffff;border-radius:18px;overflow:hidden;">
          <div style="padding:22px 22px 14px;border-bottom:1px solid #eef2f7;">
            <div style="font-size:12px;letter-spacing:1px;color:#6b7280;font-weight:700;">STELLA EVENTS</div>
            <div style="font-size:26px;font-weight:900;margin-top:6px;color:#111827;">
              Your Tickets — ${movieTitle}
            </div>

            <div style="margin-top:10px;color:#111827;">
              <div style="font-weight:800;">${movieTitle}</div>
              <div style="color:#6b7280;margin-top:6px;">
                📍 ${dbEvent.venue}${dbEvent.address ? ` • ${dbEvent.address}` : ""}<br/>
                🗓️ ${formatDateTime(dbEvent.start_at)}
              </div>
            </div>

            <div style="margin-top:12px;color:#111827;">
              Hi ${buyerName || "there"},<br/>
              Payment confirmed ✅ Your QR ticket(s) are attached as PNG files. Show them at the entrance.
            </div>
          </div>

          <div style="padding:18px 22px;background:#f9fafb;">
            ${ticketBlocks.join("")}
            <div style="margin-top:10px;color:#6b7280;font-size:13px;">
              Open the attached PNG(s) to view your QR code(s).
            </div>
          </div>

          <div style="padding:18px 22px;">
            <div style="color:#111827;">Enjoy the show 🍿</div>
            <div style="margin-top:10px;color:#6b7280;">— Stella Events</div>
            <div style="margin-top:14px;color:#9ca3af;font-size:12px;">
              Powered by NENUX WEB SOLUTIONS
            </div>
          </div>
        </div>
      </div>
    `;

    const from = process.env.EMAIL_FROM || process.env.TICKETS_FROM_EMAIL;
    if (!from) throw new Error("EMAIL_FROM is missing");

    // Send email (attachments only)
    let sendRes: any;
    try {
      sendRes = await resend.emails.send({
        from,
        to: buyerEmail,
        subject: `🎟️ Your Tickets — ${movieTitle} (Stella Events)`,
        html,
        attachments: qrAttachments.map((a) => ({
          filename: a.filename,
          content: a.content,
          content_type: "image/png",
        })),
      });
    } catch (e: any) {
      console.error("❌ Resend threw an exception:", e);
      throw new Error(e?.message || "Resend send failed");
    }

    if (sendRes?.error) {
      console.error("❌ Resend API error:", sendRes.error);
      return NextResponse.json({ error: "Email send failed", details: sendRes.error }, { status: 500 });
    }

    console.log("✅ Email sent:", sendRes?.data?.id || sendRes);

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("Webhook processing error:", err);
    return NextResponse.json({ error: err?.message || "Webhook error" }, { status: 500 });
  }
}