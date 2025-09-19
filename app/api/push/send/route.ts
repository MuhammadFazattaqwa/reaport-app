// app/api/push/send/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseServer } from "@/lib/supabaseServers";
import webpush from "web-push";

interface Payload {
  title: string;
  body?: string;
  url?: string;
  data?: Record<string, any>;
}

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { technicianId, payload } = body as { technicianId: string; payload: Payload };

    if (!technicianId || !payload?.title) {
      return NextResponse.json({ error: "technicianId & payload.title required" }, { status: 400 });
    }

    // ⬇️ panggil fungsi-nya
    const { data: subs, error } = await supabaseServer()
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("technician_id", String(technicianId));

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!subs?.length) return NextResponse.json({ ok: true, delivered: 0 });

    const notificationData = JSON.stringify(payload);

    let delivered = 0;
    await Promise.all(
      subs.map(async (s: SubscriptionRow) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: s.endpoint,
              keys: { p256dh: s.p256dh, auth: s.auth },
            } as any,
            notificationData
          );
          delivered += 1;
        } catch (err: any) {
          // 410 Gone / unsubscribed → bersihkan endpoint
          if (err?.statusCode === 410 || /gone|unsubscribe/i.test(String(err))) {
            await supabaseServer().from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      })
    );

    return NextResponse.json({ ok: true, delivered });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
