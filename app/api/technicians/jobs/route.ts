// app/api/technicians/jobs/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers";

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

  // tambahan UI
  supervisor_name?: string | null;
  sales_name?: string | null;

  // kendaraan (kompatibel + lengkap, sudah termasuk plate)
  vehicle_name?: string | null; // contoh: "Panther (L 1880 ZB), Grandmax (L 9636 BF)"
  vehicle_names?: string[]; // ["Panther (L 1880 ZB)","Grandmax (L 9636 BF)"]
};

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

// WIB "YYYY-MM-DD"
function todayWIB() {
  const ms = Date.now() + 7 * 60 * 60 * 1000;
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
    const supabase = supabaseServer();
    const url = new URL(req.url);

    const technicianParam = url.searchParams.get("technician");
    const debugAll = url.searchParams.get("debug") === "1";
    const workDate = url.searchParams.get("date") || todayWIB();

    let technicianId: string | null = null;
    if (technicianParam) {
      if (isUuid(technicianParam)) {
        technicianId = technicianParam;
      } else {
        const inisial = String(technicianParam).toUpperCase();
        const { data: t, error: tErr } = await supabase
          .from("technicians")
          .select("id")
          .eq("inisial", inisial)
          .maybeSingle();
        if (tErr) throw tErr;
        technicianId = t?.id ?? null;
      }
    }

    // proyek untuk teknisi (harian, dari PA teknisi)
    let q = supabase
      .from("projects")
      .select(
        `
        *,
        project_assignments!inner(
          technician_id,
          technician_name,
          is_leader,
          removed_at,
          work_date
        )
      `
      )
      .eq("project_assignments.work_date", workDate)
      .is("project_assignments.removed_at", null)
      .order("created_at", { ascending: false });

if (!debugAll) {
  if (!technicianId) {
    // coba map dari user yang login (email -> technicians.id)
    const { data: auth } = await supabase.auth.getUser();
    const email = auth?.user?.email || null;
    if (email) {
      const { data: tMap, error: tMapErr } = await supabase
        .from("technicians")
        .select("id")
        .eq("email", email)
        .maybeSingle();
      if (tMapErr) throw tMapErr;
      technicianId = tMap?.id ?? null;
    }
  }
  if (!technicianId) return NextResponse.json({ items: [] });
  q = q.eq("project_assignments.technician_id", technicianId);
}

    const { data, error } = await q;
    if (error) throw error;

    const projects = (data ?? []) as any[];
    const projectIds = projects.map((p) => String(p.id));

    // crew teknisi aktif (untuk progress & list)
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

    // semua kendaraan aktif per project (pakai label "Model (PLATE)")
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
        const v = Array.isArray(r.vehicles) ? r.vehicles[0] : r.vehicles;
        const label = vehicleLabel(v);
        if (!label) continue;
        const arr = vehicleNamesByProject.get(pid) ?? [];
        if (!arr.includes(label)) arr.push(label); // hindari duplikat
        vehicleNamesByProject.set(pid, arr);
      }
    }

    // survey flag
    const surveySet = new Set<string>();
    if (projectIds.length) {
      const rs = await supabase
        .from("project_survey_rooms")
        .select("project_id")
        .in("project_id", projectIds);
      if (rs.error && !/does not exist/i.test(rs.error.message)) throw rs.error;
      for (const r of rs.data ?? []) surveySet.add(String(r.project_id));
    }

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

      const supervisor_name: string | null =
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
        vehicle_name, // => "Panther (L 1880 ZB), Grandmax (L 9636 BF)"
        vehicle_names: vehArr,
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || "Failed" }, { status: 500 });
  }
}
