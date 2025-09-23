// lib/sendAssignmentPush.ts
import { createClient } from "@supabase/supabase-js";
import { webpush } from "./push"; // VAPID sudah dikonfigurasi di sini (tetap pakai punyamu)

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type Payload = {
  title: string;
  body: string;
  url: string;
  tag?: string;

  // 🔽 Field tambahan untuk SW agar bisa merapikan judul/body & deep-link
  projectId?: string;
  projectCode?: string;
  customer?: string;
  site?: string;
  image?: string;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_email: string;
};

/** Buat tag unik default agar notifikasi tidak ter-coalesce/ketimpa */
function makeUniqueTag(prefix = "assign"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Kirim push ke semua subscription milik list email.
 * - Menambahkan header Urgency & TTL agar cepat & relevan.
 * - Membersihkan subscription yang invalid (404/410).
 */
export async function sendPushToEmails(emails: string[], payload: Payload) {
  if (!emails.length) return;

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_email")
    .in("user_email", emails);

  if (error) throw error;
  if (!subs || !subs.length) return;

  // Pastikan setiap batch pengiriman ini punya tag unik bila tidak disediakan
  const effectiveTag = payload.tag || makeUniqueTag("assign");
  const finalPayload: Payload = { ...payload, tag: effectiveTag };

  const toDelete: string[] = [];

  await Promise.allSettled(
    (subs as SubscriptionRow[]).map(async (s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      } as any;

      try {
        await webpush.sendNotification(subscription, JSON.stringify(finalPayload), {
          TTL: 60,
          headers: {
            Urgency: "high",
            // Topic opsional; beberapa push service akan mengelompokkan berdasarkan ini
            Topic: effectiveTag,
          },
        });
      } catch (err: any) {
        const status = err?.statusCode ?? err?.status;
        if (status === 404 || status === 410) {
          toDelete.push(s.endpoint); // subscription sudah tidak valid → cleanup
        } else {
          console.error("[webpush] send error", status, err?.message);
        }
      }
    })
  );

  if (toDelete.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", toDelete);
  }
}
