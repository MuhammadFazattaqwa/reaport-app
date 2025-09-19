// /app/api/attendance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const projectId = searchParams.get("projectId");
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  let q = supabaseServer
    .from("attendance")
    .select("project_id, technician_id, work_date, project_leader");

  // Filter tanggal
  if (date) {
    q = q.eq("work_date", date);
  } else if (from || to) {
    if (from) q = q.gte("work_date", from);
    if (to) q = q.lte("work_date", to);
    // tanpa date & tanpa from/to → ambil seluruh riwayat
  }

  // Filter proyek (opsional)
  if (projectId) q = q.eq("project_id", projectId);

  // Urutkan agar "history" enak dibaca
  q = q.order("work_date", { ascending: true });

  const { data, error } = await q;
  if (error) {
    console.error("[GET /api/attendance] error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
