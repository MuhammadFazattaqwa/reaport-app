// app/api/push/subscribe/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmins } from "@/lib/supabaseAdmin"; // service-role, BYPASS RLS

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email: string | undefined = body?.email;
    const subscription: any = body?.subscription;
    const userAgent: string | undefined = body?.userAgent;

    if (
      !email ||
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth
    ) {
      return NextResponse.json(
        { error: "Bad payload: require { email, subscription{endpoint, keys{p256dh,auth}} }" },
        { status: 400 }
      );
    }

    const sa = supabaseAdmins(); // service-role client
    // Pastikan tabel push_subscriptions punya kolom:
    // endpoint (text, UNIQUE), p256dh (text), auth (text),
    // user_email (text), user_agent (text, nullable), updated_at (timestamptz)
    const { error } = await sa
      .from("push_subscriptions")
      .upsert(
        {
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
          user_email: email,
          user_agent: userAgent || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "endpoint" }
      );

    if (error) {
      console.error("[push/subscribe] upsert error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[push/subscribe] fatal:", e);
    return NextResponse.json(
      { error: e?.message || String(e) },
      { status: 500 }
    );
  }
}
