// /app/api/projects/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { effectiveWIBDate, visibleUntilCompletedAt } from "@/lib/wib";

/* =============== Utils =============== */

// selisih hari inklusif, aman UTC dari "YYYY-MM-DD"
const diffDaysInclusiveUTC = (start: string, end: string) => {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const sUTC = Date.UTC(ys, (ms ?? 1) - 1, ds ?? 1);
  const eUTC = Date.UTC(ye, (me ?? 1) - 1, de ?? 1);
  const d = Math.floor((eUTC - sUTC) / 86400000) + 1;
  return d > 0 ? d : 0;
};

// pilih tanggal yang lebih awal (string YYYY-MM-DD)
const earlierOf = (a?: string | null, b?: string | null) => {
  if (a && b) return a < b ? a : b;
  return a ?? b ?? null;
};

// hitung days_elapsed + freeze saat pending
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

/* =============== GET: list projects =============== */

export async function GET(req?: NextRequest) {
  const todayWIB = effectiveWIBDate();
  const url = req ? new URL(req.url) : null;
  const queryDate = url?.searchParams.get("date") || todayWIB;

  const { data: projects, error: pErr } = await supabaseAdmin
    .from("projects")
    .select(
      `
      id, job_id, name, lokasi,
      sales_name, presales_name,
      status,
      project_status,
      pending_reason, pending_since,
      sigma_hari, sigma_teknisi, sigma_man_days,
      jam_datang, jam_pulang,
      tanggal_mulai, tanggal_deadline,
      closed_at, completed_at,
      created_at
    `
    )
    .lte("tanggal_mulai", queryDate)
    .order("created_at", { ascending: false });

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  // Hitung actual man days & lastAttendanceDate sampai queryDate
  const ids = (projects ?? []).map((p) => p.id);
  const actual = new Map<string, number>();
  const lastDate = new Map<string, string>();
  if (ids.length) {
    const { data: assigns, error: aErr } = await supabaseAdmin
      .from("attendance")
      .select("project_id, work_date")
      .lte("work_date", queryDate)
      .in("project_id", ids);

    if (aErr)
      return NextResponse.json({ error: aErr.message }, { status: 500 });

    for (const r of assigns ?? []) {
      actual.set(r.project_id, (actual.get(r.project_id) ?? 0) + 1);
      const prev = lastDate.get(r.project_id);
      if (!prev || r.work_date > prev) lastDate.set(r.project_id, r.work_date);
    }
  }

  const nowMs = Date.now();
  const visible = (projects ?? []).filter((p) =>
    visibleUntilCompletedAt(p.completed_at, queryDate, todayWIB, nowMs)
  );

  const shaped = visible.map((p) => {
    const isPending = p.project_status === "pending" || !!p.pending_reason;

    const days_elapsed = computeDaysElapsed({
      start: p.tanggal_mulai,
      today: queryDate,
      deadline: p.tanggal_deadline,
      isPending,
      lastAttendanceDate: lastDate.get(p.id) ?? null,
      pendingSince: p.pending_since ?? null,
    });

    // Tentukan completed day (H) dalam WIB
    const completedWIB = p.completed_at
      ? new Date(new Date(p.completed_at).getTime() + 7 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10)
      : null;
    const isCompletedDay = !!completedWIB && completedWIB === queryDate;

    let progressStatus: "ongoing" | "completed" | "overdue" = "ongoing";
    if (p.completed_at) {
      progressStatus = "completed";
    } else if (
      (p.sigma_hari && days_elapsed > p.sigma_hari) ||
      (p.tanggal_deadline && queryDate > p.tanggal_deadline)
    ) {
      progressStatus = "overdue";
    }

    return {
      id: p.id,
      job_id: p.job_id,
      name: p.name,
      lokasi: p.lokasi,
      sales_name: p.sales_name,
      presales_name: p.presales_name,

      status: progressStatus,
      // tampilkan kategori 'completed' hanya di hari H (UI)
      project_status: (isCompletedDay ? "completed" : p.project_status) as
        | "unassigned"
        | "ongoing"
        | "pending"
        | "completed",
      pending_reason: p.pending_reason ?? null,

      sigma_hari: p.sigma_hari ?? 0,
      sigma_teknisi: p.sigma_teknisi ?? 0,
      sigma_man_days: p.sigma_man_days ?? 0,

      jam_datang: p.jam_datang,
      jam_pulang: p.jam_pulang,
      days_elapsed,

      created_at: p.created_at,
      assignment_count: 0,
      leader_count: 0,
      actual_man_days: actual.get(p.id) ?? 0,
    };
  });

  return NextResponse.json({ data: shaped });
}

/* =============== Helpers: Insert + retry unik lokasi/job_id =============== */

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

  // Coba beberapa kali untuk bentrok job_id (trigger) atau lokasi
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({ ...baseInsert, lokasi: lokasiAdjusted })
      .select()
      .single();

    if (!error && data) {
      return { ok: true, project: data };
    }

    if (error && (error as any).code === "23505") {
      const msg = `${(error as any).message || ""} ${
        (error as any).details || ""
      }`.toLowerCase();

      // Bentrok lokasi (unique index: projects_code_key on (lokasi))
      if (msg.includes("projects_code_key") || msg.includes("(lokasi)")) {
        if (!triedLokasiAdjust) {
          triedLokasiAdjust = true;
          // Tambahkan suffix agar lolos constraint unik(lokasi)
          const suffix = ` #${Date.now().toString().slice(-4)}`;
          lokasiAdjusted = lokasiAdjusted
            ? `${lokasiAdjusted}${suffix}`
            : suffix;
          continue; // retry segera
        }
        // sudah coba adjust -> anggap gagal
        return {
          ok: false,
          error: "Lokasi sudah digunakan. Mohon ubah lokasi.",
        };
      }

      // Bentrok job_id (unique via trigger) -> retry ringan (biarkan trigger generate ulang)
      if (msg.includes("projects_job_id_key") || msg.includes("(job_id)")) {
        await sleep(60);
        continue;
      }
    }

    // Error lain
    return {
      ok: false,
      error: (error as any)?.message ?? "Gagal insert project",
    };
  }

  return { ok: false, error: "Gagal insert project (max retry)" };
}

/* =============== POST: create project (single / multi by paket) =============== */

export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    namaProject: string;
    lokasi?: string | null;
    namaSales?: string | null;
    namaPresales?: string | null;
    tanggalSpkUser?: string | null;
    tanggalTerimaPo?: string | null;
    tanggalMulaiProject: string;
    tanggalDeadlineProject: string;
    sigmaManDays: number;
    sigmaHari: number;
    sigmaTeknisi: number;
    templateKey: string;

    // NEW
    durasiMinutes?: number | null;
    insentif?: number | null;
    paketDetails?: Array<{ seq: number; rw: string | null; rt: string | null }>;
  };

  if (
    !body.namaProject ||
    !body.tanggalMulaiProject ||
    !body.tanggalDeadlineProject ||
    !body.templateKey
  ) {
    return NextResponse.json(
      { error: "Data project tidak lengkap" },
      { status: 400 }
    );
  }

  const durasi = Number.isFinite(body.durasiMinutes)
    ? Math.max(1, Math.floor(body.durasiMinutes as number))
    : 120;

  const insentif = Number.isFinite(body.insentif) ? Number(body.insentif) : 0;

  const baseInsert: InsertProjectRow = {
    name: body.namaProject.trim(),
    lokasi: body.lokasi?.trim() || null,
    sales_name: body.namaSales ?? null,
    presales_name: body.namaPresales ?? null,
    tgl_spk_user: body.tanggalSpkUser ?? null,
    tgl_terima_po: body.tanggalTerimaPo ?? null,
    tanggal_mulai: body.tanggalMulaiProject,
    tanggal_deadline: body.tanggalDeadlineProject,
    sigma_man_days: body.sigmaManDays ?? 0,
    sigma_hari: body.sigmaHari ?? 0,
    sigma_teknisi: body.sigmaTeknisi ?? 0,
    project_status: "unassigned",
    jam_datang: "08:00:00",
    jam_pulang: "17:00:00",
    template_key: body.templateKey,
    durasi_minutes: durasi,
    insentif: insentif,
  };

  const paketList =
    (body.paketDetails ?? [])
      .filter((p) => p && Number.isFinite(p.seq))
      .slice(0, 30) || [];

  // ====== MODE MULTI: >1 paket -> buat banyak project ======
  if (paketList.length > 1) {
    const created: any[] = [];
    const errors: Array<{ seq: number; error: string }> = [];

    // Agar unik(lokasi) aman, gunakan tanggal mulai + RW/RT
    const baseLokasi = baseInsert.lokasi;
    const tgl = body.tanggalMulaiProject; // YYYY-MM-DD

    for (const det of paketList) {
      const rw = (det.rw || "").trim();
      const rt = (det.rt || "").trim();

      // Nama proyek TANPA kata "Paket"
      const name = `${baseInsert.name} (RW${rw || "-"} / RT${rt || "-"})`;

      // Lokasi unik: <base> - <tgl> RWxxRTyy
      const rwPad = (rw || "0").padStart(2, "0");
      const rtPad = (rt || "0").padStart(2, "0");
      const lokasi = baseLokasi
        ? `${baseLokasi} - ${tgl} RW${rwPad}RT${rtPad}`
        : `${tgl} RW${rwPad}RT${rtPad}`;

      const result = await insertProjectWithRetries({
        ...baseInsert,
        name,
        lokasi,
      });

      if (result.ok) {
        const project = result.project;

        // simpan paket ke table project_packages (1 paket per project)
        await supabaseAdmin.from("project_packages").insert([
          {
            project_id: project.id,
            seq: det.seq,
            rw: det.rw ?? null,
            rt: det.rt ?? null,
          },
        ]);

        created.push(project);
      } else {
        errors.push({ seq: det.seq, error: result.error });
      }
    }

    if (!created.length) {
      // semua gagal
      return NextResponse.json(
        {
          error:
            errors.map((e) => `#${e.seq}: ${e.error}`).join("; ") ||
            "Gagal membuat project",
        },
        { status: 409 }
      );
    }

    // Bentuk respons UI
    const today = effectiveWIBDate();
    const shaped = created.map((p) => {
      const isPending = p.project_status === "pending" || !!p.pending_reason;
      const daysElapsed = computeDaysElapsed({
        start: p.tanggal_mulai,
        today,
        deadline: p.tanggal_deadline,
        isPending,
      });
      return {
        id: p.id,
        job_id: p.job_id,
        name: p.name,
        lokasi: p.lokasi,
        sales_name: p.sales_name,
        presales_name: p.presales_name,
        status: "ongoing" as const,
        project_status: p.project_status,
        pending_reason: p.pending_reason,
        sigma_hari: p.sigma_hari,
        sigma_teknisi: p.sigma_teknisi,
        sigma_man_days: p.sigma_man_days,
        jam_datang: p.jam_datang,
        jam_pulang: p.jam_pulang,
        days_elapsed: daysElapsed,
        created_at: p.created_at,
        assignment_count: 0,
        leader_count: 0,
        actual_man_days: 0,
      };
    });

    return NextResponse.json(
      {
        data: shaped, // array
        created_count: shaped.length,
        failed: errors,
      },
      { status: 201 }
    );
  }

  // ====== MODE SINGLE: 0/1 paket -> 1 project + (opsional) paket rows ======
  const single = await insertProjectWithRetries(baseInsert);
  if (!single.ok) {
    return NextResponse.json({ error: single.error }, { status: 409 });
  }

  const project = single.project;

  // Insert paket details bila ada (maks 30)
  if (paketList.length) {
    const rows = paketList.map((p) => ({
      project_id: project.id,
      seq: Math.max(1, Math.floor(p.seq)),
      rw: p.rw ?? null,
      rt: p.rt ?? null,
    }));
    const { error: pkgErr } = await supabaseAdmin
      .from("project_packages")
      .insert(rows);
    if (pkgErr)
      return NextResponse.json({ error: pkgErr.message }, { status: 500 });
  }

  const refDate = effectiveWIBDate();
  const daysElapsed = computeDaysElapsed({
    start: project.tanggal_mulai,
    today: refDate,
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
    status: "ongoing" as const,
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
