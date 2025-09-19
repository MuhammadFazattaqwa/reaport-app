// app/api/laporan/docx/route.ts
import { NextRequest, NextResponse } from "next/server";
import path from "node:path";
import fs from "node:fs/promises";
import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import ImageModule, {
  ImageModuleOptions,
} from "docxtemplater-image-module-free";
import { createClient } from "@supabase/supabase-js";
import { COMPONENT_TEMPLATE, COMPONENT_ROWS } from "@/lib/componentTemplate";

export const runtime = "nodejs";

/* ===================== Supabase (server) ===================== */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseSrvKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseSrvKey);

/* ===================== Konstanta ===================== */
// Kotak seragam semua gambar (px @96DPI)
const IMG_BOX_W = 220;
const IMG_BOX_H = 150;

const BLANK_IMAGE_DATAURL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAAWgmWQ0AAAAASUVORK5CYII=";

const TEMPLATE_FILE_MAP: Record<string, string> = {
  templatecctvrtrw: "Template_CCTV_RTRW.docx",
  templatebca: "Template_BCA.docx",
  templatemandiri: "Template_Mandiri.docx",
  templatebni: "Template_BNI.docx",
};

// Bucket untuk menyimpan salinan file laporan (opsional tapi direkomendasikan)
const REPORT_BUCKET = "generated-reports";

/* ===================== Utils ===================== */
const tplDir = () => path.join(process.cwd(), "public", "report-templates");
const sanitize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Pastikan bucket storage tersedia */
async function ensureReportBucket() {
  try {
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) throw error;
    if (!buckets?.some((b) => b.name === REPORT_BUCKET)) {
      await supabase.storage.createBucket(REPORT_BUCKET, {
        public: true,
        fileSizeLimit: "50MB",
      });
    }
  } catch (e) {
    // jangan gagalkan proses download; hanya log
    console.warn("[docx] ensureReportBucket warn:", e);
  }
}

/** Baca template sebagai STRING BINER */
async function readTemplateBinaryString(
  req: NextRequest,
  filename: string
): Promise<string> {
  const full = path.join(tplDir(), path.basename(filename));
  try {
    const bin = await fs.readFile(full, { encoding: "binary" });
    return bin;
  } catch {
    const url = new URL(
      `/report-templates/${encodeURIComponent(filename)}`,
      req.url
    );
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(`Gagal fetch template: ${url.toString()}`);
    const ab = await r.arrayBuffer();
    return Buffer.from(ab).toString("binary");
  }
}

/** Prefetch image URL → dataURL (base64) supaya getImage sinkron */
async function fetchToDataUrl(url: string): Promise<string> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`Gagal fetch image: ${url}`);
  const ct = r.headers.get("content-type") || "image/jpeg";
  const ab = await r.arrayBuffer();
  const b64 = Buffer.from(new Uint8Array(ab)).toString("base64");
  return `data:${ct};base64,${b64}`;
}

/** Image module: seragam ukuran dan aman */
function buildImageModule(): ImageModule {
  return new ImageModule({
    getImage: (tagValue: string) => {
      const src = tagValue || BLANK_IMAGE_DATAURL;
      const base64 = src.startsWith("data:")
        ? src.split(",")[1] ?? ""
        : BLANK_IMAGE_DATAURL.split(",")[1] ?? "";
      return Buffer.from(base64, "base64");
    },
    getSize: () => [IMG_BOX_W, IMG_BOX_H],
  } as ImageModuleOptions);
}

/* ===================== Resolusi template ===================== */
async function resolveTemplateFilenameByLabel(label: string): Promise<string> {
  if (!label) return "Template_CCTV_RTRW.docx";
  const trimmed = label.trim();

  const maybeFile = path.basename(trimmed);
  if (maybeFile.toLowerCase().endsWith(".docx")) {
    try {
      await fs.access(path.join(tplDir(), maybeFile));
      return maybeFile;
    } catch {}
  }

  const key = sanitize(trimmed);
  if (TEMPLATE_FILE_MAP[key]) return TEMPLATE_FILE_MAP[key];

  const files = await fs.readdir(tplDir());
  const docx = files.filter((f) => f.toLowerCase().endsWith(".docx"));

  for (const f of docx) {
    const base = path.basename(f, ".docx");
    if (sanitize(base) === key) return f;
  }
  for (const f of docx) {
    const baseSan = sanitize(path.basename(f, ".docx"));
    if (baseSan.includes(key) || key.includes(baseSan)) return f;
  }

  const altKeys = [
    sanitize(`template ${trimmed}`),
    sanitize(trimmed.replace(/^template\s+/i, "")),
  ];
  for (const f of docx) {
    const s = sanitize(path.basename(f, ".docx"));
    if (altKeys.includes(s)) return f;
  }
  return "Template_CCTV_RTRW.docx";
}

async function resolveTemplateFromDB(jobId: string): Promise<string> {
  const { data, error } = await supabase
    .from("projects")
    .select("template_key")
    .eq("job_id", jobId)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[docx] gagal query template project:", error);
    return "Template_CCTV_RTRW.docx";
  }
  const label = (data?.template_key as string) ?? "";
  return await resolveTemplateFilenameByLabel(label);
}

async function resolveTemplateFilename(
  jobId: string,
  templateKeyParam?: string
): Promise<string> {
  if (templateKeyParam) {
    const candidate = path.basename(templateKeyParam);
    try {
      await fs.access(path.join(tplDir(), candidate));
      return candidate;
    } catch {
      return resolveTemplateFilenameByLabel(templateKeyParam);
    }
  }
  return resolveTemplateFromDB(jobId);
}

/* ===================== Loader foto + SN + meter ===================== */
type RowMerged = {
  category_id: string;
  url: string | null; // pakai thumb kalau ada (lebih kecil)
  serial_number: string | null; // SN per kategori
  cable_meter: number | null; // meter (number|null)
};

const asNum = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function loadPhotosMerged(
  req: NextRequest,
  jobId: string
): Promise<RowMerged[]> {
  // 1) API teknisi
  let apiItems: RowMerged[] = [];
  try {
    let res = await fetch(
      new URL(`/api/job-photos/${encodeURIComponent(jobId)}`, req.url),
      {
        cache: "no-store",
      }
    );
    if (!res.ok) {
      const alt = new URL(`/api/job-photos`, req.url);
      alt.searchParams.set("jobId", jobId);
      res = await fetch(alt, { cache: "no-store" });
    }
    if (res.ok) {
      const data = await res.json();
      const items = Array.isArray(data)
        ? data
        : Array.isArray(data.items)
        ? data.items
        : [];
      apiItems = (items as any[]).map((it) => ({
        category_id: String(it.id),
        url: (it.photoThumb || it.photo || null) as string | null,
        serial_number: (it.serialNumber ?? null) as string | null,
        cable_meter: asNum(it.meter),
      }));
    }
  } catch {}

  // 2) Supabase direct
  const rowsFromDb: RowMerged[] = [];
  const { data: dbRows } = await supabase
    .from("job_photos")
    .select("category_id, url, thumb_url, serial_number, cable_meter")
    .eq("job_id", jobId);

  for (const r of (dbRows || []) as any[]) {
    rowsFromDb.push({
      category_id: String(r.category_id),
      url: (r.thumb_url || r.url || null) as string | null,
      serial_number: (r.serial_number ?? null) as string | null,
      cable_meter: asNum(r.cable_meter),
    });
  }

  // 3) Merge (DB jadi prioritas, lalu API)
  const byId = new Map<string, RowMerged>();
  for (const r of [...rowsFromDb, ...apiItems]) {
    const cur = byId.get(r.category_id);
    byId.set(r.category_id, {
      category_id: r.category_id,
      url: cur?.url ?? r.url ?? null,
      serial_number: cur?.serial_number ?? r.serial_number ?? null,
      cable_meter: cur?.cable_meter ?? r.cable_meter ?? null,
    });
  }
  return Array.from(byId.values());
}

/* ===================== Helper: simpan file + catat laporan ===================== */
async function uploadReportAndLog({
  jobId,
  templateFilename,
  fileBuffer,
  req,
}: {
  jobId: string;
  templateFilename: string;
  fileBuffer: Buffer;
  req: NextRequest;
}) {
  try {
    // 1) pastikan bucket ada
    await ensureReportBucket();

    // 2) upload file ke storage (opsional, berguna untuk arsip)
    const ts = Date.now();
    const safeTpl = path.basename(templateFilename).replace(/\.docx$/i, "");
    const objectPath = `${encodeURIComponent(jobId)}/${ts}-${safeTpl}.docx`;

    const up = await supabase.storage
      .from(REPORT_BUCKET)
      .upload(objectPath, fileBuffer, {
        contentType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        upsert: true,
      });

    if (up.error) throw up.error;

    const publicUrl = supabase.storage
      .from(REPORT_BUCKET)
      .getPublicUrl(objectPath).data.publicUrl;

    // 3) ambil project_id dari job_id
    const { data: proj, error: pErr } = await supabase
      .from("projects")
      .select("id, template_key")
      .eq("job_id", jobId)
      .maybeSingle();

    if (pErr) throw pErr;

    // 4) catat ke tabel generated_reports (jika tabel belum ada → abaikan gracefully)
    const insertPayload: Record<string, any> = {
      project_id: proj?.id,
      job_id: jobId,
      file_url: publicUrl,
      template_key: proj?.template_key ?? templateFilename,
    };

    const ins = await supabase.from("generated_reports").insert(insertPayload);
    if (ins.error) {
      // kalau tabel nggak ada, jangan gagalkan download
      const msg = String(ins.error.message || "");
      const isMissing = /does not exist|relation .* generated_reports/i.test(
        msg
      );
      if (!isMissing) throw ins.error;
    }
  } catch (e) {
    // Jangan hentikan respons download; hanya log
    console.warn("[docx] upload/log warning:", e);
  }
}

/* ===================== Generator ===================== */
async function generateDocx(
  req: NextRequest,
  jobId: string,
  templateKeyParam?: string
) {
  if (!jobId) throw new Error("jobId wajib diisi");

  const templateFilename = await resolveTemplateFilename(
    jobId,
    templateKeyParam
  );
  const templateBinary = await readTemplateBinaryString(req, templateFilename);
  if ((templateBinary as any)?.then)
    throw new Error("Internal: templateBinary masih Promise.");

  const rows = await loadPhotosMerged(req, jobId);

  const data: Record<string, any> = {};
  const metersById = new Map<string, number>();

  // set photo/sn/meter placeholders
  for (const r of rows) {
    const id = String(r.category_id);

    // Prefetch image jadi dataURL agar sinkron
    let photoDataUrl = BLANK_IMAGE_DATAURL;
    if (r.url) {
      if (r.url.startsWith("data:")) photoDataUrl = r.url;
      else {
        try {
          photoDataUrl = await fetchToDataUrl(r.url);
        } catch {}
      }
    }
    data[`photo_${id}`] = photoDataUrl;

    if (r.serial_number) data[`sn_${id}`] = String(r.serial_number);

    // Jangan pernah hasilkan "undefined" — kosongkan jika null
    const m = r.cable_meter;
    if (m !== null && m !== undefined && Number.isFinite(Number(m))) {
      const mv = Number(m);
      metersById.set(id, mv);
      data[`meter_${id}`] = String(mv);
    } else {
      data[`meter_${id}`] = ""; // hindari "undefined"
    }
  }

  // hitung total terpakai = awal − akhir (per pasangan)
  const pairs = [
    { before: "28", after: "29", key: "cam1" },
    { before: "30", after: "31", key: "cam2" },
    { before: "32", after: "33", key: "cam3" },
    { before: "34", after: "35", key: "cam4" },
    { before: "36", after: "37", key: "nvr" },
  ];

  for (const { before, after, key } of pairs) {
    const a = metersById.get(before);
    const b = metersById.get(after);
    if (typeof a === "number" && typeof b === "number") {
      const diff = a - b; // sesuai permintaan: awal − akhir
      data[`meter_total_${key}`] = String(diff);
      data[`meter_total_${before}_${after}`] = String(diff); // alias generik
    } else {
      data[`meter_total_${key}`] = "";
      data[`meter_total_${before}_${after}`] = "";
    }
  }

  {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    for (let row = 1; row <= COMPONENT_ROWS; row++) {
      const keyNama = `komp${pad2(row)}_nama`;
      const keySat = `komp${pad2(row)}_satuan`;
      const item = COMPONENT_TEMPLATE.find((x) => x.id === String(row)) || null;
      data[keyNama] = item?.name ?? ""; // nama komponen baris ke-row
      data[keySat] = item?.unit ?? ""; // satuan baris ke-row
    }
  }

  const zip = new PizZip(templateBinary);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    modules: [buildImageModule()],
  });

  doc.render(data);

  // hasilkan buffer dokumen
  const outAB = doc.getZip().generate({ type: "arraybuffer" });
  const outBuf = Buffer.from(outAB as ArrayBuffer);

  // Simpan ke storage + log ke generated_reports (tidak mengganggu download)
  await uploadReportAndLog({
    jobId,
    templateFilename,
    fileBuffer: outBuf,
    req,
  });

  // kirim file ke klien
  return new NextResponse(outBuf, {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="laporan-${jobId}.docx"`,
    },
  });
}

/* ===================== Handlers ===================== */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const jobId = String(body?.jobId || "");
    const templateKey =
      (body?.templateKey && String(body.templateKey)) ||
      (body?.template_key && String(body.template_key)) ||
      undefined;
    return await generateDocx(req, jobId, templateKey);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal generate dokumen" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const jobId = String(req.nextUrl.searchParams.get("jobId") || "");
    const templateKey =
      req.nextUrl.searchParams.get("template_key") ||
      req.nextUrl.searchParams.get("templateKey") ||
      undefined;
    return await generateDocx(req, jobId, templateKey);
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Gagal generate dokumen" },
      { status: 500 }
    );
  }
}
