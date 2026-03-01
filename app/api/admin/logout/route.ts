import { NextResponse } from "next/server";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set("se_admin", "0", { path: "/", maxAge: 0 });
  return res;
}