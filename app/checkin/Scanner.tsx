"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

function extractToken(input: string) {
  const text = (input || "").trim();

  // If QR contains a URL, try token=...
  try {
    if (text.startsWith("http://") || text.startsWith("https://")) {
      const url = new URL(text);
      const t = url.searchParams.get("token");
      if (t) return t.trim();
    }
  } catch {
    // ignore
  }

  // Extract UUID if present anywhere
  const uuidMatch = text.match(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i
  );
  if (uuidMatch?.[0]) return uuidMatch[0].trim();

  // fallback: return full text
  return text;
}

export default function Scanner({
  onToken,
  onClose,
}: {
  onToken: (token: string) => void;
  onClose?: () => void;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  const qrRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);
  const handledRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    async function start() {
      setErr(null);
      setStarting(true);
      handledRef.current = false;

      try {
        const elId = "qr-reader";
        const qr = new Html5Qrcode(elId);
        qrRef.current = qr;

        const cameras = await Html5Qrcode.getCameras();
        const backCam =
          cameras?.find((c) => /back|rear|environment/i.test(c.label)) || cameras?.[0];

        if (!backCam) throw new Error("No camera found.");

        await qr.start(
          { deviceId: { exact: backCam.id } },
          {
            fps: 12,
            qrbox: (vw: number, vh: number) => {
              const size = Math.min(vw, vh, 320);
              return { width: size, height: size };
            },
            aspectRatio: 1.0,
            disableFlip: false,
          },
          async (decodedText: string) => {
            if (handledRef.current) return;
            handledRef.current = true;

            const token = extractToken(decodedText);
            onToken(token);

            try {
              await qr.stop();
              qr.clear();
            } catch {}

            if (mountedRef.current) onClose?.();
          },
          () => {}
        );

        if (mountedRef.current) setStarting(false);
      } catch (e: any) {
        console.error("Scanner start error:", e);
        if (mountedRef.current) {
          setErr(e?.message || "Camera/Scanner not supported on this device.");
          setStarting(false);
        }
      }
    }

    start();

    return () => {
      mountedRef.current = false;
      (async () => {
        try {
          const qr = qrRef.current;
          if (!qr) return;

          // stop if scanning
          try {
            const state = (qr as any).getState?.();
            if (state === 2 || state === "SCANNING") {
              await qr.stop();
            }
          } catch {}

          qr.clear();
        } catch {}
      })();
    };
  }, [onToken, onClose]);

  return (
    <div style={{ marginTop: 12 }}>
      <div
        id="qr-reader"
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid #2b2b33",
          background: "#000",
        }}
      />

      {starting ? (
        <div style={{ marginTop: 10, opacity: 0.8, fontSize: 13 }}>
          Opening camera…
        </div>
      ) : null}

      {err ? (
        <div style={{ marginTop: 10, color: "#ff6b6b", fontSize: 13 }}>
          {err} <span style={{ opacity: 0.85 }}>(You can still paste the token.)</span>
        </div>
      ) : null}
    </div>
  );
}