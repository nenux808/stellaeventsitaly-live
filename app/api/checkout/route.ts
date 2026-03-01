import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// ✅ Stripe (explicit apiVersion helps avoid future breaking changes)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
});

// ✅ Supabase admin (server-side trust)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function jsonError(message: string, status = 500, extra?: Record<string, any>) {
  return NextResponse.json({ error: message, ...(extra || {}) }, { status });
}

export async function POST(req: Request) {
  try {
    // ✅ env guard
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return jsonError("Missing NEXT_PUBLIC_SUPABASE_URL");
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return jsonError("Missing SUPABASE_SERVICE_ROLE_KEY");
    if (!process.env.STRIPE_SECRET_KEY) return jsonError("Missing STRIPE_SECRET_KEY");

    const body = await req.json();
    const { eventId, ticketTypeId, quantity, buyerEmail, buyerName } = body;

    if (!eventId || !ticketTypeId || !quantity || !buyerEmail) {
      return jsonError("Missing fields", 400);
    }

    const qty = Math.max(1, Math.min(10, Number(quantity)));

    // ✅ Load event
    const { data: event, error: eventErr } = await supabaseAdmin
      .from("events")
      .select("id,title,slug,status")
      .eq("id", eventId)
      .single();

    if (eventErr) {
      console.error("Event query error:", eventErr);
      return jsonError("Event lookup failed", 500, { details: eventErr.message });
    }
    if (!event) return jsonError("Event not found", 404);
    if (event.status && event.status !== "published") return jsonError("Event not available", 400);

    // ✅ Load ticket type
    const { data: ticketType, error: ttErr } = await supabaseAdmin
      .from("ticket_types")
      .select("id,name,price_cents,currency,capacity,event_id")
      .eq("id", ticketTypeId)
      .single();

    if (ttErr) {
      console.error("Ticket type query error:", ttErr);
      return jsonError("Ticket type lookup failed", 500, { details: ttErr.message });
    }
    if (!ticketType) return jsonError("Ticket type not found", 404);

    // (optional safety) ensure ticket type belongs to event if you store event_id
    if (ticketType.event_id && ticketType.event_id !== eventId) {
      return jsonError("Ticket type does not match event", 400);
    }

    // ✅ Capacity verification (RPC first; fallback if RPC fails)
    let leftAfter: number | null = null;

    // ---- 1) Try RPC (atomic if your SQL function uses FOR UPDATE)
    const { data: capRes, error: capErr } = await supabaseAdmin.rpc("reserve_ticket_capacity", {
      p_ticket_type_id: ticketTypeId,
      p_qty: qty,
    });

    if (capErr) {
      // ✅ show actual error (this is what you needed)
      console.error("RPC reserve_ticket_capacity failed:", capErr);

      // ---- 2) Fallback: verify capacity with count query (non-atomic but OK for local testing)
      const cap = Number(ticketType.capacity) || 0;

      const { count, error: countErr } = await supabaseAdmin
        .from("tickets")
        .select("id", { count: "exact", head: true })
        .eq("ticket_type_id", ticketTypeId)
        .in("status", ["active", "checked_in"]);

      if (countErr || typeof count !== "number") {
        console.error("Fallback count failed:", countErr);
        return jsonError("Could not verify ticket capacity", 500, {
          details: capErr.message,
          fallback_error: countErr?.message || "Count missing",
        });
      }

      const left = Math.max(0, cap - count);
      if (left <= 0) return jsonError("Sold out", 400, { left });
      if (qty > left) return jsonError(`Only ${left} ticket(s) left.`, 400, { left });

      leftAfter = left - qty;
    } else {
      // RPC succeeded
      const row = Array.isArray(capRes) ? capRes[0] : capRes;

      // allow both jsonb and table-return shapes
      const ok = row?.ok ?? row?.OK ?? row?.success;
      const message = row?.message ?? row?.msg;
      const left = row?.left_after ?? row?.left ?? null;

      if (!ok) {
        return jsonError(message || "Sold out", 400, { left: left ?? 0 });
      }

      if (typeof left === "number") leftAfter = left;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // ✅ Stripe session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: buyerEmail,

      metadata: {
        event_id: eventId,
        ticket_type_id: ticketTypeId,
        quantity: String(qty),
        buyer_name: buyerName || "",
        buyer_email: buyerEmail,
        // helpful debugging
        left_after: leftAfter !== null ? String(leftAfter) : "",
      },

      line_items: [
        {
          quantity: qty,
          price_data: {
            currency: (ticketType.currency || "EUR").toLowerCase(),
            unit_amount: Number(ticketType.price_cents),
            product_data: {
              name: `${event.title} - ${ticketType.name}`,
            },
          },
        },
      ],

      success_url: `${appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/events/${event.slug}`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error("Checkout route error:", e);
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}