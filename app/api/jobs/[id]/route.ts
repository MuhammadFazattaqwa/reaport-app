// app/api/jobs/[id]/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * PATCH /api/jobs/:id  (id = assignment_id)
 * Body (opsional):
 *  - location        -> projects.lokasi
 *  - assignmentDate  -> project_assignments.assigned_at (00:00 WIB -> timestamptz)
 *  - template        -> projects.template_key
 *  - notes           -> projects.pending_reason
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const assignmentId = params.id;
    const body = await request.json();
    const {
      location,
      assignmentDate,
      template,
      notes,
    }: {
      location?: string | null;
      assignmentDate?: string | null;
      template?: string | null;
      notes?: string | null;
    } = body || {};

    // 1) Ambil project_id dari assignment
    const { data: pa, error: paErr } = await supabaseAdmin
      .from("project_assignments")
      .select("id, project_id")
      .eq("id", assignmentId)
      .single();

    if (paErr || !pa) {
      return NextResponse.json(
        { error: "Penugasan tidak ditemukan." },
        { status: 404 }
      );
    }

    // 2) Update assigned_at bila ada assignmentDate
    if (assignmentDate !== undefined) {
      if (assignmentDate && !/^\d{4}-\d{2}-\d{2}$/.test(assignmentDate)) {
        return NextResponse.json(
          { error: "Format assignmentDate harus YYYY-MM-DD" },
          { status: 400 }
        );
      }
      if (assignmentDate) {
        // set ke 00:00 WIB
        const isoWib = new Date(
          `${assignmentDate}T00:00:00+07:00`
        ).toISOString();
        const { error: updAssignErr } = await supabaseAdmin
          .from("project_assignments")
          .update({ assigned_at: isoWib })
          .eq("id", assignmentId);

        if (updAssignErr) {
          return NextResponse.json(
            { error: updAssignErr.message },
            { status: 500 }
          );
        }
      }
    }

    // 3) Update kolom di projects bila ada perubahan
    const projPayload: Record<string, any> = {};
    if (location !== undefined) projPayload.lokasi = location || null;
    if (template !== undefined) projPayload.template_key = template || null;
    if (notes !== undefined) projPayload.pending_reason = notes || null;

    if (Object.keys(projPayload).length > 0) {
      const { error: updProjErr } = await supabaseAdmin
        .from("projects")
        .update(projPayload)
        .eq("id", pa.project_id);

      if (updProjErr) {
        return NextResponse.json(
          { error: updProjErr.message },
          { status: 500 }
        );
      }
    }

    // 4) Ambil ulang dari view agar response up-to-date
    const { data: row, error: vErr } = await supabaseAdmin
      .from("v_jobs_for_ui")
      .select("*")
      .eq("assignment_id", assignmentId)
      .single();

    if (vErr || !row) {
      return NextResponse.json(
        { error: "Gagal mengambil data job setelah update." },
        { status: 500 }
      );
    }

    const shaped = {
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
    };

    return NextResponse.json({ data: shaped });
  } catch {
    return NextResponse.json(
      { error: "Gagal memperbarui job" },
      { status: 500 }
    );
  }
}
