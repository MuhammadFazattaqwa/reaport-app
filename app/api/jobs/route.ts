// app/api/jobs/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("v_jobs_for_ui")
    .select("*")
    .order("assignment_date", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shaped = (data ?? []).map((row: any) => ({
    id: row.job_id as string,
    assignmentId: row.assignment_id as string,
    jobName: row.job_name as string,
    location: row.lokasi as string,
    assignmentDate: row.assignment_date
      ? String(row.assignment_date).slice(0, 10)
      : "",
    technicianId: row.technician_id as string,
    technicianName: row.technician_name as string,
    status: (row.status === "selesai" ? "selesai" : "ditugaskan") as
      | "ditugaskan"
      | "selesai",
    template: (row.template_key ?? "Template A") as string,
    notes: (row.notes ?? "") as string,
  }));

  return NextResponse.json({ data: shaped });
}

/**
 * DELETE /api/jobs?id=<assignment_id>
 * Soft-delete: set removed_at = now() agar status jadi "selesai".
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "assignment_id (id) diperlukan" },
        { status: 400 }
      );
    }

    // Tandai selesai (soft-delete)
    const { data, error } = await supabaseAdmin
      .from("project_assignments")
      .update({ removed_at: new Date().toISOString() })
      .eq("id", id)
      .is("removed_at", null)
      .select("id");

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    // Jika sudah pernah dihapus/selesai, anggap OK untuk idempotensi
    if (!data || data.length === 0) {
      return NextResponse.json({
        message:
          "Penugasan sudah dalam status selesai atau tidak ditemukan. Tidak ada perubahan.",
      });
    }

    return NextResponse.json({ message: "Penugasan ditandai selesai." });
  } catch {
    return NextResponse.json(
      { error: "Gagal menghapus (menandai selesai) penugasan" },
      { status: 500 }
    );
  }
}
