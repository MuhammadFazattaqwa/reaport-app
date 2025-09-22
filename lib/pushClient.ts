// /lib/pushClient.ts
export function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export async function ensurePushSubscribed(deviceLabel?: string) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { ok: false, reason: "no-push" };

  const reg = await navigator.serviceWorker.ready;

  // Cek permission
  let perm = Notification.permission;
  if (perm === "default") {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") return { ok: false, reason: "denied" };

  // Subscribe
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || (globalThis as any).NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidPublic) throw new Error("NEXT_PUBLIC_VAPID_PUBLIC_KEY missing");

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublic),
    });
  }

  // Simpan ke server
  const res = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ subscription: sub.toJSON(), deviceLabel }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("Failed to save subscription: " + text);
  }

  return { ok: true };
}
