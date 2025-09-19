// components/EnableNotifications.tsx
"use client";
import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function EnableNotifications({ technicianId }: { technicianId: string }) {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<"idle" | "granted" | "denied" | "default">("idle");

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    if (ok) setStatus(Notification.permission as any);
  }, []);

  async function enable() {
    try {
      if (!supported) return;

      if (Notification.permission !== "granted") {
        const perm = await Notification.requestPermission();
        setStatus(perm as any);
        if (perm !== "granted") return;
      }

      const reg = await navigator.serviceWorker.ready;

      const resp = await fetch("/api/pwa/vapid-public");
      const publicKey = (await resp.text()).trim();
      if (!publicKey) throw new Error("VAPID public key not found");

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          technicianId,
          subscription: sub.toJSON(),
          userAgent: navigator.userAgent,
        }),
      });

      setStatus("granted");
    } catch (e) {
      console.error("[EnableNotifications]", e);
    }
  }

  if (!supported) return null;

  return (
    <button
      onClick={enable}
      className="px-3 py-2 rounded-xl bg-black/80 text-white hover:bg-black disabled:opacity-50"
      disabled={status === "granted"}
      title={status === "granted" ? "Notifikasi aktif" : "Aktifkan notifikasi"}
    >
      {status === "granted" ? "🔔 Notifikasi Aktif" : "🔔 Aktifkan Notifikasi"}
    </button>
  );
}
