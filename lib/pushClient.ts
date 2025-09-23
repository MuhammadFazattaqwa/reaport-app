// lib/pushClient.ts
"use client";

import { supabase } from "@/lib/supabaseBrowser";

/** ===================== Types ===================== **/
export type EnsurePushOptions = {
  /** Endpoint API untuk menyimpan/menautkan subscription di server (mis. "/api/push/subscribe") */
  subscribeEndpoint: string;
  /** Kembalikan email user saat ini (wajib untuk penautan user-subscription di server) */
  getEmail: () => string;

  /** Opsional: override VAPID public key (Base64 URL-safe). Jika tidak diisi, ambil dari env */
  vapidPublicKey?: string;

  /** Callback saat user menolak izin */
  onDenied?: () => void;
  /** Callback saat ada error apapun */
  onError?: (e: unknown) => void;

  /** Debug log ke console */
  debug?: boolean;
};

type SWRegistrationReady = ServiceWorkerRegistration;

/** ===================== Utils ===================== **/
function log(debug: boolean | undefined, ...args: any[]) {
  if (debug) console.debug("[pushClient]", ...args);
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/**
 * Base64 URL-safe -> Uint8Array<ArrayBuffer>
 *
 * Penting: kita membangun array dari **ArrayBuffer** secara eksplisit
 * agar kompatibel dengan definisi DOM terbaru yang mengharuskan BufferSource
 * berbasis ArrayBuffer, bukan sekadar ArrayBufferLike.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const b64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  // decode ke binary string
  let raw: string;
  if (typeof window !== "undefined" && typeof window.atob === "function") {
    raw = window.atob(b64);
  } else {
    // fallback (jarang dipakai karena file ini "use client")
    // @ts-ignore
    raw = typeof Buffer !== "undefined" ? Buffer.from(b64, "base64").toString("binary") : atob(b64);
  }

  // buat ArrayBuffer -> Uint8Array dari raw
  const len = raw.length;
  const arrayBuffer = new ArrayBuffer(len); // <- ArrayBuffer asli (bukan ArrayBufferLike)
  const output = new Uint8Array(arrayBuffer) as Uint8Array<ArrayBuffer>;
  for (let i = 0; i < len; i++) {
    output[i] = raw.charCodeAt(i);
  }
  return output;
}

/** Ambil VAPID public key dari opts/env (harus Base64 URL-safe) */
function resolveVapidPublicKey(override?: string): string | undefined {
  const fromGlobal =
    (typeof globalThis !== "undefined" &&
      ((globalThis as any).NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        (globalThis as any).VAPID_PUBLIC_KEY)) ||
    undefined;

  const fromEnv =
    (typeof process !== "undefined" &&
      (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
        process.env.VAPID_PUBLIC_KEY)) ||
    undefined;

  return override || fromGlobal || fromEnv || undefined;
}

/** Pastikan SW sudah siap; register '/sw.js' jika perlu */
async function getSWReady(debug?: boolean): Promise<SWRegistrationReady> {
  if (!isPushSupported()) throw new Error("Push/ServiceWorker tidak didukung browser ini.");
  try {
    const ready = await navigator.serviceWorker.ready;
    return ready;
  } catch {
    try {
      log(debug, "Mencoba register service worker /sw.js");
      await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      return await navigator.serviceWorker.ready;
    } catch (err) {
      throw new Error("Gagal register Service Worker: " + (err as any)?.message);
    }
  }
}

/** Ambil subscription yang ada (jika sudah pernah subscribe) */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return await reg.pushManager.getSubscription();
}

/** Unsubscribe dari Push (jika ada) */
export async function unsubscribePush(): Promise<boolean> {
  const sub = await getExistingSubscription();
  if (!sub) return true;
  try {
    const ok = await sub.unsubscribe();
    return ok;
  } catch {
    return false;
  }
}

/** ===================== Main: ensurePushSubscription ===================== **/
/**
 * Memastikan user:
 * 1) Punya permission (minta izin bila "default")
 * 2) Punya PushSubscription (buat kalau belum ada)
 * 3) Subscription terkirim ke server (Authorization Bearer dari Supabase)
 */
export async function ensurePushSubscription(opts: EnsurePushOptions): Promise<PushSubscription> {
  const { subscribeEndpoint, getEmail, onDenied, onError, vapidPublicKey, debug } = opts;
  try {
    if (!isPushSupported()) throw new Error("Push/Notification tidak didukung di browser ini.");

    const email = (getEmail?.() || "").trim();
    if (!email) throw new Error("Email user kosong saat menyiapkan push subscription.");

    // 1) Permission
    const currentPerm = Notification.permission; // "default" | "granted" | "denied"
    log(debug, "Permission awal:", currentPerm);

    if (currentPerm === "denied") {
      onDenied?.();
      throw new Error("User menolak notifikasi (permission = denied).");
    }

    if (currentPerm === "default") {
      const newPerm = await Notification.requestPermission();
      log(debug, "Permission setelah request:", newPerm);
      if (newPerm !== "granted") {
        if (newPerm === "denied") onDenied?.();
        throw new Error("Izin notifikasi tidak diberikan.");
      }
    }

    // 2) Service Worker ready
    const reg = await getSWReady(debug);

    // 3) Subscription
    let sub = await reg.pushManager.getSubscription();
    const vapidKey = resolveVapidPublicKey(vapidPublicKey);
    if (!vapidKey) {
      throw new Error(
        "VAPID public key tidak ditemukan. Siapkan NEXT_PUBLIC_VAPID_PUBLIC_KEY atau isi opts.vapidPublicKey."
      );
    }

    // Penting: gunakan UInt8Array<ArrayBuffer> agar type-nya cocok dengan BufferSource
    const appServerKey = urlBase64ToUint8Array(vapidKey);

    if (!sub) {
      log(debug, "Belum ada subscription. Membuat baru…");
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: appServerKey, // <- kompatibel
      });
    } else {
      log(debug, "Subscription sudah ada.");
      // (opsional) bisa validasi & resubscribe jika perlu
      // try { ... } catch { await sub.unsubscribe(); sub = await reg.pushManager.subscribe({...}); }
    }

    // 4) Kirim ke server (Authorization: Bearer dari Supabase)
    const { data: s } = await supabase.auth.getSession();
    const token = s?.session?.access_token;

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const payload = {
      email,
      subscription: (sub as any).toJSON ? (sub as any).toJSON() : sub,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    };

    log(debug, "Mengirim subscription ke server:", subscribeEndpoint, payload);

    const res = await fetch(subscribeEndpoint, {
      method: "POST",
      headers,
      credentials: "include",
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 401) {
        throw new Error(
          `Unauthorized (401) saat menyimpan subscription. Pastikan server membaca Authorization Bearer dari header. Detail: ${text || "-"}`
        );
      }
      throw new Error(`Gagal menyimpan subscription di server (status ${res.status}). ${text || ""}`);
    }

    log(debug, "Subscription tersimpan di server ✅");
    return sub;
  } catch (e) {
    onError?.(e);
    throw e;
  }
}

export default ensurePushSubscription;
