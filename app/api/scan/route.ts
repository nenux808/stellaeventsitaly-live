import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL is missing");
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is missing");

  return createClient(url, key);
}

export async function POST(req: Request) {
  try {
    const { token } = await req.json();

    if (!token || typeof token !== "string") {
      return NextResponse.json({ ok: false, message: "Missing token" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data, error } = await supabaseAdmin.rpc("checkin_by_token", {
      p_token: token.trim(),
    });

    if (error) {
      console.error("scan rpc error:", error);
      return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(row ?? { ok: false, message: "No response" });
  } catch (e: any) {
    console.error("scan route error:", e);
    return NextResponse.json(
      { ok: false, message: e.message || "Server error" },
      { status: 500 }
    );
  }
}