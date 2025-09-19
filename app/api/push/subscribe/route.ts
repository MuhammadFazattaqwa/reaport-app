// app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { supabaseServer } from "@/lib/supabaseServers";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { technicianId, subscription, userAgent } = body || {};

    if (!technicianId || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "technicianId & subscription required" }, { status: 400 });
    }

    const payload = {
      technician_id: String(technicianId),
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      user_agent: userAgent || null,
    };

    // ⬇️ panggil fungsi-nya
    const { error } = await supabaseServer()
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "endpoint" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown" }, { status: 500 });
  }
}
