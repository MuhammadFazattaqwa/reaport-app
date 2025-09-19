// app/api/stats/dashboard/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  try {
    // 1) Pekerjaan Selesai = semua project yang punya completed_at
    const c1 = await supabaseAdmin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .not("completed_at", "is", null);

    if (c1.error) throw c1.error;
    const completedCount = c1.count ?? 0;

    // 2) Sedang Berlangsung = belum completed + project_status = 'ongoing'
    const c2 = await supabaseAdmin
      .from("projects")
      .select("id", { count: "exact", head: true })
      .is("completed_at", null)
      .eq("project_status", "ongoing");

    if (c2.error) throw c2.error;
    const ongoingCount = c2.count ?? 0;

    // 3) Laporan Dibuat = jumlah baris di generated_reports (opsional)
    let reportsCount = 0;
    let reportsTableMissing = false;

    const r = await supabaseAdmin
      .from("generated_reports")
      .select("id", { count: "exact", head: true });

    if (r.error) {
      // kalau tabel belum ada, anggap 0 & beri flag (tidak dianggap error fatal)
      reportsTableMissing = /does not exist/i.test(r.error.message);
      if (!reportsTableMissing) throw r.error;
    } else {
      reportsCount = r.count ?? 0;
    }

    return NextResponse.json({
      data: { completedCount, ongoingCount, reportsCount },
      reportsTableMissing,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to fetch dashboard stats" },
      { status: 500 }
    );
  }
}
