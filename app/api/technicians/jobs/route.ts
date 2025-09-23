// app/api/technicians/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServers } from "@/lib/supabaseServers";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type UiJob = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null;
  assignedTechnicians: { name: string; isLeader: boolean }[];
  type?: "survey" | "instalasi";
  building_name?: string | null;
  supervisor_name?: string | null;
  sales_name?: string | null;
  vehicle_name?: string | null;
  vehicle_names?: string[];
  progressDone?: number | null;
  progressTotal?: number | null;
};

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

function todayWIB() {
  const ms = Date.now() + 7 * 60 * 60 * 1000; // UTC -> WIB
  return new Date(ms).toISOString().slice(0, 10);
}

// "Model/Name/Code (PLATE)" — jika plate ada
function vehicleLabel(v?: {
  model?: string | null;
  name?: string | null;
  vehicle_code?: string | null;
  plate?: string | null;
}) {
  if (!v) return null;
  const base = (v.model || v.name || v.vehicle_code || "").trim();
  const plate = (v.plate || "").trim();
  if (!base && !plate) return null;
  return plate ? `${base} (${plate})` : base;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await supabaseServers();
    const url = new URL(req.url);

    // ===== Autentikasi
    const { data: u } = await supabase.auth.getUser();
    const user = u?.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ===== Profil (role & mapping teknisi)
    const { data: profile, error: pErr } = await supabase
      .from("profiles")
      .select("role, technician_id, email")
      .eq("id", user.id)
      .maybeSingle();
    if (pErr) throw pErr;

    const role = profile?.role ?? "user";
    const myTechId = profile?.technician_id ?? null;

    // ===== Cari supervisor (by email; jika nanti ada profiles.supervisor_id bisa tambahkan)
    const email = (profile?.email || user.email || "").toLowerCase();
    let mySupervisor: {
      id: string;
      role: string;
      nickname: string | null;
      full_name: string | null;
    } | null = null;

    if (email) {
      const { data: sup, error: sErr } = await supabase
        .from("supervisors")
        .select("id, role, nickname, full_name, email")
        .eq("email", email)
        .maybeSingle();
      if (sErr) throw sErr;
      if (sup) {
        mySupervisor = {
          id: String(sup.id),
          role: String(sup.role),
          nickname: (sup as any).nickname ?? null,
          full_name: (sup as any).full_name ?? null,
        };
      }
    }

    // ===== Hak akses
    const isAdminEmail = (user.email ?? "").toLowerCase().includes("admin");
    const isAdmin = role === "admin" || isAdminEmail;

    const supRole = (mySupervisor?.role || "").toLowerCase().trim();
    const isManagerTier =
      supRole === "gm" ||
      supRole === "general manager" ||
      supRole === "manager";

    // Admin-like: admin || GM || Manager
    const isAdminLike = isAdmin || isManagerTier;

    // ===== Query params
    const workDate = url.searchParams.get("date") || todayWIB();
    const technicianParam = url.searchParams.get("technician");
    const debugAll = url.searchParams.get("debug") === "1"; // efektif hanya untuk admin-like

    // ===== Tentukan target filter
    let filterByTechnicianId: string | null = null;
    let filterBySupervisorId: string | null = null;
    let filterBySupervisorName: string | null = null;

    if (isAdminLike) {
      // Admin-like boleh override via ?technician= (uuid/inisial/email teknisi)
      if (technicianParam) {
        if (isUuid(technicianParam)) {
          filterByTechnicianId = technicianParam;
        } else {
          const { data: t, error: tErr } = await supabase
            .from("technicians")
            .select("id, inisial, email")
            .or(
              `inisial.eq.${String(
                technicianParam
              ).toUpperCase()},email.eq.${technicianParam}`
            )
            .maybeSingle();
          if (tErr) throw tErr;
          if (t?.id) filterByTechnicianId = String(t.id);
        }
      }
      // tanpa ?technician= dan tanpa debugAll → lihat semua assignment hari itu
    } else {
      // Bukan admin-like:
      //   - Jika akun mapped ke teknisi → filter teknisi
      //   - Else jika akun mapped ke supervisor → filter supervisor leader
      if (myTechId) {
        filterByTechnicianId = myTechId;
      } else if (mySupervisor) {
        filterBySupervisorId = mySupervisor.id;
        // fallback nama (nickname > full_name > display name)
        const nick =
          mySupervisor.nickname ||
          mySupervisor.full_name ||
          (user.user_metadata as any)?.name ||
          (user.email || "").split("@")[0];
        filterBySupervisorName = nick ? String(nick).trim() : null;
      } else {
        return NextResponse.json(
          { error: "Akun belum terhubung ke teknisi/supervisor." },
          { status: 403 }
        );
      }
    }

    // ===== Query projects + assignments (harian)
    let q = supabase
      .from("projects")
      .select(
        `
        id,
        job_id,
        name,
        lokasi,
        project_status,
        closed_at,
        sales_name,
        sigma_teknisi,
        project_assignments!inner(
          project_id,
          technician_id,
          technician_name,
          is_leader,
          supervisor_id,
          supervisor_name,
          removed_at,
          work_date
        )
      `
      )
      .eq("project_assignments.work_date", workDate)
      .is("project_assignments.removed_at", null)
      .order("created_at", { ascending: false });

    // Terapkan filter
    if (
      !isAdminLike ||
      filterByTechnicianId ||
      filterBySupervisorId ||
      filterBySupervisorName
    ) {
      if (filterByTechnicianId) {
        q = q.eq("project_assignments.technician_id", filterByTechnicianId);
      } else if (filterBySupervisorId) {
        q = q
          .eq("project_assignments.is_leader", true)
          .eq("project_assignments.supervisor_id", filterBySupervisorId);
      } else if (filterBySupervisorName) {
        q = q
          .eq("project_assignments.is_leader", true)
          .ilike("project_assignments.supervisor_name", filterBySupervisorName);
      } else {
        // non-admin-like tanpa mapping? sudah di-block di atas
      }
    } else {
      // isAdminLike & tidak ada filter teknisi & tidak debugAll ⇒ tetap semua assignment tanggal tsb
      // (sudah difilter work_date & removed_at)
      if (!debugAll) {
        // no-op
      }
    }

    const { data, error } = await q;
    if (error) throw error;

    const projects = (data ?? []) as any[];
    const projectIds = projects.map((p) => String(p.id));

    // ===== Crew teknisi aktif (badge)
    const crewByProject = new Map<
      string,
      Array<{ name: string; isLeader: boolean }>
    >();
    if (projectIds.length) {
      const { data: crewRows, error: crewErr } = await supabase
        .from("project_assignments")
        .select("project_id, technician_name, is_leader")
        .eq("work_date", workDate)
        .is("removed_at", null)
        .not("technician_id", "is", null)
        .in("project_id", projectIds);
      if (crewErr) throw crewErr;
      for (const r of crewRows ?? []) {
        const pid = String(r.project_id);
        const arr = crewByProject.get(pid) ?? [];
        arr.push({
          name: r.technician_name ?? "Teknisi",
          isLeader: !!r.is_leader,
        });
        crewByProject.set(pid, arr);
      }
    }

    // ===== Kendaraan aktif per project
    const vehicleNamesByProject = new Map<string, string[]>();
    if (projectIds.length) {
      const { data: vehRows, error: vehErr } = await supabase
        .from("project_assignments")
        .select(
          `
          project_id,
          vehicles:vehicle_id (model, name, plate, vehicle_code)
        `
        )
        .eq("work_date", workDate)
        .is("removed_at", null)
        .not("vehicle_id", "is", null)
        .in("project_id", projectIds);
      if (vehErr) throw vehErr;

      for (const r of vehRows ?? []) {
        const pid = String(r.project_id);
        const v = Array.isArray((r as any).vehicles)
          ? (r as any).vehicles[0]
          : (r as any).vehicles;
        const label = vehicleLabel(v);
        if (!label) continue;
        const arr = vehicleNamesByProject.get(pid) ?? [];
        if (!arr.includes(label)) arr.push(label);
        vehicleNamesByProject.set(pid, arr);
      }
    }

    // ===== Ambil supervisor_name dari baris LEADER pada tanggal ini
    const supervisorNameByProject = new Map<string, string>();
    if (projectIds.length) {
      const { data: spvRows, error: spvErr } = await supabase
        .from("project_assignments")
        .select(
          `
          project_id,
          supervisor_name,
          supervisors:supervisor_id ( nickname, full_name )
        `
        )
        .eq("work_date", workDate)
        .is("removed_at", null)
        .eq("is_leader", true)
        .in("project_id", projectIds);
      if (spvErr) throw spvErr;

      for (const r of spvRows ?? []) {
        const sRaw: any = (r as any).supervisors;
        const s = Array.isArray(sRaw) ? sRaw[0] : sRaw;
        const nameFromJoin: string | null =
          (s?.nickname as string) ?? (s?.full_name as string) ?? null;

        const finalName = (r as any).supervisor_name ?? nameFromJoin ?? null;
        if (finalName) {
          supervisorNameByProject.set(String((r as any).project_id), finalName);
        }
      }
    }

    // ===== Deteksi "survey" via keberadaan ruangan survey
    const surveySet = new Set<string>();
    if (projectIds.length) {
      const rs = await supabase
        .from("project_survey_rooms")
        .select("project_id")
        .in("project_id", projectIds);
      if (rs.error && !/does not exist/i.test(rs.error.message)) throw rs.error;
      for (const r of rs.data ?? []) surveySet.add(String(r.project_id));
    }

    // ===== Bentuk respon UI
    const items: UiJob[] = projects.map((p) => {
      const uiStatus: UiJob["status"] = p.closed_at
        ? "completed"
        : p.project_status === "unassigned"
        ? "not-started"
        : "in-progress";

      const crew = crewByProject.get(String(p.id)) ?? [];
      const sigmaTek = Number(p.sigma_teknisi ?? 0);
      const progress =
        sigmaTek > 0
          ? Math.min(100, Math.round((crew.length / sigmaTek) * 100))
          : null;

      const isSurvey = surveySet.has(String(p.id));
      const spvFromPA = supervisorNameByProject.get(String(p.id)) ?? null;

      const supervisor_name: string | null =
        spvFromPA ??
        (p.supervisor_name as string | null) ??
        (p.spv_name as string | null) ??
        null;

      const sales_name: string | null =
        (p.sales_name as string | null) ??
        (p.sales as string | null) ??
        (p.nama_sales as string | null) ??
        null;

      const vehArr = vehicleNamesByProject.get(String(p.id)) ?? [];
      const vehicle_name = vehArr.length ? vehArr.join(", ") : null;

      return {
        id: String(p.id),
        job_id: String(p.job_id || p.id),
        name: String(p.name ?? "Project"),
        lokasi: (p.lokasi as string | null) ?? null,
        status: uiStatus,
        progress,
        assignedTechnicians: crew,
        type: isSurvey ? "survey" : "instalasi",
        building_name: isSurvey ? String(p.name ?? "Gedung") : null,
        supervisor_name,
        sales_name,
        vehicle_name,
        vehicle_names: vehArr,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    console.error(e);
    return NextResponse.json(
      { error: e?.message || "Failed" },
      { status: 500 }
    );
  }
}
