// app/admin/generate_laporan/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminHeader } from "@/components/admin-header";
import {
  FileText,
  Download,
  Eye,
  Calendar,
  MapPin,
  User,
  Camera,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  X,
} from "lucide-react";

/* ================= Supabase ================= */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* ================= Types ================= */
interface GenerateForm {
  projectName: string;
  jobId: string; // projects.job_id (kode job)
}
interface ProjectGroup {
  id: string;
  name: string;
}
interface JobRow {
  id: string; // job_id
  job_id?: string | null;
  name: string | null;
  project_id: string; // projects.id (uuid)
  lokasi: string | null;
  tanggal_mulai?: string | null;
  closed_at?: string | null;
  sigma_teknisi?: number | null;
  sales_name?: string | null;
  presales_name?: string | null;
}
interface PhotoCategory {
  id: string;
  name: string;
  photos: string[];
  currentIndex: number;
  snKey?: string | null;
  cableM?: number;
  serialNumber?: string | null;
  measures?: (number | null)[];
}
interface ReportPreview {
  jobName: string;
  technicianName: string;
  location: string;
  completedDate: string;
  photoCategories: PhotoCategory[];
  serialNumbers: { [key: string]: string };
  notes: string;
  projectName?: string;
  salesName?: string | null;
  presalesName?: string | null;
}
interface HoverOverlayState {
  isOpen: boolean;
  categoryId: string;
  photoIndex: number;
  isLoading: boolean;
  hasError: boolean;
}

/* ====== API teknisi (fallback) ====== */
type TechItem = {
  id: string | number;
  name: string;
  requiresSerialNumber: boolean;
  photo?: string | null;
  photoThumb?: string | null;
  serialNumber?: string | null;
  meter?: number | string | null;
  photos?: Array<{
    id: string;
    thumb: string | null;
    url: string | null;
    createdAt?: string;
  }>;
  selectedPhotoId?: string | null;
};

/* ====== Survey types ====== */
interface SurveyUploadRow {
  id: string;
  room_id: string;
  url: string;
  thumb_url?: string | null;
  created_at: string;
}
interface SurveyMetaRow {
  upload_id: string;
  category: string;
  measure_value?: number | null;
  measure_unit?: string | null;
}

/* ===== Helpers ===== */
const isCableName = (s: string) =>
  /(kabel|cable|wire|utp|coax|fiber|fibre)/i.test(s);

const toNumber = (v: unknown): number | undefined => {
  if (v === null || v === undefined) return undefined;
  const n =
    typeof v === "string" ? Number(v.replace(",", ".").trim()) : Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const truncateSerialNumber = (sn: string, max = 12) =>
  sn.length <= max ? sn : sn.slice(0, max) + "...";

const fmtDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toISOString().slice(0, 10);
  } catch {
    return String(d);
  }
};

function truncateText(s?: string | null, n = 25) {
  if (!s) return "";
  return s.length <= n ? s : s.slice(0, n) + "…";
}

const formatMeter = (m: number) => {
  const rounded =
    Math.abs(m - Math.round(m)) < 1e-9 ? m.toFixed(0) : m.toFixed(2);
  return `${rounded} m`;
};

const getActiveMeasure = (c?: PhotoCategory) =>
  c?.measures?.[c.currentIndex] ?? c?.cableM;

/** =========================
 *  Fallback instalasi/teknisi
 *  —> SEKARANG AMBIL SEMUA FOTO + POSISIKAN currentIndex BERDASARKAN selectedPhotoId
 *  Ini yang bikin realtime berubah ketika "Set sebagai Utama" ditekan oleh teknisi.
 *  ========================= */
/** Fallback instalasi/teknisi — HANYA foto Utama (hemat bandwidth) */
async function loadPhotosFromTechnicianApi(jobId: string): Promise<{
  categories: PhotoCategory[];
  serialsByName: Record<string, string>;
}> {
  const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({} as any));
  if (!res.ok)
    throw new Error(data?.error || `Gagal mengambil foto untuk job ${jobId}`);

  type TechItemLocal = {
    id: string | number;
    name: string;
    requiresSerialNumber: boolean;
    photo?: string | null; // legacy (single)
    photoThumb?: string | null; // legacy (single)
    serialNumber?: string | null;
    meter?: number | string | null;
    photos?: Array<{
      id: string;
      thumb: string | null;
      url: string | null;
      createdAt?: string;
    }>;
    selectedPhotoId?: string | null;
  };

  const items: TechItemLocal[] = data.items ?? [];

  const categories: PhotoCategory[] = items
    // pastikan minimal ada 1 foto yg bisa ditampilkan
    .filter((it) => (it.photos?.length ?? 0) > 0 || it.photoThumb || it.photo)
    .map((it) => {
      let photos: string[] = [];
      let currentIndex = 0;

      if (it.photos?.length) {
        // === MODE BARU: pilih hanya foto Utama ===
        let idx = 0;
        if (it.selectedPhotoId) {
          const found = it.photos.findIndex((p) => p.id === it.selectedPhotoId);
          if (found >= 0) idx = found;
        }
        const sel = it.photos[idx] || it.photos[0];
        const selDisplay = sel?.thumb || sel?.url || "";
        photos = selDisplay ? [String(selDisplay)] : [];
        currentIndex = 0; // karena hanya 1 foto
      } else if (it.photoThumb || it.photo) {
        // === LEGACY: tetap 1 foto (memang single) ===
        photos = [String(it.photoThumb || it.photo)];
        currentIndex = 0;
      }

      return {
        id: String(it.id),
        name: it.name,
        photos, // HANYA 1: foto utama
        currentIndex: 0, // selalu 0 karena single
        cableM: ((): number | undefined => {
          if (it.meter === null || it.meter === undefined) return undefined;
          const n =
            typeof it.meter === "string"
              ? Number(it.meter.replace(",", ".").trim())
              : Number(it.meter);
          return Number.isFinite(n) ? n : undefined;
        })(),
        serialNumber: it.serialNumber ? String(it.serialNumber) : null,
      };
    });

  // Map label SN by name (tetap sama)
  const serialsByName: Record<string, string> = {};
  for (const it of items) {
    if (it.requiresSerialNumber && it.serialNumber) {
      serialsByName[it.name] = String(it.serialNumber);
    }
  }

  return { categories, serialsByName };
}

/** meta dari supabase (fallback instalasi/teknisi) */
async function fetchPhotoMeta(jobId: string): Promise<{
  metersByCat: Record<string, number>;
  snByCat: Record<string, string>;
}> {
  const metersByCat: Record<string, number> = {};
  const snByCat: Record<string, string> = {};

  const { data, error } = await supabase
    .from("job_photos")
    .select("category_id, cable_meter, serial_number")
    .eq("job_id", jobId);

  if (!error && data) {
    for (const row of data as any[]) {
      const cid = String(row.category_id);
      const m = toNumber(row.cable_meter);
      if (m !== undefined) metersByCat[cid] = m;
      if (row.serial_number) snByCat[cid] = String(row.serial_number);
    }
  }
  return { metersByCat, snByCat };
}

/** Ambil foto SURVEY: group per (Room — Kategori) + simpan measures per foto */
async function loadSurveyCategories(
  projectId: string
): Promise<PhotoCategory[]> {
  // Rooms
  const roomsRes = await supabase
    .from("project_survey_rooms")
    .select("id, room_name, floor, seq")
    .eq("project_id", projectId)
    .order("floor", { ascending: true })
    .order("seq", { ascending: true });

  if (roomsRes.error) return [];

  const roomMap = new Map<string, { name: string; floor: number }>();
  for (const r of (roomsRes.data as any[]) || []) {
    roomMap.set(String(r.id), {
      name: String(r.room_name),
      floor: Number(r.floor),
    });
  }

  // Uploads
  const upRes = await supabase
    .from("survey_room_uploads")
    .select("id, room_id, url, thumb_url, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (upRes.error || !upRes.data?.length) return [];

  const uploads: SurveyUploadRow[] = (upRes.data as any[]).map((u) => ({
    id: String(u.id),
    room_id: String(u.room_id),
    url: String(u.url),
    thumb_url: u.thumb_url ? String(u.thumb_url) : null,
    created_at: String(u.created_at),
  }));

  // Meta
  const ids = uploads.map((u) => u.id);
  const metaRes =
    ids.length > 0
      ? await supabase
          .from("survey_room_upload_meta")
          .select("upload_id, category, measure_value, measure_unit")
          .in("upload_id", ids)
      : { data: [], error: null as any };

  const metaMap = new Map<string, SurveyMetaRow>();
  if (!("error" in metaRes) || !metaRes.error) {
    for (const m of (metaRes.data as any[]) || []) {
      metaMap.set(String(m.upload_id), {
        upload_id: String(m.upload_id),
        category: String(m.category || "Dokumentasi Umum"),
        measure_value:
          m.measure_value === null || m.measure_value === undefined
            ? null
            : Number(m.measure_value),
        measure_unit: (m.measure_unit as any) ?? "m",
      });
    }
  }

  // Group per "Room — Kategori" dan simpan measures sejajar photos
  const group = new Map<string, PhotoCategory>();
  for (const u of uploads) {
    const room = roomMap.get(u.room_id);
    const meta = metaMap.get(u.id);
    const catName = meta?.category || "Dokumentasi Umum";
    const key = `${room?.name || "Room"} — ${catName}`;
    const display = u.thumb_url || u.url;

    if (!group.has(key)) {
      group.set(key, {
        id: key,
        name: key,
        photos: display ? [display] : [],
        currentIndex: 0,
        cableM: undefined,
        serialNumber: null,
        measures: [meta?.measure_value ?? null],
      });
    } else {
      const curr = group.get(key)!;
      if (display) curr.photos.push(display);
      (curr.measures ||= []).push(meta?.measure_value ?? null);
    }
  }

  return [...group.values()].sort((a, b) => a.name.localeCompare(b.name, "id"));
}

/* =============== Page =============== */
export default function GenerateLaporanPage() {
  const searchParams = useSearchParams();

  // Form
  const [formData, setFormData] = useState<GenerateForm>({
    projectName: "",
    jobId: "",
  });

  // List
  const [projectGroups, setProjectGroups] = useState<ProjectGroup[]>([]);
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Preview
  const [reportPreview, setReportPreview] = useState<ReportPreview | null>(
    null
  );
  const previewRef = useRef<ReportPreview | null>(null);
  useEffect(() => {
    previewRef.current = reportPreview;
  }, [reportPreview]);

  const [isGenerating, setIsGenerating] = useState(false);
  const [currentGridPage, setCurrentGridPage] = useState(0);
  const [showPreview, setShowPreview] = useState(false);

  // Hover overlay
  const [hoverOverlay, setHoverOverlay] = useState<HoverOverlayState>({
    isOpen: false,
    categoryId: "",
    photoIndex: 0,
    isLoading: false,
    hasError: false,
  });
  const [hoverTimeout, setHoverTimeout] = useState<ReturnType<
    typeof setTimeout
  > | null>(null);

  const [isDownloading, setIsDownloading] = useState(false);

  /* ======== Ambil Project Group ======== */
  const fetchGroups = useCallback(async () => {
    setLoadingProjects(true);
    setErrorMsg(null);

    // coba tabel job_groups lebih dulu
    const tryGroups = await supabase
      .from("job_groups")
      .select("id,name")
      .order("name", { ascending: true });

    if (!tryGroups.error && (tryGroups.data?.length ?? 0) > 0) {
      setProjectGroups(tryGroups.data as ProjectGroup[]);
      setLoadingProjects(false);
      return;
    }

    // fallback: kumpulkan job_group_id dari projects
    const { data, error } = await supabase
      .from("projects")
      .select("job_group_id")
      .not("job_group_id", "is", null)
      .order("job_group_id", { ascending: true });

    if (error) {
      console.error(error);
      setErrorMsg("Gagal memuat daftar project group");
      setProjectGroups([]);
    } else {
      const uniq = Array.from(
        new Set((data ?? []).map((r: any) => String(r.job_group_id)))
      );
      setProjectGroups(uniq.map((id) => ({ id, name: id })));
    }
    setLoadingProjects(false);
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  /* ======== Ambil Jobs per group ======== */
  const fetchJobsByGroup = useCallback(async (groupId: string) => {
    setLoadingJobs(true);
    setErrorMsg(null);

    const { data, error } = await supabase
      .from("projects")
      .select(
        "id, job_id, job_group_id, name, lokasi, tanggal_mulai, closed_at, sigma_teknisi, sales_name, presales_name"
      )
      .eq("job_group_id", groupId)
      .order("job_id", { ascending: true });

    if (error) {
      console.error(error);
      setErrorMsg("Gagal memuat daftar pekerjaan");
      setJobs([]);
    } else {
      const rows: JobRow[] = (data || []).map((j: any) => ({
        id: String(j.job_id),
        job_id: j.job_id ?? null,
        name: j.name ?? null,
        project_id: String(j.id),
        lokasi: j.lokasi ?? null,
        tanggal_mulai: j.tanggal_mulai ?? null,
        closed_at: j.closed_at ?? null,
        sigma_teknisi: j.sigma_teknisi ?? null,
        sales_name: j.sales_name ?? null,
        presales_name: j.presales_name ?? null,
      }));
      setJobs(rows);
    }
    setLoadingJobs(false);
  }, []);

  useEffect(() => {
    if (formData.projectName) fetchJobsByGroup(formData.projectName);
    else setJobs([]);
  }, [formData.projectName, fetchJobsByGroup]);

  // auto-pilih group dari query ?project=
  useEffect(() => {
    const projectParam = searchParams.get("project");
    if (projectParam && !formData.projectName && projectGroups.length) {
      const decoded = decodeURIComponent(projectParam);
      const found = projectGroups.find(
        (p) => p.name === decoded || p.id === decoded
      );
      if (found)
        setFormData((prev) => ({ ...prev, projectName: found.id, jobId: "" }));
    }
  }, [searchParams, projectGroups.length, formData.projectName]);

  // Cleanup hover timeout
  useEffect(
    () => () => {
      if (hoverTimeout) clearTimeout(hoverTimeout);
    },
    [hoverTimeout]
  );

  /* ================= Form handlers ================= */
  const handleInputChange = (field: keyof GenerateForm, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "projectName") next.jobId = "";
      return next;
    });
  };

  const selectedProject = useMemo(
    () => projectGroups.find((p) => p.id === formData.projectName) || null,
    [projectGroups, formData.projectName]
  );

  const isFormValid = () => Boolean(formData.projectName && formData.jobId);

  /* ================= Builder ================= */
  const buildPreview = useCallback(
    async (jobId: string) => {
      const selectedJob = jobs.find((j) => j.id === jobId);
      if (!selectedJob) return;

      // SN by label (opsional)
      let serialNumbers: Record<string, string> = {};
      const snQuery = await supabase
        .from("job_serial_numbers")
        .select("label, value")
        .eq("job_id", jobId);
      if (!snQuery.error && snQuery.data) {
        serialNumbers = (snQuery.data || []).reduce(
          (acc: Record<string, string>, r: any) => {
            acc[String(r.label)] = String(r.value);
            return acc;
          },
          {}
        );
      }

      // SURVEY (pakai project_id)
      let categories: PhotoCategory[] = [];
      let serialsByName: Record<string, string> = {};
      try {
        categories = await loadSurveyCategories(selectedJob.project_id);
      } catch {
        // ignore
      }

      // Fallback ke API teknisi
      if (!categories.length) {
        try {
          const fromTech = await loadPhotosFromTechnicianApi(jobId);
          categories = fromTech.categories;
          serialsByName = fromTech.serialsByName;
        } catch {
          // ignore
        }
      }

      // merge meta supabase (hanya relevan untuk fallback teknisi)
      // catatan: SN & cable_meter per kategori akan ter-update realtime via subscribe.
      if (categories.length && !categories[0].name.includes(" — ")) {
        const { metersByCat, snByCat } = await fetchPhotoMeta(jobId);
        categories = categories.map((c) => ({
          ...c,
          cableM: metersByCat[c.id] != null ? metersByCat[c.id] : c.cableM,
          serialNumber: snByCat[c.id] ?? c.serialNumber ?? null,
        }));
      }

      const jobName = selectedJob?.name || selectedJob?.id || "";
      const location = selectedJob?.lokasi || "";
      const completedDate = fmtDate(selectedJob?.tanggal_mulai);
      const salesName = selectedJob?.sales_name ?? null;
      const presalesName = selectedJob?.presales_name ?? null;

      const nextPreview: ReportPreview = {
        jobName,
        technicianName:
          salesName ||
          presalesName ||
          (typeof selectedJob?.sigma_teknisi === "number"
            ? `Teknisi (${selectedJob?.sigma_teknisi})`
            : "Teknisi"),
        location,
        completedDate,
        photoCategories: categories,
        serialNumbers: { ...serialNumbers, ...serialsByName },
        notes:
          "Pekerjaan telah selesai dilakukan dengan baik. Semua perangkat berfungsi normal dan sudah terhubung ke sistem.",
        projectName: selectedProject?.name ?? undefined,
        salesName,
        presalesName,
      };

      const curr = previewRef.current;
      if (curr && JSON.stringify(curr) === JSON.stringify(nextPreview)) return;
      setReportPreview(nextPreview);
    },
    [jobs, selectedProject?.name]
  );

  /* ================= Generate Preview ================= */
  const handleGenerate = async () => {
    if (!isFormValid()) {
      alert("Mohon lengkapi semua field");
      return;
    }
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      await buildPreview(formData.jobId);
      setCurrentGridPage(0);
      setShowPreview(true);
    } catch (e: any) {
      console.error(e);
      setErrorMsg(e?.message || "Gagal menghasilkan preview laporan");
    } finally {
      setIsGenerating(false);
    }
  };

  /* ============== Realtime subscribe (ADMIN) ============== */
  useEffect(() => {
    if (!formData.jobId) return;

    const selectedJob = jobs.find((j) => j.id === formData.jobId);
    const projectId = selectedJob?.project_id;
    if (!projectId) return;

    let t: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (t) clearTimeout(t);
      // debounce ringan supaya tidak flood saat banyak event
      t = setTimeout(() => buildPreview(formData.jobId), 100);
    };

    const chUploads = supabase
      .channel(`rt-sru-${projectId}`)
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "survey_room_uploads",
          event: "*",
          filter: `project_id=eq.${projectId}`,
        },
        refresh
      )
      .subscribe();

    const chMeta = supabase
      .channel(`rt-sru-meta-${projectId}`)
      .on(
        "postgres_changes",
        { schema: "public", table: "survey_room_upload_meta", event: "*" },
        refresh
      )
      .subscribe();

    // ==== Fallback teknisi: update jika foto/utama/meta berubah ====
    const chPhotos = supabase
      .channel(`rt-job_photos-${formData.jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=eq.${formData.jobId}`,
        },
        refresh
      )
      .subscribe();

    // Histori foto per kategori (multi-foto): kalau ada foto baru/hapus
    const chPhotoEntries = supabase
      .channel(`rt-job_photo_entries-${formData.jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photo_entries",
          filter: `job_id=eq.${formData.jobId}`,
        },
        refresh
      )
      .subscribe();

    // Serial number per kategori (opsional tabel lama)
    const chSN = supabase
      .channel(`rt-job_sn-${formData.jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_serial_numbers",
          filter: `job_id=eq.${formData.jobId}`,
        },
        refresh
      )
      .subscribe();

    return () => {
      if (t) clearTimeout(t);
      supabase.removeChannel(chUploads);
      supabase.removeChannel(chMeta);
      supabase.removeChannel(chPhotos);
      supabase.removeChannel(chPhotoEntries);
      supabase.removeChannel(chSN);
    };
  }, [formData.jobId, jobs, buildPreview]);

  // (opsional) Otomatis buka preview saat job dipilih
  useEffect(() => {
    if (formData.jobId) {
      buildPreview(formData.jobId);
      setShowPreview(true);
    }
  }, [formData.jobId, buildPreview]);

  /* ================= Grid & Overlay ================= */
  const itemsPerPage = 20;
  const totalPages = reportPreview
    ? Math.ceil(reportPreview.photoCategories.length / itemsPerPage)
    : 0;

  const getCurrentPageItems = () => {
    if (!reportPreview) return [];
    const startIndex = currentGridPage * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return reportPreview.photoCategories.slice(startIndex, endIndex);
  };

  const getSerialNumberForCategory = (
    category: PhotoCategory,
    serialNumbers: { [key: string]: string }
  ) => {
    if (serialNumbers[category.name]) return serialNumbers[category.name];
    if (category.snKey && serialNumbers[category.snKey])
      return serialNumbers[category.snKey];
    const map: Record<string, string> = {
      "cctv-1": "Device 1",
      "cctv-2": "Device 2",
      "cctv-3": "Device 1",
      "cctv-4": "Device 2",
      "cctv-5": "Device 1",
      "dvr-nvr": "Main Unit",
      "network-switch": "Main Unit",
      "power-supply": "Device 2",
      "monitor-display": "Main Unit",
    };
    const key = map[category.id];
    return key ? serialNumbers[key] : undefined;
  };

  const handleGridNavigation = (dir: "prev" | "next") => {
    if (dir === "next" && currentGridPage < totalPages - 1) {
      setCurrentGridPage((p) => p + 1);
    } else if (dir === "prev" && currentGridPage > 0) {
      setCurrentGridPage((p) => p - 1);
    }
  };

  const [hoverOverlayState, setHoverOverlayState] = useState(0);

  const handleCarouselNavigation = (
    categoryId: string,
    direction: "prev" | "next"
  ) => {
    if (!reportPreview) return;
    setReportPreview((prev) => {
      if (!prev) return prev;
      const updated = prev.photoCategories.map((category) => {
        if (category.id === categoryId && category.photos.length > 0) {
          const maxIndex = category.photos.length - 1;
          let newIndex = category.currentIndex;
          newIndex =
            direction === "next"
              ? newIndex >= maxIndex
                ? 0
                : newIndex + 1
              : newIndex <= 0
              ? maxIndex
              : newIndex - 1;

          if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId) {
            setHoverOverlay((ov) => ({
              ...ov,
              photoIndex: newIndex,
              isLoading: true,
              hasError: false,
            }));
            setTimeout(
              () => setHoverOverlay((ov) => ({ ...ov, isLoading: false })),
              150
            );
            setHoverOverlayState((s) => s + 1);
          }
          return { ...category, currentIndex: newIndex };
        }
        return category;
      });
      return { ...prev, photoCategories: updated };
    });
  };

  const showHoverOverlay = (categoryId: string) => {
    const category = reportPreview?.photoCategories.find(
      (c) => c.id === categoryId
    );
    if (!category || category.photos.length === 0) return;
    setHoverOverlay({
      isOpen: true,
      categoryId,
      photoIndex: category.currentIndex,
      isLoading: true,
      hasError: false,
    });
    setTimeout(
      () => setHoverOverlay((prev) => ({ ...prev, isLoading: false })),
      200
    );
  };

  const hideHoverOverlay = () =>
    setHoverOverlay((prev) => ({ ...prev, isOpen: false }));

  const handleImageHoverEnter = (categoryId: string) => {
    if (hoverTimeout) clearTimeout(hoverTimeout);
    const timeout = setTimeout(() => showHoverOverlay(categoryId), 1000);
    setHoverTimeout(timeout);
  };
  const handleImageHoverLeave = () => {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      setHoverTimeout(null);
    }
  };

  const handleArrowClick = (
    e: React.MouseEvent,
    categoryId: string,
    direction: "prev" | "next"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    handleCarouselNavigation(categoryId, direction);
  };

  const handleImageClick = (categoryId: string) => {
    if (hoverOverlay.isOpen && hoverOverlay.categoryId === categoryId)
      hideHoverOverlay();
    else showHoverOverlay(categoryId);
  };

  const getCurrentOverlayPhoto = () => {
    const category = reportPreview?.photoCategories.find(
      (c) => c.id === hoverOverlay.categoryId
    );
    return category?.photos[hoverOverlay.photoIndex] || "";
  };

  const getCurrentOverlayCategory = () =>
    reportPreview?.photoCategories.find(
      (c) => c.id === hoverOverlay.categoryId
    );

  // Download (via endpoint docx/pdf kamu)
  const handleDownloadReport = async () => {
    if (!formData.jobId) {
      alert("Pilih Job dulu");
      return;
    }
    setIsDownloading(true);
    try {
      const res = await fetch(
        `/api/laporan/docx?jobId=${encodeURIComponent(formData.jobId)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || "Gagal generate DOCX");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Laporan_${formData.jobId}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      alert(e?.message || "Gagal mengunduh laporan");
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBackToForm = () => setShowPreview(false);

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-gray-50">
      {!showPreview ? (
        <AdminHeader
          title="Generate Laporan"
          showBackButton
          backUrl="/admin/dashboard"
        />
      ) : (
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => (window.location.href = "/admin/dashboard")}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-2xl font-bold text-gray-900">
                Generate Laporan
              </h1>
            </div>
            <Button
              onClick={handleBackToForm}
              variant="outline"
              className="flex items-center gap-2 bg-transparent"
            >
              <ArrowLeft className="h-4 w-4" /> Kembali ke Form
            </Button>
          </div>
        </div>
      )}

      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {!showPreview ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
              {/* Form */}
              <div className="lg:sticky lg:top-8">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-2xl flex items-center gap-3">
                      <FileText className="h-8 w-8 text-blue-600" />
                      Form Generate Laporan
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="space-y-3">
                      <Label htmlFor="project" className="text-lg font-medium">
                        Nama Project *
                      </Label>
                      <Select
                        value={formData.projectName}
                        onValueChange={(value) =>
                          handleInputChange("projectName", value)
                        }
                        disabled={loadingProjects}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue
                            placeholder={
                              loadingProjects
                                ? "Memuat daftar project..."
                                : "Pilih nama project"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {projectGroups.map((p) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              className="text-lg"
                            >
                              {p.name}
                            </SelectItem>
                          ))}
                          {!loadingProjects && projectGroups.length === 0 && (
                            <div className="px-3 py-2 text-sm text-gray-500">
                              Tidak ada project
                            </div>
                          )}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="job" className="text-lg font-medium">
                        ID Pekerjaan *
                      </Label>
                      <Select
                        value={formData.jobId}
                        onValueChange={(value) =>
                          handleInputChange("jobId", value)
                        }
                        disabled={!formData.projectName || loadingJobs}
                      >
                        <SelectTrigger className="text-lg py-3">
                          <SelectValue
                            placeholder={
                              !formData.projectName
                                ? "Pilih nama project terlebih dahulu"
                                : loadingJobs
                                ? "Memuat daftar pekerjaan..."
                                : jobs.length
                                ? "Pilih ID pekerjaan lebih dulu"
                                : "Belum ada pekerjaan untuk project ini"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {jobs.map((job) => (
                            <SelectItem
                              key={job.id}
                              value={job.id}
                              className="text-lg"
                            >
                              {job.id}
                            </SelectItem>
                          ))}
                          {!loadingJobs &&
                            formData.projectName &&
                            jobs.length === 0 && (
                              <div className="px-3 py-2 text-sm text-gray-500">
                                Tidak ada pekerjaan
                              </div>
                            )}
                        </SelectContent>
                      </Select>
                    </div>

                    {errorMsg && (
                      <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md p-3">
                        {errorMsg}
                      </div>
                    )}

                    <div className="pt-4">
                      <Button
                        onClick={handleGenerate}
                        disabled={!isFormValid() || isGenerating}
                        className="w-full bg-green-600 hover:bg-green-700 text-lg py-4 disabled:opacity-50"
                      >
                        {isGenerating ? (
                          <div className="flex items-center gap-2">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                            Generating...
                          </div>
                        ) : (
                          <>
                            <FileText className="h-5 w-5 mr-2" />
                            Generate Laporan
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Placeholder Preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    <Eye className="h-8 w-8 text-green-600" />
                    Preview Laporan
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-center h-96 text-gray-500">
                    <div className="text-center">
                      <FileText className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">
                        Pilih data dan klik Generate untuk melihat preview
                        laporan
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            /* ================= PREVIEW ================= */
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-4 gap-8">
                <div className="xl:col-span-1">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">
                        Detail Pekerjaan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <h4 className="font-bold text-lg text-gray-900 mb-1">
                          {reportPreview?.jobName}
                        </h4>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Teknisi
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          {reportPreview?.technicianName}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Tanggal
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <Calendar className="h-4 w-4 mr-2" />
                          {reportPreview?.completedDate}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Lokasi
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <MapPin className="h-4 w-4 mr-2" />
                          {reportPreview?.location}
                        </div>
                      </div>

                      <div>
                        <h5 className="font-semibold text-gray-900 mb-2">
                          Sales
                        </h5>
                        <div className="flex items-center text-sm text-gray-600">
                          <User className="h-4 w-4 mr-2" />
                          {reportPreview?.salesName
                            ? truncateText(reportPreview.salesName, 25)
                            : "-"}
                        </div>
                      </div>

                      {reportPreview?.presalesName ? (
                        <div>
                          <h5 className="font-semibold text-gray-900 mb-2">
                            Presales
                          </h5>
                          <div className="flex items-center text-sm text-gray-600">
                            <User className="h-4 w-4 mr-2" />
                            {truncateText(reportPreview.presalesName, 25)}
                          </div>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </div>

                <div className="xl:col-span-3">
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl flex items-center gap-3">
                          <Camera className="h-6 w-6 text-green-600" />
                          Dokumentasi Foto
                        </CardTitle>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600">
                            {currentGridPage + 1}/{totalPages || 1}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGridNavigation("prev")}
                              disabled={currentGridPage === 0}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleGridNavigation("next")}
                              disabled={currentGridPage >= totalPages - 1}
                              className="h-8 w-8 p-0"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="isolate grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                        {getCurrentPageItems().map((category) => {
                          const serialNumber =
                            category.serialNumber ??
                            (reportPreview
                              ? getSerialNumberForCategory(
                                  category,
                                  reportPreview.serialNumbers
                                )
                              : undefined);
                          const activeM = getActiveMeasure(category);

                          return (
                            <div
                              key={category.id}
                              className="relative border rounded-lg overflow-hidden bg-white shadow-sm"
                            >
                              <div className="relative h-32 bg-gray-100 overflow-hidden">
                                {category.photos.length > 0 ? (
                                  <>
                                    <div
                                      className="absolute inset-0 cursor-pointer hover-zone"
                                      onMouseEnter={() =>
                                        handleImageHoverEnter(category.id)
                                      }
                                      onMouseLeave={handleImageHoverLeave}
                                      onClick={() =>
                                        handleImageClick(category.id)
                                      }
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleImageClick(category.id);
                                        }
                                      }}
                                      tabIndex={0}
                                      role="button"
                                      aria-label={`View ${category.name} photos`}
                                    >
                                      <img
                                        src={
                                          category.photos[
                                            category.currentIndex
                                          ] || "/placeholder.svg"
                                        }
                                        alt={`${category.name} ${
                                          category.currentIndex + 1
                                        }`}
                                        className="w-full h-full object-cover transition-opacity hover:opacity-90"
                                        loading="lazy"
                                        decoding="async"
                                      />
                                    </div>

                                    {category.photos.length > 1 && (
                                      <>
                                        <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) =>
                                              handleArrowClick(
                                                e,
                                                category.id,
                                                "prev"
                                              )
                                            }
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full"
                                          >
                                            <ChevronLeft className="h-4 w-4" />
                                          </Button>
                                        </div>

                                        <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center z-10">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) =>
                                              handleArrowClick(
                                                e,
                                                category.id,
                                                "next"
                                              )
                                            }
                                            className="h-7 w-7 p-0 bg-black/30 hover:bg-black/50 text-white rounded-full"
                                          >
                                            <ChevronRight className="h-4 w-4" />
                                          </Button>
                                        </div>
                                      </>
                                    )}

                                    {category.photos.length > 1 && (
                                      <div className="absolute bottom-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded pointer-events-none z-5">
                                        {category.currentIndex + 1}/
                                        {category.photos.length}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                                    Tidak ada foto
                                  </div>
                                )}
                              </div>

                              {/* LABEL bawah kartu */}
                              <div className="p-2 min-h-[2.5rem] flex items-center justify-between border-t">
                                <p className="text-[10px] font-medium text-gray-700 leading-tight flex-1">
                                  {category.name}
                                </p>

                                {typeof activeM === "number" ? (
                                  <div className="ml-2 flex items-center">
                                    <span
                                      className="text-[9px] text-green-700 font-mono bg-green-50 px-1 py-0.5 rounded"
                                      title={`Panjang: ${formatMeter(activeM)}`}
                                    >
                                      L: {formatMeter(activeM)}
                                    </span>
                                  </div>
                                ) : serialNumber ? (
                                  <div className="ml-2 flex items-center">
                                    <span
                                      className="text-[9px] text-gray-500 font-mono bg-gray-100 px-1 py-0.5 rounded cursor-help"
                                      title={`Serial Number: ${serialNumber}`}
                                    >
                                      SN:{" "}
                                      {truncateSerialNumber(serialNumber, 8)}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="ml-2 flex items-center">
                                    <span className="text-[9px] text-gray-400 bg-gray-50 px-1 py-0.5 rounded">
                                      SN: -
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="sticky bottom-0 z-30 bg-white border-t p-4 shadow-lg">
                <div className="max-w-7xl mx-auto">
                  <Button
                    onClick={handleDownloadReport}
                    disabled={isDownloading || !formData.jobId}
                    aria-busy={isDownloading}
                    className={`relative w-full text-lg py-3 overflow-hidden
                      ${isDownloading ? "cursor-wait" : ""}
                      bg-blue-600 hover:bg-blue-700 disabled:opacity-60`}
                  >
                    {isDownloading && <span className="shimmer" aria-hidden />}

                    <span className="relative z-[1] flex items-center justify-center gap-2">
                      {isDownloading ? (
                        <>
                          <span className="spinner" />
                          <span>Menyiapkan &amp; Mengunduh…</span>
                        </>
                      ) : (
                        <>
                          <Download className="h-5 w-5" />
                          <span>Finalisasi &amp; Download Laporan PDF</span>
                        </>
                      )}
                    </span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Hover Overlay */}
      {hoverOverlay.isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 flex items-center justify-center"
          onClick={hideHoverOverlay}
        >
          <div className="relative max-w-4xl max-h-[80vh] p-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={hideHoverOverlay}
              className="absolute top-2 right-2 z-10 h-8 w-8 p-0 bg-black/50 hover:bg-black/70 text-white rounded-full"
            >
              <X className="h-4 w-4" />
            </Button>

            <div className="relative bg-white rounded-lg overflow-hidden shadow-2xl">
              <img
                src={getCurrentOverlayPhoto() || "/placeholder.svg"}
                alt={`${getCurrentOverlayCategory()?.name} ${
                  hoverOverlay.photoIndex + 1
                }`}
                className="max-w-full max-h-[70vh] object-contain"
                onError={() =>
                  setHoverOverlay((prev) => ({
                    ...prev,
                    hasError: true,
                    isLoading: false,
                  }))
                }
                loading="lazy"
                decoding="async"
              />
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                <p className="text-white text-sm font-medium">
                  {getCurrentOverlayCategory()?.name} —{" "}
                  {hoverOverlay.photoIndex + 1}/
                  {getCurrentOverlayCategory()?.photos.length || 0}
                  {(() => {
                    const cat = getCurrentOverlayCategory();
                    const activeM = getActiveMeasure(cat as PhotoCategory);
                    return typeof activeM === "number"
                      ? ` • Panjang: ${formatMeter(activeM)}`
                      : "";
                  })()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS animasi tombol */}
      <style jsx>{`
        .shimmer {
          position: absolute;
          inset: 0;
          background: linear-gradient(
            110deg,
            transparent 0%,
            rgba(255, 255, 255, 0.35) 40%,
            transparent 80%
          );
          transform: translateX(-100%);
          animation: shimmer 1.25s linear infinite;
        }
        @keyframes shimmer {
          to {
            transform: translateX(100%);
          }
        }
        .spinner {
          width: 1rem;
          height: 1rem;
          border-radius: 9999px;
          border: 2px solid rgba(255, 255, 255, 0.5);
          border-top-color: #fff;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
}
