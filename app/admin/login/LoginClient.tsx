"use client";

import { useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

export default function LoginClient() {
  const sp = useSearchParams();
  const router = useRouter();
  const next = useMemo(() => sp.get("next") || "/admin", [sp]);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");

      router.push(next);
    } catch (e: any) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <main style={{ background: "#0b0b0f", color: "white", minHeight: "100vh" }}>
      <section style={{ maxWidth: 520, margin: "0 auto", padding: "60px 20px" }}>
        <div
          style={{
            border: "1px solid #23232b",
            borderRadius: 20,
            padding: 18,
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ opacity: 0.75, fontSize: 13, letterSpacing: 1, fontWeight: 900 }}>
            STELLA EVENTS
          </div>
          <h1 style={{ margin: "10px 0 6px", fontSize: 28, fontWeight: 950 }}>Organizer Login</h1>
          <div style={{ opacity: 0.85, lineHeight: 1.6 }}>
            Enter the admin password to view analytics and check-in stats.
          </div>

          <form onSubmit={submit} style={{ marginTop: 14 }}>
            <label style={{ display: "block", marginTop: 10, opacity: 0.85, fontSize: 13 }}>
              Password
            </label>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="Admin password"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                background: "#111118",
                color: "white",
                border: "1px solid #2b2b33",
                marginTop: 6,
                fontSize: 16,
              }}
              disabled={loading}
            />

            {err ? <div style={{ marginTop: 10, color: "#ff6b6b" }}>{err}</div> : null}

            <button
              className="se-btn se-btn-primary se-btn-block"
              type="submit"
              disabled={loading}
              style={{ marginTop: 14 }}
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}