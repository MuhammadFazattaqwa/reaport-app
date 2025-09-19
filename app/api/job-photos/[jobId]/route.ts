import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServers"; // sesuaikan path jika berbeda
import { PHOTO_TEMPLATE } from "@/lib/photoTemplate";

export const revalidate = 0;
export const dynamic = "force-dynamic";

type TemplateType = "photo" | "photo+sn" | "photo+cable";

type TemplateItem = {
  id: string;
  name: string;
  type: TemplateType;
  sort?: number | null;
};

type LatestRow = {
  category_id: string;
  url: string | null;
  thumb_url: string | null;
  serial_number: string | null;
  cable_meter: number | string | null;
  selected_photo_id: string | null;
};

type EntryRow = {
  id: string;
  job_id: string;
  category_id: string;
  url: string;
  thumb_url: string;
  created_at: string | null;
  sharpness: number | null;
  token: number | null;
};

type PhotoEntry = {
  id: string;
  createdAt: number;
  thumb: string;
  remoteUrl?: string;
  sharpness: number;
  uploadState: "uploaded";
};

type ApiItem = {
  id: string;
  name: string;
  type: TemplateType;
  requiresSerialNumber: boolean;
  requiresCable: boolean;

  // kompat lama (masih dikirim)
  photoThumb: string | null;
  photo: string | null;

  // baru (riwayat & pilihan utama)
  photos: PhotoEntry[];
  selectedPhotoId: string | null;

  // meta
  serialNumber: string | null;
  meter: number | null; // hanya untuk type "photo+cable"
};

// Helper: aman parse number
function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Helper: pilih id terbaik bila selectedPhotoId tidak ada
function pickBestPhotoId(list: PhotoEntry[]): string | null {
  if (!list.length) return null;
  let best = list[0];
  for (const p of list) if (p.sharpness > best.sharpness) best = p;
  return best.id;
}

// ⬇️ NOTE: params adalah Promise → wajib di-await
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId: raw } = await params; // ✅ await
    const jobId = decodeURIComponent(raw ?? "");
    if (!jobId) {
      return NextResponse.json({ error: "jobId required" }, { status: 400 });
    }

    const supabase = supabaseServer();

    // ===== Status project (pending / active) =====
    const pj = await supabase
      .from("projects")
      .select("status, pending_since, pending_reason")
      .eq("job_id", jobId)
      .maybeSingle();

    const isPending =
      !!pj.data &&
      (pj.data.status === "pending" ||
        pj.data.pending_since !== null ||
        pj.data.pending_reason !== null);

    // ===== Ambil snapshot terbaru per kategori (job_photos) =====
    const { data: latest, error: eLatest } = await supabase
      .from("job_photos")
      .select(
        "category_id, url, thumb_url, serial_number, cable_meter, selected_photo_id"
      )
      .eq("job_id", jobId);

    if (eLatest) {
      return NextResponse.json({ error: eLatest.message }, { status: 500 });
    }

    const latestByCat = new Map<string, LatestRow>();
    for (const r of latest ?? []) {
      latestByCat.set(String(r.category_id), r as LatestRow);
    }

    // ===== Ambil semua entri riwayat (job_photo_entries) =====
    let entriesByCat = new Map<string, EntryRow[]>();
    try {
      const { data: entries, error: eEntries } = await supabase
        .from("job_photo_entries")
        .select(
          "id, job_id, category_id, url, thumb_url, created_at, sharpness, token"
        )
        .eq("job_id", jobId)
        .order("created_at", { ascending: true });

      if (!eEntries && entries) {
        entriesByCat = entries.reduce((map, row) => {
          const key = String(row.category_id);
          const arr = map.get(key) ?? [];
          arr.push(row);
          map.set(key, arr);
          return map;
        }, new Map<string, EntryRow[]>());
      }
    } catch {
      // fallback silently
    }

    // ===== Template (urutkan) =====
    const template: TemplateItem[] = (PHOTO_TEMPLATE as TemplateItem[])
      .slice()
      .sort((a, b) => Number(a.sort ?? 0) - Number(b.sort ?? 0));

    // ===== Bangun daftar item untuk UI =====
    const items: ApiItem[] = template.map((tpl) => {
      const latestRow = latestByCat.get(tpl.id);

      // photos[] dari riwayat
      const rawList = entriesByCat.get(tpl.id) ?? [];
      const photos: PhotoEntry[] = rawList.map((p) => ({
        id: String(p.id),
        createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now(),
        thumb: p.thumb_url,
        remoteUrl: p.url || undefined,
        sharpness: typeof p.sharpness === "number" ? p.sharpness : 0,
        uploadState: "uploaded" as const,
      }));

      // fallback: jika riwayat kosong tetapi ada snapshot tunggal → buat satu item palsu
      if (!photos.length && (latestRow?.thumb_url || latestRow?.url)) {
        photos.push({
          id: `remote-${tpl.id}`,
          createdAt: Date.now(),
          thumb: latestRow?.thumb_url || latestRow?.url || "",
          remoteUrl: latestRow?.url || undefined,
          sharpness: 0,
          uploadState: "uploaded",
        });
      }

      // Meter hanya valid untuk "photo+cable"
      let meter: number | null = null;
      if (tpl.type === "photo+cable" && latestRow?.cable_meter != null) {
        meter = toNumOrNull(latestRow.cable_meter);
      }

      // Tentukan selectedPhotoId
      const selectedPhotoId =
        latestRow?.selected_photo_id ??
        (photos.length ? pickBestPhotoId(photos) : null);

      return {
        id: tpl.id,
        name: tpl.name,
        type: tpl.type,
        requiresSerialNumber: tpl.type === "photo+sn",
        requiresCable: tpl.type === "photo+cable",

        // kompat lama (tetap kirim)
        photoThumb: latestRow?.thumb_url ?? null,
        photo: latestRow?.url ?? null,

        // baru
        photos,
        selectedPhotoId,

        // meta
        serialNumber: latestRow?.serial_number ?? null,
        meter,
      };
    });

    // ===== Hitung progres =====
    const total = template.length;
    const complete = items.filter((it) => {
      const hasImg = it.photos.length > 0 || Boolean(it.photoThumb || it.photo);
      if (!hasImg) return false;
      if (it.requiresSerialNumber && !it.serialNumber) return false;
      return true;
    }).length;

    const uploaded = complete;
    const percent = total ? Math.round((uploaded / total) * 100) : 0;

    return NextResponse.json({
      items,
      status: isPending ? "pending" : "active",
      uploaded,
      total,
      progress: {
        total,
        complete,
        uploaded,
        percent,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unexpected error" },
      { status: 500 }
    );
  }
}
