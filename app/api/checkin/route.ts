import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Detect column existence safely (PostgREST errors if a column doesn't exist)
async function hasColumn(supabase: SupabaseClient, column: string) {
  const { error } = await supabase.from("tickets").select(column).limit(1);
  return !error;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { token, pin } = body;

    if (!token) return NextResponse.json({ ok: false, reason: "MISSING_TOKEN" }, { status: 400 });

    // Optional PIN protection
    const CHECKIN_PIN = process.env.CHECKIN_PIN;
    if (CHECKIN_PIN && pin !== CHECKIN_PIN) {
      return NextResponse.json({ ok: false, reason: "UNAUTHORIZED" }, { status: 401 });
    }

    // Auto-detect token column
    const tokenCol = (await hasColumn(supabaseAdmin, "token"))
      ? "token"
      : (await hasColumn(supabaseAdmin, "qr_code"))
      ? "qr_code"
      : null;

    if (!tokenCol) {
      return NextResponse.json(
        { ok: false, reason: "SCHEMA_ERROR", details: "No token/qr_code column found in tickets table" },
        { status: 500 }
      );
    }

    // Does checked_in_at exist?
    const hasCheckedInAt = await hasColumn(supabaseAdmin, "checked_in_at");

    // 1) Find ticket by token (no joins)
    const { data: ticket, error: tErr } = await supabaseAdmin
      .from("tickets")
      .select("id,status,checked_in_at,event_id,ticket_type_id")
      .eq(tokenCol, token)
      .single();

    if (tErr || !ticket) {
      console.error("Ticket lookup error:", tErr);
      return NextResponse.json({ ok: false, reason: "INVALID_TICKET" }, { status: 404 });
    }

    // 2) Fetch event + ticket type safely (optional)
    const [{ data: ev }, { data: tt }] = await Promise.all([
      ticket.event_id
        ? supabaseAdmin.from("events").select("title,venue,start_at").eq("id", ticket.event_id).maybeSingle()
        : Promise.resolve({ data: null }),
      ticket.ticket_type_id
        ? supabaseAdmin.from("ticket_types").select("name").eq("id", ticket.ticket_type_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    // Already checked in
    if (ticket.checked_in_at || ticket.status === "checked_in") {
      return NextResponse.json(
        {
          ok: false,
          reason: "ALREADY_USED",
          checked_in_at: ticket.checked_in_at ?? null,
          event: ev ?? null,
          ticketType: tt ?? null,
        },
        { status: 400 }
      );
    }

    if (ticket.status !== "active") {
      return NextResponse.json(
        { ok: false, reason: "NOT_ACTIVE", event: ev ?? null, ticketType: tt ?? null },
        { status: 400 }
      );
    }

    // 3) Update ticket
    const nowIso = new Date().toISOString();
    const updatePayload: Record<string, any> = { status: "checked_in" };
    if (hasCheckedInAt) updatePayload.checked_in_at = nowIso;

    const { error: uErr } = await supabaseAdmin
      .from("tickets")
      .update(updatePayload)
      .eq("id", ticket.id);

    if (uErr) {
      console.error("Ticket update error:", uErr);
      return NextResponse.json(
        { ok: false, reason: "UPDATE_FAILED", details: uErr.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      checked_in_at: hasCheckedInAt ? nowIso : null,
      event: ev ?? null,
      ticketType: tt ?? null,
    });
  } catch (e: any) {
    console.error("CHECKIN API ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: "SERVER_ERROR", details: e.message || "Server error" },
      { status: 500 }
    );
  }
}