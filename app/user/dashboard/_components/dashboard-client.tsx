// app/user/dashboard/DashboardClient.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { TechnicianHeader } from "@/components/technician-header";
import { Pagination } from "@/components/pagination";
import { Star } from "lucide-react";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { createClient } from "@supabase/supabase-js";
import { ensurePushSubscription } from "@/lib/pushClient";

/** ===================== Types ===================== **/
type Job = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: "not-started" | "in-progress" | "completed";
  progress?: number | null;
  isPending?: boolean;
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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** ===================== Utils ===================== **/
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 250) {
  let t: any;
  return (...args: Parameters<T>) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function toNum(v: any): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// Tunggu sesi Supabase siap (hindari unauthorized balapan)
async function waitForSession(timeoutMs = 6000) {
  const t0 = Date.now();
  // Cek cepat sekali
  {
    const { data } = await supabase.auth.getSession();
    if (data?.session?.access_token) return true;
  }

  // Dengarkan perubahan auth + polling ringan
  return new Promise<boolean>((resolve) => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) {
        sub.subscription.unsubscribe();
        resolve(true);
      }
    });
    const iv = setInterval(async () => {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        clearInterval(iv);
        sub.subscription.unsubscribe();
        resolve(true);
      } else if (Date.now() - t0 > timeoutMs) {
        clearInterval(iv);
        sub.subscription.unsubscribe();
        resolve(false);
      }
    }, 250);
  });
}

/** ===================== Page ===================== **/
export default function TechnicianDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const jobsPerPage = 4;

  const [filterType, setFilterType] = useState<"all" | "survey" | "instalasi">(
    "all"
  );

  const baseChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const projectsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const photosChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );
  const surveyRoomsChannelRef = useRef<
    ReturnType<typeof supabase.channel> | null
  >(null);

  const completedPostedRef = useRef<Set<string>>(new Set());

  /** ==== Progress helper ==== */
  async function getJobProgress(jobId: string): Promise<{
    percent: number;
    isPending: boolean;
    done?: number;
    total?: number;
  }> {
    try {
      const res = await fetch(`/api/job-photos/${encodeURIComponent(jobId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "progress fetch failed");

      const percent = toNum(json?.progress?.percent) ?? 0;
      const isPending = String(json?.status || "") === "pending";
      const done =
        toNum(json?.progress?.done) ??
        toNum(json?.progress?.complete) ??
        toNum(json?.uploaded);
      const total = toNum(json?.progress?.total) ?? toNum(json?.total);

      return { percent, isPending, done, total };
    } catch {
      return { percent: 0, isPending: false };
    }
  }

  async function attachProgress(items: Job[]): Promise<Job[]> {
    return Promise.all(
      items.map(async (j) => {
        const { percent, isPending, done, total } = await getJobProgress(
          j.job_id
        );
        const status: Job["status"] =
          percent >= 100
            ? "completed"
            : percent > 0
            ? "in-progress"
            : "not-started";

        return {
          ...j,
          progress: percent,
          isPending,
          status: isPending ? "in-progress" : status,
          progressDone: typeof done === "number" ? done : null,
          progressTotal: typeof total === "number" ? total : null,
        };
      })
    );
  }

  /** ==== Tandai project selesai ==== */
  async function markProjectCompleted(projectId: string) {
    try {
      await fetch("/api/projects/status", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ projectId, status: "completed" }),
      });
    } catch (e) {
      completedPostedRef.current.delete(projectId);
      console.error("markProjectCompleted failed:", e);
    }
  }

  /** ==== Loader utama ==== */
  const loadJobs = async () => {
    try {
      setLoading(true);
      setErr(null);

      let res = await fetch(`/api/technicians/jobs`, {
        cache: "no-store",
        credentials: "include",
      });

      // Retry sekali jika unauthorized (sesi baru siap)
      if (res.status === 401 || res.status === 403) {
        await waitForSession(2000);
        res = await fetch(`/api/technicians/jobs`, {
          cache: "no-store",
          credentials: "include",
        });
      }

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Gagal memuat pekerjaan");

      const withProgress = await attachProgress(json.items ?? []);
      setJobs(withProgress);

      const candidates = withProgress.filter(
        (j) => (j.progress ?? 0) >= 100 && !j.isPending
      );
      for (const j of candidates) {
        if (!completedPostedRef.current.has(j.id)) {
          completedPostedRef.current.add(j.id);
          markProjectCompleted(j.id);
        }
      }

      const projectIds = (json.items ?? []).map((j: Job) => j.id);
      const jobIds = (json.items ?? []).map((j: Job) => j.job_id);
      resubscribeProjects(projectIds);
      resubscribePhotos(jobIds);
      resubscribeSurveyRooms(projectIds);
    } catch (e: any) {
      setErr(e.message || "Gagal memuat pekerjaan");
      setJobs([]);
    } finally {
      setLoading(false);
    }
  };

  /** ==== Realtime Global ==== */
  useEffect(() => {
    const debouncedReload = debounce(loadJobs, 200);

    const ch = supabase
      .channel("tech-dashboard-base")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_assignments" },
        debouncedReload
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        debouncedReload
      )
      .subscribe();

    baseChannelRef.current = ch;

    return () => {
      if (baseChannelRef.current)
        supabase.removeChannel(baseChannelRef.current);
      baseChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** ==== Re-subscribe per daftar aktif ==== */
  function resubscribeProjects(projectIds: string[]) {
    if (projectsChannelRef.current) {
      supabase.removeChannel(projectsChannelRef.current);
      projectsChannelRef.current = null;
    }
    if (!projectIds.length) return;

    const isUuid = /^[0-9a-f-]{36}$/i.test(projectIds[0]);
    const inList = isUuid
      ? projectIds.map((x) => `"${x}"`).join(",")
      : projectIds.join(",");

    const ch = supabase
      .channel(`tech-dashboard-projects`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "projects",
          filter: `id=in.(${inList})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();

    projectsChannelRef.current = ch;
  }

  function resubscribePhotos(jobIds: string[]) {
    if (photosChannelRef.current) {
      supabase.removeChannel(photosChannelRef.current);
      photosChannelRef.current = null;
    }
    if (!jobIds.length) return;

    const q = jobIds.map((v) => `"${v.replace(/"/g, '\\"')}"`).join(",");

    const ch = supabase
      .channel(`tech-dashboard-photos`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_photos",
          filter: `job_id=in.(${q})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();

    photosChannelRef.current = ch;
  }

  function resubscribeSurveyRooms(projectIds: string[]) {
    if (surveyRoomsChannelRef.current) {
      supabase.removeChannel(surveyRoomsChannelRef.current);
      surveyRoomsChannelRef.current = null;
    }
    if (!projectIds.length) return;
    const inList = projectIds.map((x) => `"${x}"`).join(",");

    const ch = supabase
      .channel("tech-dashboard-surveyrooms")
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "project_survey_rooms",
          event: "*",
          filter: `project_id=in.(${inList})`,
        },
        debounce(loadJobs, 150)
      )
      .subscribe();

    surveyRoomsChannelRef.current = ch;
  }

  /** ==== Filter + Paging ==== */
  const filteredJobs = useMemo(() => {
    if (filterType === "all") return jobs;
    return jobs.filter((j) => (j.type ?? "instalasi") === filterType);
  }, [jobs, filterType]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredJobs.length / jobsPerPage)),
    [filteredJobs.length]
  );
  const startIndex = (currentPage - 1) * jobsPerPage;
  const currentJobs = filteredJobs.slice(startIndex, startIndex + jobsPerPage);

  /** ==== Navigasi card ==== */
  const handleJobClick = (job: Job) => {
    if (job.type === "survey") {
      router.push(`/user/survey/floors?jobId=${encodeURIComponent(job.id)}`);
    } else {
      router.push(`/user/upload_foto?job=${encodeURIComponent(job.job_id)}`);
    }
  };

  const handlePrevPage = () => setCurrentPage((p) => Math.max(1, p - 1));
  const handleNextPage = () =>
    setCurrentPage((p) => Math.min(totalPages, p + 1));

  /** ==== Cleanup ==== */
  useEffect(() => {
    return () => {
      if (projectsChannelRef.current)
        supabase.removeChannel(projectsChannelRef.current);
      if (photosChannelRef.current)
        supabase.removeChannel(photosChannelRef.current);
      if (surveyRoomsChannelRef.current)
        supabase.removeChannel(surveyRoomsChannelRef.current);
    };
  }, []);

  /** ==== Orkestrasi: 1) sesi → 2) loadJobs → 3) push notif ==== */
  const pushSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    return (
      "serviceWorker" in navigator &&
      "Notification" in window &&
      "PushManager" in (window as any)
    );
  }, []);

  const initializedRef = useRef(false);
  const pushInitRanRef = useRef(false);

  async function initPushIfNeeded() {
    if (!pushSupported) return;
    if (pushInitRanRef.current) return;

    const ASK_KEY = "notif_auto_asked_v1";
    if (sessionStorage.getItem(ASK_KEY) === "yes") {
      pushInitRanRef.current = true;
      return;
    }

    try {
      const reg = await navigator.serviceWorker.ready;
      const currentSub = await reg.pushManager.getSubscription();
      const perm = Notification.permission; // 'default' | 'granted' | 'denied'
      if (perm === "default" || (perm === "granted" && !currentSub)) {
        const { data } = await supabase.auth.getUser();
        const email = (data?.user?.email || "").trim();
        if (!email) return;

        sessionStorage.setItem(ASK_KEY, "yes");
        pushInitRanRef.current = true;
        await ensurePushSubscription({
          subscribeEndpoint: "/api/push/subscribe",
          getEmail: () => email,
        });
      }
    } catch {
      // diamkan
    }
  }

  // Mount pertama: tunggu sesi → loadJobs → baru init push
  useEffect(() => {
    (async () => {
      await waitForSession(6000);
      await loadJobs();
      initializedRef.current = true;
      await initPushIfNeeded();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kalau searchParams berubah setelah init, cukup reload jobs tanpa memicu prompt lagi
  useEffect(() => {
    if (!initializedRef.current) return;
    loadJobs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  /** ===================== Render ===================== **/
  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Reaport"
        showFilter
        filterValue={filterType}
        onFilterChange={(v) => {
          setFilterType(v);
          setCurrentPage(1);
        }}
      />

      <main className="p-4">
        <div className="max-w-md mx-auto">
          {loading ? (
            <div className="text-center text-sm text-gray-600">Memuat...</div>
          ) : err ? (
            <div className="text-center text-sm text-red-600">{err}</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center text-sm text-gray-600">
              Tidak ada tugas untuk filter ini.
            </div>
          ) : (
            <>
              <div className="space-y-1 mb-6">
                {currentJobs.map((job) => {
                  const hasCount =
                    typeof job.progressDone === "number" &&
                    typeof job.progressTotal === "number";
                  const badge =
                    job.isPending
                      ? {
                          text: "Pending",
                          color: "bg-amber-100 text-amber-700",
                          countText: hasCount
                            ? `${job.progressDone}/${job.progressTotal}`
                            : null,
                        }
                      : (job.progress ?? 0) >= 100
                      ? {
                          text: "Selesai",
                          color: "bg-green-100 text-green-700",
                          countText: hasCount
                            ? `${job.progressDone}/${job.progressTotal}`
                            : null,
                        }
                      : {
                          text: `${Math.max(
                            0,
                            Math.min(100, Math.round(job.progress ?? 0))
                          )}%`,
                          color: "bg-blue-100 text-blue-700",
                          countText: hasCount
                            ? `${job.progressDone}/${job.progressTotal}`
                            : null,
                        };

                  const bg =
                    job.isPending
                      ? "bg-amber-50 border-amber-200"
                      : (job.progress ?? 0) >= 100
                      ? "bg-green-50 border-green-200"
                      : (job.progress ?? 0) > 0
                      ? "bg-blue-50 border-blue-200"
                      : "bg-gray-50 border-gray-200";

                  const vehicleList: string[] = (
                    job.vehicle_names?.length
                      ? job.vehicle_names
                      : job.vehicle_name
                      ? [job.vehicle_name]
                      : []
                  ) as string[];

                  return (
                    <Card
                      key={job.id}
                      className={`cursor-pointer transition-all hover:shadow-md ${bg}`}
                      onClick={() => handleJobClick(job)}
                    >
                      <CardContent className="px-2 py-1">
                        <div className="flex justify-between items-start mb-1">
                          <div className="flex-1 pr-2">
                            <h3 className="font-bold text-sm text-gray-900 mb-0.5 leading-tight">
                              {job.name}
                            </h3>

                            {job.type === "survey" && job.building_name ? (
                              <p className="text-xs font-medium text-gray-700 leading-tight mb-0.5">
                                Nama Gedung: {job.building_name}
                              </p>
                            ) : null}

                            <p className="text-xs text-gray-600 leading-tight mb-0.5">
                              {job.lokasi ?? "-"}
                            </p>

                            <div className="text-xs text-gray-600 mb-0.5">
                              <span className="font-medium">
                                Ditugaskan bersama:
                              </span>
                              <div className="mt-0.5">
                                {job.assignedTechnicians.map((tech, idx) => (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-1"
                                  >
                                    <span>- {tech.name}</span>
                                    {tech.isLeader && (
                                      <Star className="h-2.5 w-2.5 text-red-500 fill-red-500" />
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-0.5">
                            {/* Badge persentase + Rasio 1/50 */}
                            <div className="flex items-center gap-1">
                              <div
                                className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}
                                title={
                                  badge.countText
                                    ? `Progress ${badge.countText}`
                                    : undefined
                                }
                              >
                                {badge.text}
                              </div>

                              {badge.countText && (
                                <div
                                  className={`px-2 py-1 rounded-full text-xs font-medium whitespace-nowrap ${badge.color}`}
                                  aria-label="rasio progress"
                                  title={`Progress ${badge.countText}`}
                                >
                                  {badge.countText}
                                </div>
                              )}
                            </div>

                            <div className="text-[10px] text-gray-500 font-mono leading-none">
                              {job.job_id}
                            </div>

                            {(job.supervisor_name || job.sales_name) && (
                              <div className="text-[10px] text-gray-600 leading-tight text-right mt-0.5">
                                <div>
                                  SPV: <b>{job.supervisor_name ?? "-"}</b>
                                </div>
                                <div>
                                  Sales: <b>{job.sales_name ?? "-"}</b>
                                </div>
                              </div>
                            )}

                            {/* Kendaraan */}
                            <div className="text-[10px] text-gray-600 leading-tight text-right mt-0.5">
                              {vehicleList.length === 0 ? (
                                <div>Kendaraan : -</div>
                              ) : vehicleList.length === 1 ? (
                                <div>
                                  Kendaraan : -{" "}
                                  <b className="whitespace-nowrap">
                                    {vehicleList[0]}
                                  </b>
                                </div>
                              ) : (
                                <div className="text-right">
                                  <div>Kendaraan :</div>
                                  <div className="mt-0.5 space-y-0.5">
                                    {vehicleList.map((v, idx) => (
                                      <div
                                        key={idx}
                                        className="flex items-center gap-1 justify-end"
                                      >
                                        <span>-</span>
                                        <b className="whitespace-nowrap">{v}</b>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {totalPages > 1 && (
                <Pagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPrevPage={handlePrevPage}
                  onNextPage={handleNextPage}
                />
              )}
            </>
          )}
        </div>
      </main>

      <PWAInstallPrompt />
    </div>
  );
}
