// /app/api/push/subscribe/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const subscription = body?.subscription;
    const deviceLabel = body?.deviceLabel || null;

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const supabase = supabaseServer();
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = {
      user_id: user.id,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      device_label: deviceLabel,
    };

    // UPSERT by (user_id, endpoint)
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(payload, { onConflict: "user_id,endpoint", ignoreDuplicates: false });

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Server error" }, { status: 500 });
  }
}
