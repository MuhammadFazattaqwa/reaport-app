// lib/sendAssignmentPush.ts
import { createClient } from "@supabase/supabase-js";
import { webpush } from "./push";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Payload = {
  title: string;
  body: string;
  url: string;
  tag?: string; // jika tidak diisi, kita buat unik otomatis per pengiriman
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

export async function sendPushToEmails(emails: string[], payload: Payload) {
  if (!emails.length) return;

  // Ambil semua subscription untuk list email
  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint,p256dh,auth,user_email")
    .in("user_email", emails);

  if (error) throw error;
  if (!subs || !subs.length) return;

  // Pastikan setiap "batch" pengiriman ini punya tag unik bila tidak disediakan
  const effectiveTag = payload.tag || makeUniqueTag("assign");
  const finalPayload = { ...payload, tag: effectiveTag };

  const toDelete: string[] = [];

  await Promise.allSettled(
    (subs as SubscriptionRow[]).map((s) => {
      const subscription = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      } as any;

      // Dorong segera dengan urgensi tinggi; TTL pendek agar relevan
      return webpush
        .sendNotification(subscription, JSON.stringify(finalPayload), {
          TTL: 60,
          headers: {
            Urgency: "high", // prioritaskan delivery
            // Topic header opsional; beberapa push service akan treat sebagai grouping
            // Kita isi sama dengan tag agar konsisten
            Topic: effectiveTag,
          },
        })
        .catch(async (err: any) => {
          const status = err?.statusCode ?? err?.status;
          if (status === 404 || status === 410) {
            // subscription sudah tidak valid → cleanup
            toDelete.push(s.endpoint);
          } else {
            console.error("[webpush] send error", status, err?.message);
          }
        });
    })
  );

  if (toDelete.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", toDelete);
  }
}
