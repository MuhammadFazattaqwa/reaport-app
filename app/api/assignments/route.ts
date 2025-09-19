// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer"; // sesuai import kamu
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type ShapedAssignment = {
  projectId: string;
  technicianId: string; // UUID teknisi ATAU "car-01" untuk kendaraan
  technicianName: string; // untuk kendaraan boleh isi model
  inisial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
};

/* ===================== Helpers Waktu ===================== */
function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}
function prevDate(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1);
  dt.setDate(dt.getDate() - 1);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function toWIBDate(isoTs?: string | null) {
  if (!isoTs) return null;
  const t = new Date(isoTs);
  if (Number.isNaN(t.getTime())) return null;
  const wibMs = t.getTime() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().slice(0, 10);
}
function initialFrom(text: string) {
  const raw = String(text || "").trim();
  if (!raw) return "?";
  const tokens = raw.split(/\s+/);
  let tok = tokens[tokens.length - 1] || tokens[0] || "";
  if (!/[A-Za-z\u00C0-\u024F]/.test(tok)) tok = tokens[0] || "";
  const ch = (tok.match(/[A-Za-z\u00C0-\u024F]/) || [tok[0] || "?"])[0];
  return (ch || "?").toUpperCase();
}

/* ====================================================================== */
/* ===============================  GET  ================================ */
/* ====================================================================== */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  if (!date) {
    return NextResponse.json(
      { error: "Query ?date=YYYY-MM-DD wajib ada" },
      { status: 400 }
    );
  }

  /* ------------------------------------------------------------------ */
  /*  A) Coba ambil dari project_assignments (harian, gabungan)        */
  /* ------------------------------------------------------------------ */
  const { data: paDaily, error: paDailyErr } = await supabaseServer
    .from("project_assignments")
    .select("project_id, technician_id, vehicle_id, is_leader, removed_at")
    .eq("work_date", date)
    .is("removed_at", null);

  if (paDailyErr) {
    return NextResponse.json({ error: paDailyErr.message }, { status: 500 });
  }

  if ((paDaily?.length ?? 0) > 0) {
    // Ambil metadata teknisi & kendaraan
    const techIds = Array.from(
      new Set(
        paDaily
          .filter((r) => r.technician_id)
          .map((r) => r.technician_id as string)
      )
    );
    const vehIds = Array.from(
      new Set(
        paDaily.filter((r) => r.vehicle_id).map((r) => r.vehicle_id as string)
      )
    );

    // teknisi
    let techMap = new Map<string, { inisial: string; name: string }>();
    if (techIds.length) {
      const { data: techs, error: tErr } = await supabaseServer
        .from("technicians")
        .select("id, inisial, nama_panggilan, nama_lengkap")
        .in("id", techIds);
      if (tErr)
        return NextResponse.json({ error: tErr.message }, { status: 500 });
      for (const t of techs ?? []) {
        techMap.set(t.id, {
          inisial: String(t.inisial ?? "?").toUpperCase(),
          name:
            (t.nama_panggilan as string | null) ??
            (t.nama_lengkap as string | null) ??
            String(t.id),
        });
      }
    }

    // kendaraan
    let vehMap = new Map<string, { code: string; model: string }>();
    if (vehIds.length) {
      const { data: vehs, error: vErr } = await supabaseServer
        .from("vehicles")
        .select("id, vehicle_code, model, name")
        .in("id", vehIds);
      if (vErr)
        return NextResponse.json({ error: vErr.message }, { status: 500 });
      for (const v of vehs ?? []) {
        vehMap.set(v.id, {
          code: v.vehicle_code,
          model: v.model ?? v.name ?? "",
        });
      }
    }

    const shaped: ShapedAssignment[] = [];
    for (const r of paDaily ?? []) {
      if (r.technician_id) {
        const meta = techMap.get(r.technician_id);
        shaped.push({
          projectId: r.project_id,
          technicianId: r.technician_id, // UUID teknisi
          technicianName: meta?.name ?? r.technician_id,
          inisial: meta?.inisial ?? "?",
          isProjectLeader: !!r.is_leader,
          isSelected: true,
        });
      } else if (r.vehicle_id) {
        const meta = vehMap.get(r.vehicle_id);
        const model = meta?.model ?? "";
        shaped.push({
          projectId: r.project_id,
          technicianId: meta?.code || "car-??", // <- dipakai UI kendaraan
          technicianName: model || (meta?.code ?? "Kendaraan"),
          inisial: initialFrom(model || meta?.code || "C"),
          isProjectLeader: !!r.is_leader,
          isSelected: true,
        });
      }
    }

    return NextResponse.json({ data: shaped });
  }

  /* ------------------------------------------------------------------ */
  /*  B) Fallback: logika lama (attendance H & carry D-1) — teknisi     */
  /* ------------------------------------------------------------------ */
  const dMinus1 = prevDate(date);

  // 0) Attendance H & D-1
  const [
    { data: attToday, error: attErr },
    { data: attPrev, error: attPrevErr },
  ] = await Promise.all([
    supabaseServer
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", date),
    supabaseServer
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", dMinus1),
  ]);

  if (attErr)
    return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (attPrevErr)
    return NextResponse.json({ error: attPrevErr.message }, { status: 500 });

  const todayCountByProject = new Map<string, number>();
  const selectedTodaySet = new Set<string>();
  const leaderTodaySet = new Set<string>();
  for (const r of attToday ?? []) {
    const key = `${r.project_id}::${r.technician_id}`;
    selectedTodaySet.add(key);
    todayCountByProject.set(
      r.project_id,
      (todayCountByProject.get(r.project_id) ?? 0) + 1
    );
    if (r.project_leader) leaderTodaySet.add(key);
  }

  const prevByProject = new Map<
    string,
    Array<{
      project_id: string;
      technician_id: string;
      project_leader?: boolean;
    }>
  >();
  for (const r of attPrev ?? []) {
    const arr = prevByProject.get(r.project_id) ?? [];
    arr.push(r);
    prevByProject.set(r.project_id, arr);
  }

  // 1) Membership aktif (ambil info teknisi via relasi)
  const { data: pa, error: paErr } = await supabaseServer
    .from("project_assignments")
    .select(
      `
      project_id,
      technician_id,
      technician_name,
      is_leader,
      removed_at,
      technicians:technician_id ( id, inisial, nama_lengkap, nama_panggilan )
    `
    )
    .is("removed_at", null);

  if (paErr)
    return NextResponse.json({ error: paErr.message }, { status: 500 });

  const activeMembershipSet = new Set<string>();
  const membershipLeaderKeys = new Set<string>();
  for (const row of pa ?? []) {
    if (!row.technician_id) continue;
    const key = `${row.project_id}::${row.technician_id}`;
    activeMembershipSet.add(key);
    if (row.is_leader) membershipLeaderKeys.add(key);
  }

  // 2) Filter proyek aktif di hari 'date'
  const candidateProjectIds = new Set<string>();
  for (const r of pa ?? [])
    if (r.technician_id) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? []) candidateProjectIds.add(r.project_id);
  for (const r of attPrev ?? []) candidateProjectIds.add(r.project_id);

  if (candidateProjectIds.size === 0) return NextResponse.json({ data: [] });

  const { data: projects, error: projErr } = await supabaseServer
    .from("projects")
    .select(
      "id, project_status, pending_reason, tanggal_mulai, tanggal_deadline, closed_at, completed_at"
    )
    .in("id", Array.from(candidateProjectIds))
    .lte("tanggal_mulai", date);

  if (projErr)
    return NextResponse.json({ error: projErr.message }, { status: 500 });

  const activeProjectSet = new Set<string>();
  const completedTodayProjects = new Set<string>();
  for (const p of projects ?? []) {
    if (p.project_status === "pending" || p.pending_reason) continue;
    const completedWIB = toWIBDate(p.completed_at) ?? toWIBDate(p.closed_at);
    if (!completedWIB) {
      activeProjectSet.add(p.id);
      continue;
    }
    if (date <= completedWIB) {
      activeProjectSet.add(p.id);
      if (completedWIB === date) completedTodayProjects.add(p.id);
    }
  }
  if (activeProjectSet.size === 0) return NextResponse.json({ data: [] });

  // 3) Build selectedSet + leaderMap (H + carry dari D-1 saja)
  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>();

  // Flag leader untuk data H (hari ini)
  for (const k of selectedTodaySet) {
    leaderMap.set(k, leaderTodaySet.has(k));
  }

  // Jika proyek belum ada attendance H, copy dari D-1
  for (const pid of activeProjectSet) {
    const hasToday = (todayCountByProject.get(pid) ?? 0) > 0;
    if (!hasToday) {
      const prevRows = prevByProject.get(pid) ?? [];
      for (const r of prevRows) {
        const key = `${r.project_id}::${r.technician_id}`;
        if (!activeMembershipSet.has(key)) continue;
        selectedSet.add(key);
        leaderMap.set(key, membershipLeaderKeys.has(key) || !!r.project_leader);
      }
    }
  }

  // Jika proyek selesai tepat H, tampilkan semua membership (leader ikut)
  if (completedTodayProjects.size > 0) {
    for (const row of pa ?? []) {
      if (!row.technician_id) continue;
      if (completedTodayProjects.has(row.project_id)) {
        const key = `${row.project_id}::${row.technician_id}`;
        selectedSet.add(key);
        leaderMap.set(key, !!row.is_leader);
      }
    }
  }

  // displayKeys = selectedSet (tanpa “pemaksaan tampil” khusus)
  const displayKeys = selectedSet;

  if (displayKeys.size === 0) return NextResponse.json({ data: [] });

  // 4) Info teknisi
  type TechInfo = { id: string; inisial: string; name: string };
  const techInfoById = new Map<string, TechInfo>();
  for (const row of pa ?? []) {
    if (!row.technician_id) continue;
    const tRaw: any = row.technicians;
    const t = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw;
    const id: string = String(t?.id ?? row.technician_id);
    const inisial: string = String(t?.inisial ?? "?").toUpperCase();
    const name: string =
      (t?.nama_panggilan as string | null) ??
      (row.technician_name as string | null) ??
      (t?.nama_lengkap as string | null) ??
      id;
    techInfoById.set(row.technician_id, { id, inisial, name });
  }
  const missingTechIds = new Set<string>();
  for (const key of displayKeys) {
    const [, techId] = key.split("::");
    if (!techInfoById.has(techId)) missingTechIds.add(techId);
  }
  if (missingTechIds.size) {
    const { data: techRows } = await supabaseServer
      .from("technicians")
      .select("id, inisial, nama_lengkap")
      .in("id", Array.from(missingTechIds));
    for (const t of techRows ?? []) {
      const id: string = String(t.id);
      const inisial: string = String(t.inisial ?? "?").toUpperCase();
      techInfoById.set(t.id, { id, inisial, name: t.nama_lengkap ?? id });
    }
  }

  // 5) Payload ke UI (teknisi saja pada fallback)
  const shaped: ShapedAssignment[] = [];
  for (const key of displayKeys) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;
    const info: TechInfo = techInfoById.get(tid) ?? {
      id: tid,
      inisial: String(tid[0] ?? "?").toUpperCase(),
      name: tid,
    };
    shaped.push({
      projectId: pid,
      technicianId: info.id, // UUID
      technicianName: info.name,
      inisial: info.inisial,
      isProjectLeader: !!(leaderMap.get(key) ?? false),
      isSelected: true,
    });
  }

  return NextResponse.json({ data: shaped });
}

/* ====================================================================== */
/* ===============================  POST ================================ */
/* ====================================================================== */
/**
 * POST harian (non-historical)
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   projectIds: string[],    // opsional (kalau kosong diisi dari items)
 *   assignments: [{
 *      projectId: string,
 *      technicianId: string,       // UUID teknisi ATAU "car-01" (kendaraan)
 *      isSelected?: boolean,
 *      isProjectLeader?: boolean
 *   }]
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date: string | undefined = body?.date;
  const items: Array<{
    projectId: string;
    technicianId: string; // UUID teknisi ATAU "car-01"
    isSelected?: boolean;
    isProjectLeader?: boolean;
  }> = Array.isArray(body?.assignments) ? body.assignments : [];

  if (!date) {
    return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });
  }

  // Kelompokkan pilihan per project (teknisi & kendaraan)
  const byProject = new Map<
    string,
    {
      techSelected: Set<string>;
      techLeaders: Set<string>;
      vehSelected: Set<string>; // "car-01" dst
      vehLeaders: Set<string>;
    }
  >();

  for (const it of items) {
    const bucket = byProject.get(it.projectId) ?? {
      techSelected: new Set<string>(),
      techLeaders: new Set<string>(),
      vehSelected: new Set<string>(),
      vehLeaders: new Set<string>(),
    };

    const isVehicle =
      typeof it.technicianId === "string" && it.technicianId.startsWith("car-");

    if (it.isSelected !== false) {
      if (isVehicle) bucket.vehSelected.add(it.technicianId);
      else bucket.techSelected.add(it.technicianId);
    }
    if (it.isProjectLeader) {
      if (isVehicle) bucket.vehLeaders.add(it.technicianId);
      else bucket.techLeaders.add(it.technicianId);
    }

    byProject.set(it.projectId, bucket);
  }

  const projectsWithAssignments = Array.from(byProject.keys());

  // Scope proyek yang mau disentuh
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length) {
    return NextResponse.json({ data: { count: 0 } }, { status: 201 });
  }

  // Ambil status proyek → skip pending/completed/awaiting_bast
  const { data: projRows, error: projErr } = await supabaseServer
    .from("projects")
    .select("id, project_status, pending_reason, completed_at")
    .in("id", scopeProjectIds);

  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const bastSet = new Set(
    (projRows ?? [])
      .filter((p: any) => p?.project_status === "awaiting_bast")
      .map((p: any) => p.id)
  );
  const pendingSet = new Set(
    (projRows ?? [])
      .filter((p: any) => p?.project_status === "pending" || p?.pending_reason)
      .map((p: any) => p.id)
  );
  const completedSet = new Set(
    (projRows ?? []).filter((p: any) => !!p?.completed_at).map((p: any) => p.id)
  );

  const activeScopeProjectIds = scopeProjectIds.filter(
    (id) => !pendingSet.has(id) && !completedSet.has(id) && !bastSet.has(id)
  );

  /* ========= 1) Attendance HARI INI (untuk TEKNISI saja) ========= */

  // Hapus attendance hari ini untuk proyek aktif dalam scope
  if (activeScopeProjectIds.length) {
    const { error: delErr } = await supabaseServer
      .from("attendance")
      .delete()
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  }

  // Tulis ulang attendance hari ini dari pilihan teknisi
  const attRows: Array<{
    project_id: string;
    technician_id: string;
    work_date: string;
    project_leader?: boolean;
  }> = [];
  for (const pid of activeScopeProjectIds) {
    const bucket = byProject.get(pid);
    const selected = bucket?.techSelected ?? new Set<string>();
    const leaders = bucket?.techLeaders ?? new Set<string>();
    for (const tid of selected) {
      attRows.push({
        project_id: pid,
        technician_id: tid,
        work_date: date,
        project_leader: leaders.has(tid),
      });
    }
  }

  if (attRows.length) {
    const { error: insAttErr } = await supabaseServer
      .from("attendance")
      .insert(attRows);
    if (insAttErr) {
      return NextResponse.json({ error: insAttErr.message }, { status: 500 });
    }
  }

  // Update project_status dari attendance hari ini
  const projectsWithAnyAttendanceToday = new Set(
    attRows.map((r) => r.project_id)
  );
  for (const pid of activeScopeProjectIds) {
    const newStatus = projectsWithAnyAttendanceToday.has(pid)
      ? "ongoing"
      : "unassigned";
    const { error: upProjErr } = await supabaseServer
      .from("projects")
      .update({ project_status: newStatus })
      .eq("id", pid);
    if (upProjErr) {
      return NextResponse.json({ error: upProjErr.message }, { status: 500 });
    }
  }

  /* ========= 2) SYNC project_assignments (harian, TEKNISI & KENDARAAN) ========= */
  // Hapus semua baris untuk tanggal & scope project (sinkronisasi penuh)
  if (activeScopeProjectIds.length) {
    const { error: delPADayErr } = await supabaseAdmin
      .from("project_assignments")
      .delete()
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);
    if (delPADayErr) {
      return NextResponse.json({ error: delPADayErr.message }, { status: 500 });
    }
  }

  // Mapping vehicle_code -> vehicles.id
  const allVehicleCodes = Array.from(
    new Set(
      items
        .filter(
          (i) => i.isSelected !== false && i.technicianId?.startsWith?.("car-")
        )
        .map((i) => i.technicianId)
    )
  );

  const codeToVehId = new Map<string, string>();
  if (allVehicleCodes.length) {
    const { data: vehs, error: vErr } = await supabaseServer
      .from("vehicles")
      .select("id, vehicle_code")
      .in("vehicle_code", allVehicleCodes);
    if (vErr)
      return NextResponse.json({ error: vErr.message }, { status: 500 });
    for (const v of vehs ?? []) codeToVehId.set(v.vehicle_code, v.id);
  }

  // Build rows baru (gabungan)
  const paRows: Array<{
    work_date: string;
    project_id: string;
    technician_id?: string | null;
    vehicle_id?: string | null;
    is_leader: boolean;
    assigned_at: string;
  }> = [];

  for (const pid of activeScopeProjectIds) {
    const bucket = byProject.get(pid);
    // teknisi
    for (const tid of bucket?.techSelected ?? []) {
      paRows.push({
        work_date: date,
        project_id: pid,
        technician_id: tid,
        vehicle_id: null,
        is_leader: !!bucket?.techLeaders?.has(tid),
        assigned_at: nowWIBIso(),
      });
    }
    // kendaraan
    for (const code of bucket?.vehSelected ?? []) {
      const vid = codeToVehId.get(code);
      if (!vid) continue; // jika kode tak ditemukan, skip
      paRows.push({
        work_date: date,
        project_id: pid,
        technician_id: null,
        vehicle_id: vid,
        is_leader: !!bucket?.vehLeaders?.has(code),
        assigned_at: nowWIBIso(),
      });
    }
  }

  if (paRows.length) {
    const { error: insPaErr } = await supabaseAdmin
      .from("project_assignments")
      .insert(paRows);
    if (insPaErr) {
      return NextResponse.json({ error: insPaErr.message }, { status: 500 });
    }
  }

  return NextResponse.json(
    { data: { count: paRows.length, attendance: attRows.length } },
    { status: 201 }
  );
}
