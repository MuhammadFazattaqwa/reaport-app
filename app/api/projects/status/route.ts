import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";
import { nowWIBIso } from "@/lib/wib";

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const projectId: string = body?.projectId;
  const status: string = body?.status;
  const reason: string | undefined = body?.reason;

  if (!projectId || !status) {
    return NextResponse.json(
      { error: "projectId & status wajib diisi" },
      { status: 400 }
    );
  }

  // ✅ Status baru: Menunggu Persetujuan BAST
  if (status === "awaiting_bast") {
    const { error: upErr } = await supabaseServer
      .from("projects")
      .update({
        status: "awaiting_bast",
        project_status: "awaiting_bast",
        pending_reason: null,
        pending_since: null,
      })
      .eq("id", projectId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  // ✅ Selesai (manual oleh admin)
  if (status === "completed") {
    const nowIsoWIB = nowWIBIso();

    // 1) Tandai selesai (cap waktu WIB), turunkan ke unassigned agar tidak dianggap ongoing
    const { error: upErr } = await supabaseServer
      .from("projects")
      .update({
        status: "completed",
        project_status: "completed",
        pending_reason: null,
        completed_at: nowIsoWIB,
      })
      .eq("id", projectId);

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // 2) Putuskan semua assignment aktif
    const { error: rmErr } = await supabaseServer
      .from("project_assignments")
      .update({ removed_at: nowIsoWIB, is_leader: false })
      .eq("project_id", projectId)
      .is("removed_at", null);

    if (rmErr) {
      return NextResponse.json({ error: rmErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  }

  // 🔁 Status lain (unassigned | ongoing | pending)
  const payload: any = { project_status: status };
  payload.pending_reason = status === "pending" ? reason ?? null : null;

  const { error } = await supabaseServer
    .from("projects")
    .update(payload)
    .eq("id", projectId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
