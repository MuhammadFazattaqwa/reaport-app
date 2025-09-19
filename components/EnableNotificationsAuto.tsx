// components/EnableNotificationsAuto.tsx
"use client";
import { useEffect, useState } from "react";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) arr[i] = rawData.charCodeAt(i);
  return arr;
}

export default function EnableNotificationsAuto() {
  const [supported, setSupported] = useState(false);
  const [status, setStatus] = useState<"default" | "granted" | "denied">("default");
  const [techKey, setTechKey] = useState<string>("");

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window;
    setSupported(ok);
    setStatus(Notification.permission as any);

    const sp = new URLSearchParams(location.search);
    const fromQS = sp.get("technician") || "";
    const lsId = localStorage.getItem("technician_id") || "";
    const lsCode = localStorage.getItem("technician_code") || ""; // inisial, mis. "T"
    setTechKey(fromQS || lsId || lsCode || "");
  }, []);

  async function enable() {
    if (!supported || !techKey) return;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      setStatus(perm as any);
      if (perm !== "granted") return;
    }
    const reg = await navigator.serviceWorker.ready;

    const pub = await (await fetch("/api/pwa/vapid-public")).text();
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(pub.trim()),
    });

    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        technicianId: techKey,               // bisa UUID ATAU inisial
        subscription: sub.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });

    setStatus("granted");
  }

  if (!supported || !techKey) return null;

  return (
    <button
      onClick={enable}
      disabled={status === "granted"}
      className="px-3 py-2 rounded-xl bg-black/80 text-white disabled:opacity-50"
      title={status === "granted" ? "Notifikasi aktif" : "Aktifkan notifikasi"}
    >
      {status === "granted" ? "🔔 Notifikasi Aktif" : "🔔 Aktifkan Notifikasi"}
    </button>
  );
}
