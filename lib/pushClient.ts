// src/lib/pushClient.ts
"use client";

export type EnsureOptions = {
  /** API endpoint untuk menyimpan subscription di server */
  subscribeEndpoint?: string; // default: "/api/push/subscribe"

  /** Override VAPID public key (opsional). Default: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY */
  vapidPublicKey?: string;

  /** Re-subscribe jika subscription lama tidak punya keys p256dh/auth */
  resubscribeIfChanged?: boolean; // default: true

  /** Callback ketika user menolak permission */
  onDenied?: () => void;

  /** Callback error operasional (network/subscribe) */
  onError?: (e: unknown) => void;
};

type EnsureResult = {
  ok: boolean;
  reason?: string;
  status?: number;
};

const DEFAULT_SUBSCRIBE_ENDPOINT = "/api/push/subscribe";

/* =========================================================================
 * Utilities
 * ========================================================================= */
export function isPushSupported(): boolean {
  if (typeof window === "undefined") return false;
  return (
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Base64URL → Uint8Array */
export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw =
    typeof atob === "function"
      ? atob(base64)
      : Buffer.from(base64, "base64").toString("binary");
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/** Pastikan mengembalikan ArrayBuffer murni (bukan SharedArrayBuffer) */
function toApplicationServerKeyBuffer(vapidPublicKey: string): ArrayBuffer {
  const u8 = urlBase64ToUint8Array(vapidPublicKey);
  const ab = new ArrayBuffer(u8.byteLength);
  new Uint8Array(ab).set(u8);
  return ab;
}

/** Ambil registration; kalau belum ada, register /sw.js dulu */
async function getOrRegisterSW(): Promise<ServiceWorkerRegistration> {
  if (!("serviceWorker" in navigator))
    throw new Error("service worker not supported");
  const existing =
    (await navigator.serviceWorker.getRegistration()) ||
    (await navigator.serviceWorker.register("/sw.js"));
  // pastikan active/ready
  await navigator.serviceWorker.ready.catch(() => {});
  return existing;
}

/** Permission saat ini */
export async function getPermissionState(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window))
    return "denied";
  return Notification.permission;
}

/** Minta izin notifikasi jika belum granted */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!("Notification" in window)) return "denied";
  if (Notification.permission === "granted") return "granted";
  return Notification.requestPermission();
}

/** Ambil subscription aktif (jika ada) */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  const reg = await getOrRegisterSW();
  return reg.pushManager.getSubscription();
}

/** Unsubscribe (opsional: beritahu server di kemudian hari) */
export async function unsubscribePush(): Promise<boolean> {
  try {
    const sub = await getExistingSubscription();
    if (!sub) return true;
    return await sub.unsubscribe();
  } catch {
    return false;
  }
}

/* =========================================================================
 * ensurePushSubscription: pastikan ada subscription & simpan ke server
 * ========================================================================= */
export async function ensurePushSubscription(
  options: EnsureOptions = {}
): Promise<EnsureResult> {
  const {
    subscribeEndpoint = DEFAULT_SUBSCRIBE_ENDPOINT,
    onDenied,
    onError,
    resubscribeIfChanged = true,
  } = options;

  try {
    if (typeof window === "undefined") return { ok: false, reason: "ssr" };
    if (!isPushSupported()) return { ok: false, reason: "unsupported" };

    // Ambil VAPID public key (opsi > env)
    const vapidPublicKey =
      options.vapidPublicKey ||
      (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string | undefined) ||
      "";
    if (!vapidPublicKey) return { ok: false, reason: "missing_vapid_key" };

    // 1) Permission
    const permission = await requestNotificationPermission();
    if (permission !== "granted") {
      onDenied?.();
      return { ok: false, reason: "permission_denied" };
    }

    // 2) SW
    const registration = await getOrRegisterSW();

    // 3) Existing subscription
    let subscription = await registration.pushManager.getSubscription();

    // 4) Subscribe baru / resubscribe jika keys tidak lengkap
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toApplicationServerKeyBuffer(vapidPublicKey),
      });
    } else if (resubscribeIfChanged) {
      const json: any = subscription.toJSON?.() ?? {};
      const hasKeys = json?.keys?.p256dh && json?.keys?.auth;
      if (!hasKeys) {
        try {
          await subscription.unsubscribe();
        } catch {}
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toApplicationServerKeyBuffer(vapidPublicKey),
        });
      }
    }

    // 5) Upsert ke server: kirim { endpoint, keys:{p256dh,auth} }
    const json = subscription.toJSON?.() ?? {};
    const payload = {
      endpoint: json?.endpoint || subscription.endpoint,
      keys: {
        p256dh: json?.keys?.p256dh,
        auth: json?.keys?.auth,
      },
    };

    const res = await fetch(subscribeEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: "server_upsert_failed",
        status: res.status,
      };
    }

    return { ok: true };
  } catch (e) {
    onError?.(e);
    return {
      ok: false,
      reason: `subscribe_failed: ${String((e as any)?.message || e)}`,
    };
  }
}

/** Panggil otomatis sesudah login (tanpa tombol) */
export async function ensurePushAfterLogin(
  opts?: Partial<EnsureOptions>
): Promise<EnsureResult> {
  return ensurePushSubscription(opts ?? {});
}
