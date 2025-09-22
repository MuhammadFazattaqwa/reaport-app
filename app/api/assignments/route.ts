// /app/api/assignments/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers"; // server-side client (RLS ON)
import { supabaseAdmin } from "@/lib/supabaseAdmin"; // admin client (service-role, BYPASS RLS)
/* ==== PUSH NOTIF ==== */
import { sendPushToUser } from "@/lib/pushServer";

type ShapedAssignment = {
  projectId: string;
  technicianId: string; // UUID teknisi atau vehicle-code "car-01"
  technicianName: string;
  inisial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
  supervisor?: { id: string; name: string; nickname: string } | null;
};

/* ===================== Helpers ===================== */
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

/* Tampilan nama/inisial konsisten */
const displayTechName = (
  t?: { nama_panggilan?: string | null; nama_lengkap?: string | null } | null
) =>
  (t?.nama_panggilan && String(t.nama_panggilan).trim()) ||
  (t?.nama_lengkap && String(t.nama_lengkap).trim()) ||
  "";

const displayInitial = (
  t?: { inisial?: string | null; nama_lengkap?: string | null } | null
) => String(t?.inisial || initialFrom(t?.nama_lengkap || "T")).toUpperCase();

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

  const sb = supabaseServer(); // RLS ON, untuk data user-scoped
 const sa = supabaseAdmin;    // RLS BYPASS // RLS BYPASS, untuk lookup meta yang aman

  // A) Ambil penugasan harian (gabungan)
  const { data: paDaily, error: paDailyErr } = await sb
    .from("project_assignments")
    .select(
      "project_id, technician_id, vehicle_id, is_leader, removed_at, supervisor_id, supervisor_name"
    )
    .eq("work_date", date)
    .is("removed_at", null);

  if (paDailyErr) {
    return NextResponse.json({ error: paDailyErr.message }, { status: 500 });
  }

  if ((paDaily?.length ?? 0) > 0) {
    // kumpulkan id teknisi & kendaraan
    const techIds = Array.from(
      new Set(
        (paDaily ?? [])
          .filter((r) => r.technician_id)
          .map((r) => r.technician_id as string)
      )
    );
    const vehIds = Array.from(
      new Set(
        (paDaily ?? [])
          .filter((r) => r.vehicle_id)
          .map((r) => r.vehicle_id as string)
      )
    );

    // meta teknisi (pakai admin client supaya tidak ke blok RLS)
    let techMap = new Map<string, { inisial: string; name: string }>();
    if (techIds.length) {
      const { data: techs, error: tErr } = await sa
        .from("technicians")
        .select("id, inisial, nama_panggilan, nama_lengkap")
        .in("id", techIds);
      if (tErr)
        return NextResponse.json({ error: tErr.message }, { status: 500 });
      for (const t of (techs ?? []) as any[]) {
        const name = displayTechName(t) || t.id;
        techMap.set(t.id as string, {
          inisial: displayInitial(t),
          name,
        });
      }
    }

    // meta kendaraan (pakai admin client)
    let vehMap = new Map<string, { code: string; model: string }>();
    if (vehIds.length) {
      const { data: vehs, error: vErr } = await sa
        .from("vehicles")
        .select("id, vehicle_code, model, name")
        .in("id", vehIds);
      if (vErr)
        return NextResponse.json({ error: vErr.message }, { status: 500 });
      for (const v of (vehs ?? []) as any[]) {
        vehMap.set(v.id as string, {
          code: v.vehicle_code as string,
          model: (v.model as string) ?? (v.name as string) ?? "",
        });
      }
    }

    const shaped: ShapedAssignment[] = [];
    for (const r of paDaily ?? []) {
      if (r.technician_id) {
        const meta = techMap.get(r.technician_id as string);
        shaped.push({
          projectId: r.project_id as string,
          technicianId: r.technician_id as string,
          technicianName: meta?.name ?? (r.technician_id as string),
          inisial: meta?.inisial ?? "?",
          isProjectLeader: !!r.is_leader,
          isSelected: true,
          supervisor: r.is_leader
            ? r.supervisor_id
              ? {
                  id: r.supervisor_id as string,
                  name: (r.supervisor_name as string) ?? "",
                  nickname: (r.supervisor_name as string) ?? "",
                }
              : null
            : undefined,
        });
      } else if (r.vehicle_id) {
        const meta = vehMap.get(r.vehicle_id as string);
        const model = meta?.model ?? "";
        shaped.push({
          projectId: r.project_id as string,
          technicianId: meta?.code || "car-??",
          technicianName: model || (meta?.code ?? "Kendaraan"),
          inisial: initialFrom(model || (meta?.code ?? "C")),
          isProjectLeader: !!r.is_leader,
          isSelected: true,
        });
      }
    }

    return NextResponse.json({ data: shaped });
  }

  /* ----------------- Fallback lama (attendance + carry D-1) ----------------- */
  const dMinus1 = prevDate(date);
  const [
    { data: attToday, error: attErr },
    { data: attPrev, error: attPrevErr },
  ] = await Promise.all([
    sb
      .from("attendance")
      .select("project_id, technician_id, project_leader")
      .eq("work_date", date),
    sb
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
      r.project_id as string,
      (todayCountByProject.get(r.project_id as string) ?? 0) + 1
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
    const arr = prevByProject.get(r.project_id as string) ?? [];
    arr.push(r as any);
    prevByProject.set(r.project_id as string, arr);
  }

  // ⚠️ gunakan admin client agar join ke technicians tidak diblok RLS
  const { data: pa, error: paErr } = await sa
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

  const candidateProjectIds = new Set<string>();
  for (const r of (pa ?? []) as any[])
    if (r.technician_id) candidateProjectIds.add(r.project_id);
  for (const r of attToday ?? [])
    candidateProjectIds.add(r.project_id as string);
  for (const r of attPrev ?? [])
    candidateProjectIds.add(r.project_id as string);
  if (candidateProjectIds.size === 0) return NextResponse.json({ data: [] });

  const { data: projects, error: projErr } = await sb
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
    if ((p as any).project_status === "pending" || (p as any).pending_reason)
      continue;
    const completedWIB =
      toWIBDate((p as any).completed_at) ?? toWIBDate((p as any).closed_at);
    if (!completedWIB) {
      activeProjectSet.add((p as any).id);
      continue;
    }
    if (date <= completedWIB) {
      activeProjectSet.add((p as any).id);
      if (completedWIB === date) completedTodayProjects.add((p as any).id);
    }
  }
  if (activeProjectSet.size === 0) return NextResponse.json({ data: [] });

  const selectedSet = new Set<string>(selectedTodaySet);
  const leaderMap = new Map<string, boolean>();
  for (const k of selectedTodaySet) leaderMap.set(k, leaderTodaySet.has(k));
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
  if (completedTodayProjects.size > 0) {
    for (const row of (pa ?? []) as any[]) {
      if (!row.technician_id) continue;
      if (completedTodayProjects.has(row.project_id)) {
        const key = `${row.project_id}::${row.technician_id}`;
        selectedSet.add(key);
        leaderMap.set(key, !!row.is_leader);
      }
    }
  }

  type TechInfo = { id: string; inisial: string; name: string };
  const techInfoById = new Map<string, TechInfo>();
  for (const row of (pa ?? []) as any[]) {
    if (!row.technician_id) continue;
    const tRaw: any = row.technicians;
    const t = Array.isArray(tRaw) ? tRaw[0] ?? null : tRaw;

    const id: string = String(t?.id ?? row.technician_id);
    const name: string =
      displayTechName(t) ||
      (row.technician_name as string | null) ||
      (t?.nama_lengkap as string | null) ||
      id;

    const inisial: string = displayInitial(t);
    techInfoById.set(row.technician_id as string, { id, inisial, name });
  }

  const shaped: ShapedAssignment[] = [];
  for (const key of selectedSet) {
    const [pid, tid] = key.split("::");
    if (!activeProjectSet.has(pid)) continue;
    const info: TechInfo = techInfoById.get(tid) ?? {
      id: tid,
      inisial: String(tid[0] ?? "?").toUpperCase(),
      name: tid,
    };
    shaped.push({
      projectId: pid,
      technicianId: info.id,
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
 * Body:
 * {
 *   date: "YYYY-MM-DD",
 *   projectIds?: string[],
 *   assignments: [{
 *     projectId: string,
 *     technicianId: string,   // UUID teknisi ATAU "car-01"
 *     isSelected?: boolean,
 *     isProjectLeader?: boolean
 *   }],
 *   supervisors?: [{ projectId: string, supervisorId: string }]  // override manual
 * }
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const date: string | undefined = body?.date;
  const items: Array<{
    projectId: string;
    technicianId: string;
    isSelected?: boolean;
    isProjectLeader?: boolean;
  }> = Array.isArray(body?.assignments) ? body.assignments : [];
  const supItems: Array<{ projectId: string; supervisorId: string }> =
    Array.isArray(body?.supervisors) ? body.supervisors : [];

  if (!date) {
    return NextResponse.json({ error: "date wajib diisi" }, { status: 400 });
  }

  // Kelompokkan per project
  const byProject = new Map<
    string,
    {
      techSelected: Set<string>;
      techLeaders: Set<string>;
      vehSelected: Set<string>;
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
    const isVehicle = it.technicianId?.startsWith?.("car-");

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
  const scopeProjectIds: string[] =
    Array.isArray(body?.projectIds) && body.projectIds.length
      ? body.projectIds
      : projectsWithAssignments;

  if (!scopeProjectIds.length && !supItems.length) {
    return NextResponse.json(
      { data: { count: 0, attendance: 0 } },
      { status: 201 }
    );
  }

  // Ambil status proyek
  const sb = supabaseServer();
  const sa = supabaseAdmin;    // RLS BYPASS

  // ==== Ambil data proyek + NAME/JOB_ID untuk notifikasi ====
  const { data: projRows, error: projErr } = await sb
    .from("projects")
    .select("id, name, job_id, project_status, pending_reason, completed_at")
    .in(
      "id",
      scopeProjectIds.length
        ? scopeProjectIds
        : supItems.map((s: any) => s.projectId)
    );
  if (projErr)
    return NextResponse.json({ error: projErr.message }, { status: 500 });

  const nameByProject = new Map<string, { name?: string | null; job_id?: string | null }>();
  for (const p of projRows ?? []) {
    nameByProject.set((p as any).id, { name: (p as any).name, job_id: (p as any).job_id });
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

  const activeScopeProjectIds = (
    scopeProjectIds.length
      ? scopeProjectIds
      : supItems.map((s: any) => s.projectId)
  ).filter(
    (id: string) =>
      !pendingSet.has(id) && !completedSet.has(id) && !bastSet.has(id)
  );

  // Enforce tepat 1 leader per project (hanya untuk proyek yang disinkron assignment-nya)
  for (const pid of activeScopeProjectIds) {
    const leadersCount = byProject.get(pid)?.techLeaders?.size ?? 0;
    if (leadersCount !== 1 && projectsWithAssignments.includes(pid)) {
      return NextResponse.json(
        {
          error: `Project ${pid} wajib tepat 1 project leader (ada: ${leadersCount}).`,
        },
        { status: 400 }
      );
    }
  }

  /* ========= (BARU) Siapkan default supervisor untuk setiap LEADER ========= */
  const leaderTechIds = Array.from(
    new Set(
      Array.from(byProject.values()).flatMap((b) => Array.from(b.techLeaders))
    )
  );

  type SupInfo = { id: string; name: string };
  const defaultSupByTech = new Map<string, SupInfo>();

  if (leaderTechIds.length) {
    const { data: stRows, error: stErr } = await sb
      .from("supervisor_technicians")
      .select(
        `
        supervisor_id,
        technician_id,
        supervisors:supervisor_id ( id, nickname, full_name )
      `
      )
      .in("technician_id", leaderTechIds)
      .is("removed_at", null);

    if (stErr)
      return NextResponse.json({ error: stErr.message }, { status: 500 });

    for (const r of (stRows ?? []) as any[]) {
      const sRaw: any = r.supervisors;
      const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
      const name = (s?.nickname ?? s?.full_name ?? "") as string;
      defaultSupByTech.set(r.technician_id as string, {
        id: (s?.id ?? r.supervisor_id) as string,
        name,
      });
    }
  }

  /* ========= 1) Attendance HARI INI (teknisi) ========= */
  if (projectsWithAssignments.length) {
    if (activeScopeProjectIds.length) {
      const { error: delErr } = await sb
        .from("attendance")
        .delete()
        .eq("work_date", date)
        .in("project_id", activeScopeProjectIds);
      if (delErr)
        return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

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
      const { error: insAttErr } = await sb.from("attendance").insert(attRows);
      if (insAttErr)
        return NextResponse.json({ error: insAttErr.message }, { status: 500 });
    }

    const projectsWithAnyAttendanceToday = new Set(
      attRows.map((r) => r.project_id)
    );
    for (const pid of activeScopeProjectIds) {
      const newStatus = projectsWithAnyAttendanceToday.has(pid)
        ? "ongoing"
        : "unassigned";
      const { error: upProjErr } = await sb
        .from("projects")
        .update({ project_status: newStatus })
        .eq("id", pid);
      if (upProjErr)
        return NextResponse.json({ error: upProjErr.message }, { status: 500 });
    }
  }

  /* ========= 2) Sinkron project_assignments (harian; teknisi & kendaraan) ========= */
  if (projectsWithAssignments.length && activeScopeProjectIds.length) {
    // 2.a Ambil LEADER & ASSIGNMENT EXISTING utk tanggal ini (untuk hindari notifikasi ganda)
    const existingLeaderInfoByProject = new Map<
      string,
      { leaderTid: string | null; supervisorId: string | null }
    >();
    const prevPairsSet = new Set<string>(); // project_id::technician_id (teknisi saja)

    {
      const { data: existingRows, error: exErr } = await sa
        .from("project_assignments")
        .select("project_id, technician_id, supervisor_id, is_leader")
        .eq("work_date", date)
        .in("project_id", activeScopeProjectIds)
        .is("removed_at", null);

      if (exErr)
        return NextResponse.json({ error: exErr.message }, { status: 500 });

      for (const row of (existingRows ?? []) as any[]) {
        if (row.is_leader)
          existingLeaderInfoByProject.set(row.project_id as string, {
            leaderTid: (row.technician_id as string) ?? null,
            supervisorId: (row.supervisor_id as string) ?? null,
          });
        if (row.technician_id) {
          prevPairsSet.add(`${row.project_id}::${row.technician_id}`);
        }
      }
    }

    // 2.b full replace untuk tanggal tsb & scope project
    const { error: delPADayErr } = await sa
      .from("project_assignments")
      .delete()
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds);
    if (delPADayErr)
      return NextResponse.json({ error: delPADayErr.message }, { status: 500 });

    // 2.c Vehicle code -> id
    const allVehicleCodes = Array.from(
      new Set(
        (items as any[])
          .filter(
            (i) =>
              i.isSelected !== false && i.technicianId?.startsWith?.("car-")
          )
          .map((i) => i.technicianId as string)
      )
    );
    const codeToVehId = new Map<string, string>();
    if (allVehicleCodes.length) {
      const { data: vehs, error: vErr } = await sb
        .from("vehicles")
        .select("id, vehicle_code")
        .in("vehicle_code", allVehicleCodes);
      if (vErr)
        return NextResponse.json({ error: vErr.message }, { status: 500 });
      for (const v of (vehs ?? []) as any[])
        codeToVehId.set(v.vehicle_code as string, v.id as string);
    }

    type PARow = {
      work_date: string;
      project_id: string;
      technician_id?: string | null;
      vehicle_id?: string | null;
      is_leader: boolean;
      assigned_at: string;
      supervisor_id?: string | null;
    };

    const paRows: PARow[] = [];

    for (const pid of activeScopeProjectIds) {
      const bucket = byProject.get(pid);

      // teknisi
      for (const tid of bucket?.techSelected ?? []) {
        const isLeader = !!bucket?.techLeaders?.has(tid);

        let supId: string | null = null;
        if (isLeader) {
          const existing = existingLeaderInfoByProject.get(pid);
          // Leader TIDAK berubah -> pertahankan supervisor existing bila ada
          if (existing && existing.leaderTid === tid && existing.supervisorId) {
            supId = existing.supervisorId;
          } else {
            // Leader BERUBAH atau belum ada -> pakai default supervisor milik leader baru
            supId = defaultSupByTech.get(tid)?.id ?? null;
          }
        }

        paRows.push({
          work_date: date,
          project_id: pid,
          technician_id: tid,
          vehicle_id: null,
          is_leader: isLeader,
          assigned_at: nowWIBIso(),
          supervisor_id: supId,
        });
      }

      // kendaraan
      for (const code of bucket?.vehSelected ?? []) {
        const vid = codeToVehId.get(code);
        if (!vid) continue;
        paRows.push({
          work_date: date,
          project_id: pid,
          technician_id: null,
          vehicle_id: vid,
          is_leader: !!bucket?.vehLeaders?.has(code),
          assigned_at: nowWIBIso(),
          supervisor_id: null,
        });
      }
    }

    if (paRows.length) {
      const { error: insPaErr } = await sa
        .from("project_assignments")
        .insert(paRows);
      if (insPaErr)
        return NextResponse.json({ error: insPaErr.message }, { status: 500 });
    }

    /* ==== PUSH NOTIF START ==========================================
       Kirim notifikasi hanya untuk teknisi yang BARU ditambahkan
       (pair project_id::technician_id yang sebelumnya belum ada)
    ================================================================== */

    // Helper: cari auth.user_id untuk teknisi
    async function resolveAuthUserIdForTechnician(technicianId: string): Promise<string | null> {
      // 1) technicians.auth_user_id (direkomendasikan)
      const { data: t1, error: t1Err } = await sa
        .from("technicians")
        .select("auth_user_id")
        .eq("id", technicianId)
        .maybeSingle();
      if (!t1Err && t1?.auth_user_id) return t1.auth_user_id as string;

      // 2) profiles.technician_id -> profiles.user_id (opsional)
      const { data: p1, error: p1Err } = await sa
        .from("profiles")
        .select("user_id")
        .eq("technician_id", technicianId)
        .maybeSingle();
      if (!p1Err && p1?.user_id) return p1.user_id as string;

      console.warn("[push] Cannot resolve auth user for technician:", technicianId);
      return null;
    }

    // Kumpulkan pair baru & info leader
    type NewAssign = { project_id: string; technician_id: string; is_leader: boolean };
    const newlyAdded: NewAssign[] = [];
    for (const r of paRows) {
      if (!r.technician_id) continue; // skip kendaraan
      const key = `${r.project_id}::${r.technician_id}`;
      if (!prevPairsSet.has(key)) {
        newlyAdded.push({
          project_id: r.project_id,
          technician_id: r.technician_id,
          is_leader: !!r.is_leader,
        });
      }
    }

    if (newlyAdded.length) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || "";

      // Ambil job_id & name untuk semua project yang relevan
      const relatedProjectIds = Array.from(new Set(newlyAdded.map((x) => x.project_id)));
      // (kita sudah punya nameByProject dari atas; gunakan itu)

      // Kirim paralel (tapi aman)
      await Promise.all(
        newlyAdded.map(async (x) => {
          const authUserId = await resolveAuthUserIdForTechnician(x.technician_id);
          if (!authUserId) return;

          const meta = nameByProject.get(x.project_id) || {};
          const projName = (meta.name && String(meta.name).trim()) || x.project_id;
          const jobId = meta.job_id && String(meta.job_id).trim();

          const url = jobId
            ? `${base}/user/upload_foto?job=${encodeURIComponent(jobId)}`
            : `${base}/user/dashboard`;

          const title = "Penugasan Baru";
          const body =
            (x.is_leader
              ? `Anda ditugaskan sebagai Leader pada proyek: ${projName}`
              : `Anda ditugaskan pada proyek: ${projName}`) + ` (${date})`;

          try {
            await sendPushToUser(authUserId, {
              title,
              body,
              url,
              tag: `assign-${x.project_id}-${x.technician_id}-${date}`,
            });
          } catch (e) {
            console.warn("[push] sendPushToUser failed:", e);
          }
        })
      );
    }
    /* ==== PUSH NOTIF END ============================================ */
  }

  /* ========= 3A) AUTO-ASSIGN supervisor utk LEADER yg masih NULL ========= */
  if (projectsWithAssignments.length && activeScopeProjectIds.length) {
    const { data: leaderRows2, error: leadersFetchErr } = await sa
      .from("project_assignments")
      .select("id, project_id, technician_id")
      .eq("work_date", date)
      .in("project_id", activeScopeProjectIds)
      .is("removed_at", null)
      .eq("is_leader", true)
      .is("supervisor_id", null);

    if (leadersFetchErr)
      return NextResponse.json(
        { error: leadersFetchErr.message },
        { status: 500 }
      );

    if ((leaderRows2?.length ?? 0) > 0) {
      const missingTechIds = Array.from(
        new Set((leaderRows2 ?? []).map((r: any) => r.technician_id as string))
      );

      const mapByTech = new Map<string, { id: string; name: string }>();
      if (missingTechIds.length) {
        const { data: stRows, error: stErr } = await sb
          .from("supervisor_technicians")
          .select(
            `
            supervisor_id,
            technician_id,
            supervisors:supervisor_id ( id, nickname, full_name )
          `
          )
          .in("technician_id", missingTechIds)
          .is("removed_at", null);

        if (stErr)
          return NextResponse.json({ error: stErr.message }, { status: 500 });

        for (const r of (stRows ?? []) as any[]) {
          const sRaw: any = r.supervisors;
          const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
          mapByTech.set(
            r.technician_id as string,
            s
              ? {
                  id: s.id as string,
                  name: (s.nickname ?? s.full_name) as string,
                }
              : { id: r.supervisor_id as string, name: "" }
          );
        }
      }

      for (const row of (leaderRows2 ?? []) as any[]) {
        const sup = mapByTech.get(row.technician_id as string);
        if (!sup) continue;
        const { error: upErr } = await sa
          .from("project_assignments")
          .update({ supervisor_id: sup.id }) // trigger akan isi supervisor_name
          .eq("id", row.id as string);
        if (upErr)
          return NextResponse.json({ error: upErr.message }, { status: 500 });
      }
    }
  }

  /* ========= 3B) MANUAL override supervisor (dari UI) ========= */
  for (const { projectId: pid, supervisorId: sid } of supItems) {
    if (!activeScopeProjectIds.includes(pid)) continue;

    const { data: leaderRow, error: leaderErr } = await sa
      .from("project_assignments")
      .select("id")
      .eq("work_date", date)
      .eq("project_id", pid)
      .is("removed_at", null)
      .eq("is_leader", true)
      .maybeSingle();

    if (leaderErr)
      return NextResponse.json({ error: leaderErr.message }, { status: 500 });
    if (!leaderRow) {
      return NextResponse.json(
        {
          error: `Leader untuk project ${pid} belum ada, tidak bisa set supervisor.`,
        },
        { status: 400 }
      );
    }

    const { error: upSupErr } = await sa
      .from("project_assignments")
      .update({ supervisor_id: sid }) // trigger isi supervisor_name
      .eq("id", (leaderRow as any).id);

    if (upSupErr)
      return NextResponse.json({ error: upSupErr.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      data: {
        count: projectsWithAssignments.length,
        attendance: (items || []).length,
      },
    },
    { status: 201 }
  );
}
