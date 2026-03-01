"use client";

export default function AdminLogoutButton() {
  return (
    <button
      className="se-btn se-btn-ghost"
      type="button"
      onClick={async () => {
        await fetch("/api/admin/logout", { method: "POST" });
        window.location.href = "/admin/login";
      }}
    >
      Logout
    </button>
  );
}