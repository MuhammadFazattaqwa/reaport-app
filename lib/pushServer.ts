// /lib/pushServer.ts
import webpush from "web-push";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const VAPID_PUBLIC_KEY  = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT     = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

type PushPayload = {
  title: string;
  body: string;
  url: string;
  icon?: string;
  badge?: string;
  tag?: string;
};

export async function sendPushToUser(userId: string, payload: PushPayload) {
  // Ambil semua device milik user
  const { data: subs, error } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId);

  if (error) throw error;
  if (!subs || subs.length === 0) return { delivered: 0 };

  let delivered = 0;

  await Promise.all(
    subs.map(async (s) => {
      const pushSub = {
        endpoint: s.endpoint,
        keys: { p256dh: s.p256dh, auth: s.auth },
      };

      try {
        await webpush.sendNotification(pushSub as any, JSON.stringify(payload));
        delivered++;
      } catch (err: any) {
        // 410/404 → subscription expired: hapus
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        }
        // selain itu, diamkan agar tidak gagal massal
      }
    })
  );

  return { delivered };
}
