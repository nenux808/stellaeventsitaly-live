"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

export default function Scanner({ onToken }: { onToken: (token: string) => void }) {
  const [err, setErr] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    let qr: Html5Qrcode | null = null;

    async function start() {
      try {
        const elId = "qr-reader";
        qr = new Html5Qrcode(elId);

        // Start only once
        if (started.current) return;
        started.current = true;

        await qr.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 280, height: 280 } },
          (decodedText) => {
            onToken(decodedText);
          },
          () => {}
        );
      } catch (e: any) {
        setErr(e?.message || "Camera/Scanner not supported on this device.");
      }
    }

    start();

    return () => {
      (async () => {
        try {
          if (qr) await qr.stop();
          qr?.clear();
        } catch {}
      })();
    };
  }, [onToken]);

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
          background: "#0b0b0f",
        }}
      />
      {err ? (
        <div style={{ marginTop: 10, color: "#ff6b6b", fontSize: 13 }}>
          {err} (Use paste token method.)
        </div>
      ) : null}
    </div>
  );
}