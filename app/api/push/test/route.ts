// /app/api/push/test/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";
import { sendPushToUser } from "@/lib/pushServer";

export async function POST() {
  const supabase = supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const base = process.env.NEXT_PUBLIC_BASE_URL || "";
  const url = base + "/user/dashboard";

  const res = await sendPushToUser(auth.user.id, {
    title: "Tes Notifikasi",
    body: "Ini hanya tes notifikasi untuk perangkat Anda.",
    url,
    tag: "test",
  });

  return NextResponse.json({ ok: true, ...res });
}
