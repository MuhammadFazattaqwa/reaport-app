// /lib/pushClient.ts
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!;

function urlB64ToUint8Array(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

async function saveSubscription(sub: PushSubscription) {
  const payload = {
    endpoint: sub.endpoint,
    keys: {
      p256dh: (sub.toJSON() as any)?.keys?.p256dh,
      auth: (sub.toJSON() as any)?.keys?.auth,
    },
  };
  await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

/** Panggil sekali sesudah user berhasil login (mis. di layout halaman private) */
export async function ensurePushAfterLogin() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

  // Pastikan SW terdaftar
  const reg =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"));

  // Kalau belum pernah diprompt, minta izin otomatis
  if (Notification.permission === "default") {
    try { await Notification.requestPermission(); } catch {}
  }

  if (Notification.permission !== "granted") return;

  // Subscribe jika belum ada
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
    }));

  await saveSubscription(sub);
}
