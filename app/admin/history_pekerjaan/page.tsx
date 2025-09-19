"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AdminHeader } from "@/components/admin-header";
import {
  Search,
  History,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  Users,
  Crown,
} from "lucide-react";

/* ================= Types from /api/projects ================= */
type ProgressStatus = "ongoing" | "completed" | "overdue";
type ProjectStatus =
  | "unassigned"
  | "ongoing"
  | "pending"
  | "awaiting_bast"
  | "completed";

type ApiProject = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: ProgressStatus;
  project_status: ProjectStatus;
  pending_reason?: string | null;
  sigma_hari: number;
  sigma_teknisi: number;
  sigma_man_days: number;
  jam_datang: string | null;
  jam_pulang: string | null;
  days_elapsed: number;
  created_at: string;
  actual_man_days: number;
  completed_date?: string | null;
};

/* ================ Types from /api/assignments ================= */
type ShapedAssignment = {
  projectId: string;
  technicianCode: string;
  technicianName: string;
  initial: string;
  isProjectLeader: boolean;
  isSelected: boolean;
};

/* =============== Helpers: WIB-safe date handling =============== */
// Hari ini versi WIB → "YYYY-MM-DD"
const todayWIB = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// Tampilkan "DD-MM-YYYY"
const fmtID = (iso?: string | null) =>
  iso ? iso.split("-").reverse().join("-") : "-";

// Tambah/hapus hari aman UTC untuk string "YYYY-MM-DD"
const addDaysUTC = (iso: string, days: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
};

export default function JobHistory() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  const [currentDate, setCurrentDate] = useState<string>(todayWIB());
  const [projects, setProjects] = useState<ApiProject[]>([]);
  const [assignments, setAssignments] = useState<ShapedAssignment[]>([]);
  const [loading, setLoading] = useState(false);
  const [assignLoading, setAssignLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assignError, setAssignError] = useState<string | null>(null);

  /* ===== Fetch projects ===== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/projects?date=${currentDate}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Gagal memuat data (${res.status})`);
        const json = await res.json();
        const rows: ApiProject[] = json?.data ?? json ?? [];
        if (!cancelled) setProjects(rows);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Terjadi kesalahan");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  /* ===== Fetch assignments (technicians) for the same date ===== */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setAssignLoading(true);
      setAssignError(null);
      try {
        const res = await fetch(`/api/assignments?date=${currentDate}`, {
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`Gagal memuat teknisi (${res.status})`);
        const json = await res.json();
        const rows: ShapedAssignment[] = json?.data ?? [];
        if (!cancelled) setAssignments(rows);
      } catch (e: any) {
        if (!cancelled) setAssignError(e?.message || "Gagal memuat teknisi");
      } finally {
        if (!cancelled) setAssignLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [currentDate]);

  /* ===== Index assignments by project ===== */
  const techByProject = useMemo(() => {
    const map = new Map<string, ShapedAssignment[]>();
    for (const a of assignments) {
      const arr = map.get(a.projectId) ?? [];
      arr.push(a);
      map.set(a.projectId, arr);
    }
    // urutkan: leader dulu, lalu alfabet nama
    for (const [k, arr] of map.entries()) {
      arr.sort((x, y) => {
        if (x.isProjectLeader && !y.isProjectLeader) return -1;
        if (!x.isProjectLeader && y.isProjectLeader) return 1;
        return x.technicianName.localeCompare(y.technicianName, "id", {
          sensitivity: "base",
        });
      });
      map.set(k, arr);
    }
    return map;
  }, [assignments]);

  /* ===== UI mapping (search + filter) ===== */
  const normalized = useMemo(() => {
    return projects.map((p) => {
      const displayStatus: "completed" | "in-progress" | "pending" =
        p.project_status === "pending"
          ? "pending"
          : p.status === "completed"
          ? "completed"
          : "in-progress";

      const completedDate =
        p.completed_date ??
        (displayStatus === "completed" ? currentDate : null);

      const techs = techByProject.get(p.id) ?? [];

      return {
        id: p.id,
        jobId: p.job_id,
        jobName: p.name,
        location: p.lokasi ?? "-",
        statusDisplay: displayStatus,
        completedDate,
        technicians: techs,
      };
    });
  }, [projects, techByProject, currentDate]);

  const filtered = useMemo(() => {
    const bySearch = normalized.filter((job) => {
      const q = searchTerm.toLowerCase();
      return (
        job.jobId.toLowerCase().includes(q) ||
        job.jobName.toLowerCase().includes(q) ||
        job.location.toLowerCase().includes(q)
      );
    });
    const byStatus =
      statusFilter === "all"
        ? bySearch
        : bySearch.filter((j) => j.statusDisplay === statusFilter);
    return byStatus;
  }, [normalized, searchTerm, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const startIndex = (currentPage - 1) * itemsPerPage;
  const pageRows = filtered.slice(startIndex, startIndex + itemsPerPage);

  useEffect(() => {
    setCurrentPage(1); // reset ke halaman 1 saat filter/search/tanggal berubah
  }, [searchTerm, statusFilter, currentDate]);

  const getStatusBadge = (status: "completed" | "in-progress" | "pending") => {
    switch (status) {
      case "completed":
        return (
          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Selesai
          </Badge>
        );
      case "in-progress":
        return (
          <Badge className="bg-yellow-100 text-yellow-700 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Ditugaskan
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
    }
  };

  const countBy = (want: "all" | "completed" | "in-progress" | "pending") => {
    if (want === "all") return normalized.length;
    return normalized.filter((j) => j.statusDisplay === want).length;
  };

  const today = todayWIB();

  const goPrevDay = () => {
    setCurrentDate((d) => addDaysUTC(d, -1));
  };

  const goNextDay = () => {
    if (currentDate >= today) return; // cegah lewat hari ini (WIB)
    setCurrentDate((d) => addDaysUTC(d, 1));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader
        title="Riwayat Pekerjaan"
        showBackButton={true}
        backUrl="/admin/dashboard"
      />

      <main className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Top bar: date navigator */}
          <div className="mb-6 flex items-center justify-between">
            {loading ? (
              <span className="text-sm text-gray-500">Memuat data…</span>
            ) : error ? (
              <span className="text-sm text-red-600">{error}</span>
            ) : (
              <span className="text-sm text-gray-600">
                {normalized.length} pekerjaan ({fmtID(currentDate)})
              </span>
            )}

            <div className="flex items-center gap-2 bg-white border rounded-lg px-3 py-2 shadow-sm">
              <Button
                variant="ghost"
                size="icon"
                onClick={goPrevDay}
                className="h-8 w-8 p-0 hover:bg-gray-100"
                title="Hari sebelumnya"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>

              <div className="flex items-center gap-2 px-1">
                <Calendar className="h-4 w-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-700 min-w-[96px] text-center">
                  {fmtID(currentDate)}
                </span>
              </div>

              <Button
                variant="ghost"
                size="icon"
                onClick={goNextDay}
                disabled={currentDate >= today}
                className="h-8 w-8 p-0 hover:bg-gray-100 disabled:opacity-30"
                title={
                  currentDate >= today
                    ? "Tidak bisa melebihi hari ini"
                    : "Hari berikutnya"
                }
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <History className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">
                      Total Pekerjaan
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {countBy("all")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-green-100 rounded-full">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Selesai</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {countBy("completed")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-3 bg-yellow-100 rounded-full">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">
                      Ditugaskan
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {countBy("in-progress")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters & Search */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
            <div className="flex items-center gap-4 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
                <Input
                  placeholder="Cari pekerjaan..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 text-base py-3"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 text-base py-3">
                  <SelectValue placeholder="Filter status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-base">
                    Semua Status
                  </SelectItem>
                  <SelectItem value="completed" className="text-base">
                    Selesai
                  </SelectItem>
                  <SelectItem value="in-progress" className="text-base">
                    Ditugaskan
                  </SelectItem>
                  <SelectItem value="pending" className="text-base">
                    Pending
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Jobs Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-2xl">
                Daftar Riwayat Pekerjaan
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        ID Pekerjaan
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Nama Pekerjaan
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        <div className="inline-flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Teknisi
                        </div>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Status
                      </th>
                      <th className="text-left py-3 px-4 font-semibold text-gray-700">
                        Tanggal Selesai
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-10 text-center text-sm text-gray-500"
                        >
                          Memuat data…
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-10 text-center text-sm text-red-600"
                        >
                          {error}
                        </td>
                      </tr>
                    ) : pageRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          className="py-10 text-center text-sm text-gray-500"
                        >
                          Tidak ada pekerjaan untuk kriteria ini.
                        </td>
                      </tr>
                    ) : (
                      pageRows.map((job) => (
                        <tr
                          key={job.id}
                          className="border-b border-gray-100 hover:bg-gray-50"
                        >
                          <td className="py-4 px-4">
                            <div className="font-medium text-gray-900">
                              {job.jobId}
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            <div className="font-medium text-gray-900">
                              {job.jobName}
                            </div>
                            <div className="text-sm text-gray-500">
                              {job.location}
                            </div>
                          </td>

                          <td className="py-4 px-4">
                            {assignLoading && !job.technicians.length ? (
                              <span className="text-sm text-gray-400">
                                memuat…
                              </span>
                            ) : job.technicians.length === 0 ? (
                              <span className="text-sm text-gray-500">—</span>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                {job.technicians.map((t, idx) => (
                                  <Badge
                                    key={`${t.technicianName}-${idx}`}
                                    variant="outline"
                                    className={
                                      "px-2 py-1 text-xs border " +
                                      (t.isProjectLeader
                                        ? "border-purple-600 text-purple-700"
                                        : "border-gray-300 text-gray-700")
                                    }
                                    title={t.technicianName}
                                  >
                                    {t.isProjectLeader && (
                                      <Crown className="h-3 w-3 mr-1" />
                                    )}
                                    {t.technicianName}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {assignError && (
                              <div className="text-[11px] text-red-600 mt-1">
                                {assignError}
                              </div>
                            )}
                          </td>

                          <td className="py-4 px-4">
                            {getStatusBadge(job.statusDisplay)}
                          </td>

                          <td className="py-4 px-4 text-gray-700">
                            {job.completedDate ? fmtID(job.completedDate) : "-"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {!loading && !error && filtered.length > 0 && (
                <div className="flex items-center justify-between mt-6">
                  <div className="text-sm text-gray-700">
                    Menampilkan {startIndex + 1}–
                    {Math.min(startIndex + itemsPerPage, filtered.length)} dari{" "}
                    {filtered.length} pekerjaan
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-2"
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Sebelumnya
                    </Button>
                    <span className="text-sm font-medium px-2">
                      {currentPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      onClick={() =>
                        setCurrentPage((p) => Math.min(p + 1, totalPages))
                      }
                      disabled={currentPage === totalPages}
                      className="px-3 py-2"
                    >
                      Selanjutnya
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
