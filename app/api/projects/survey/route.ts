// /app/api/projects/survey/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { effectiveWIBDate } from "@/lib/wib";

/* =============== Utils kecil =============== */

// selisih hari inklusif, aman UTC dari "YYYY-MM-DD"
const diffDaysInclusiveUTC = (start: string, end: string) => {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const sUTC = Date.UTC(ys, (ms ?? 1) - 1, ds ?? 1);
  const eUTC = Date.UTC(ye, (me ?? 1) - 1, de ?? 1);
  const d = Math.floor((eUTC - sUTC) / 86400000) + 1;
  return d > 0 ? d : 0;
};

const earlierOf = (a?: string | null, b?: string | null) => {
  if (a && b) return a < b ? a : b;
  return a ?? b ?? null;
};

const computeDaysElapsed = (params: {
  start?: string | null;
  today: string;
  deadline?: string | null;
  isPending: boolean;
  lastAttendanceDate?: string | null;
  pendingSince?: string | null;
}) => {
  const {
    start,
    today,
    deadline,
    isPending,
    lastAttendanceDate,
    pendingSince,
  } = params;
  if (!start) return 0;
  const normalCutoff = today;
  const basePendingCutoff = pendingSince || lastAttendanceDate || today;
  const pendingCutoff =
    earlierOf(basePendingCutoff, deadline) ?? basePendingCutoff;
  const cutoff = isPending ? pendingCutoff : normalCutoff;
  return diffDaysInclusiveUTC(start, cutoff);
};

type InsertProjectRow = {
  name: string;
  lokasi: string | null;
  sales_name: string | null;
  presales_name: string | null;
  tgl_spk_user: string | null;
  tgl_terima_po: string | null;
  tanggal_mulai: string;
  tanggal_deadline: string;
  sigma_man_days: number;
  sigma_hari: number;
  sigma_teknisi: number;
  project_status: "unassigned";
  jam_datang: string;
  jam_pulang: string;
  template_key: string;
  durasi_minutes: number;
  insentif: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function insertProjectWithRetries(
  baseInsert: InsertProjectRow
): Promise<{ ok: true; project: any } | { ok: false; error: string }> {
  let lokasiAdjusted = baseInsert.lokasi;
  let triedLokasiAdjust = false;

  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({ ...baseInsert, lokasi: lokasiAdjusted })
      .select()
      .single();

    if (!error && data) return { ok: true, project: data };

    if (error && (error as any).code === "23505") {
      const msg = `${(error as any).message || ""} ${
        (error as any).details || ""
      }`.toLowerCase();

      // bentrok unik(lokasi) (nama index bisa berbeda di tiap DB),
      // deteksi generik dengan '(lokasi)' agar aman
      if (msg.includes("(lokasi)") || msg.includes("projects_code_key")) {
        if (!triedLokasiAdjust) {
          triedLokasiAdjust = true;
          const suffix = ` #${Date.now().toString().slice(-4)}`;
          lokasiAdjusted = lokasiAdjusted
            ? `${lokasiAdjusted}${suffix}`
            : suffix;
          continue;
        }
        return {
          ok: false,
          error: "Lokasi sudah digunakan. Mohon ubah lokasi.",
        };
      }

      // bentrok job_id (unique via trigger) -> retry tipis
      if (msg.includes("(job_id)") || msg.includes("projects_job_id_key")) {
        await sleep(60);
        continue;
      }
    }

    return {
      ok: false,
      error: (error as any)?.message ?? "Gagal insert project",
    };
  }

  return { ok: false, error: "Gagal insert project (max retry)" };
}

/* =============== POST: create SURVEY project =============== */

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    namaProject: string;
    namaGedung: string;
    lokasi: string;
    tanggalMulaiProject: string;
    tanggalDeadlineProject: string;
    totalHari: number;
    totalTeknisi: number;
    totalManDays: number;
    tipeTemplate: string;
    roomDetails: Array<{ floor: number; rooms: string[] }>;
  };

  // validasi minimal
  if (
    !body.namaProject ||
    !body.namaGedung ||
    !body.lokasi ||
    !body.tanggalMulaiProject ||
    !body.tanggalDeadlineProject ||
    !Number.isFinite(body.totalHari) ||
    !Number.isFinite(body.totalTeknisi) ||
    !Number.isFinite(body.totalManDays) ||
    !body.tipeTemplate
  ) {
    return NextResponse.json(
      { error: "Data survey tidak lengkap" },
      { status: 400 }
    );
  }

  // mapping ke kolom projects
  const baseInsert: InsertProjectRow = {
    name: body.namaProject.trim(), // contoh: "Survey_GedungX_LokasiY" dari UI
    // gabungkan gedung + alamat agar unik & informatif
    lokasi: `${body.namaGedung.trim()} - ${body.lokasi.trim()}`,
    sales_name: null,
    presales_name: null,
    tgl_spk_user: null,
    tgl_terima_po: null,
    tanggal_mulai: body.tanggalMulaiProject,
    tanggal_deadline: body.tanggalDeadlineProject,
    sigma_man_days: Math.max(0, Math.floor(body.totalManDays)),
    sigma_hari: Math.max(0, Math.floor(body.totalHari)),
    sigma_teknisi: Math.max(0, Math.floor(body.totalTeknisi)),
    project_status: "unassigned",
    jam_datang: "08:00:00",
    jam_pulang: "17:00:00",
    template_key: body.tipeTemplate,
    durasi_minutes: 120, // default (bisa diubah jika mau)
    insentif: 0,
  };

  // insert project
  const created = await insertProjectWithRetries(baseInsert);
  if (!created.ok) {
    return NextResponse.json({ error: created.error }, { status: 409 });
  }

  const project = created.project;

  // flatten roomDetails -> rows tabel project_survey_rooms
  const roomRows: Array<{
    project_id: string;
    floor: number;
    seq: number;
    room_name: string;
  }> = [];
  for (const det of body.roomDetails ?? []) {
    const floor = Math.max(1, Math.floor(det.floor || 0));
    const rooms = Array.isArray(det.rooms) ? det.rooms : [];
    rooms.forEach((raw, idx) => {
      const name = String(raw || "").trim() || `Ruangan #${idx + 1}`;
      roomRows.push({
        project_id: project.id,
        floor,
        seq: idx + 1,
        room_name: name,
      });
    });
  }

  if (roomRows.length) {
    const { error: roomsErr } = await supabaseAdmin
      .from("project_survey_rooms")
      .insert(roomRows);
    if (roomsErr) {
      // bila gagal simpan ruangan, balikan 500 tapi project sudah ada
      return NextResponse.json(
        {
          error: `Project dibuat, namun gagal menyimpan ruangan: ${roomsErr.message}`,
        },
        { status: 500 }
      );
    }
  }

  // bentuk response seperti /api/projects
  const today = effectiveWIBDate();
  const daysElapsed = computeDaysElapsed({
    start: project.tanggal_mulai,
    today,
    deadline: project.tanggal_deadline,
    isPending: false,
  });

  const shaped = {
    id: project.id,
    job_id: project.job_id,
    name: project.name,
    lokasi: project.lokasi,
    sales_name: project.sales_name,
    presales_name: project.presales_name,
    status: "ongoing" as const, // default status progress
    project_status: project.project_status,
    pending_reason: project.pending_reason,

    sigma_hari: project.sigma_hari,
    sigma_teknisi: project.sigma_teknisi,
    sigma_man_days: project.sigma_man_days,

    jam_datang: project.jam_datang,
    jam_pulang: project.jam_pulang,

    days_elapsed: daysElapsed,

    created_at: project.created_at,
    assignment_count: 0,
    leader_count: 0,
    actual_man_days: 0,
  };

  return NextResponse.json({ data: shaped }, { status: 201 });
}
