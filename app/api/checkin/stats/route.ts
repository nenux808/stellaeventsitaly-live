import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    if (!eventId) return NextResponse.json({ error: "Missing eventId" }, { status: 400 });

    // total sold = active + checked_in
    const soldRes = await supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .in("status", ["active", "checked_in"]);

    const checkedRes = await supabaseAdmin
      .from("tickets")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId)
      .eq("status", "checked_in");

    const sold = soldRes.count ?? 0;
    const checkedIn = checkedRes.count ?? 0;

    // optional: capacity from ticket_types sum
    const { data: types } = await supabaseAdmin
      .from("ticket_types")
      .select("capacity")
      .eq("event_id", eventId);

    const capacity =
      types && types.length
        ? types.reduce((sum, t: any) => sum + (Number(t.capacity) || 0), 0)
        : null;

    const left = capacity ? Math.max(0, capacity - sold) : null;

    const { data: ev } = await supabaseAdmin
      .from("events")
      .select("id,title")
      .eq("id", eventId)
      .single();

    return NextResponse.json({
      ok: true,
      sold,
      checkedIn,
      left,
      event: ev ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}