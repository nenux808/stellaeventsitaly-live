import { Suspense } from "react";
import LoginClient from "./LoginClient";

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<div style={{ background: "#0b0b0f", minHeight: "100vh" }} />}>
      <LoginClient />
    </Suspense>
  );
}