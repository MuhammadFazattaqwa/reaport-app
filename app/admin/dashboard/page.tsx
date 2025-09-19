// app/admin/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AdminHeader } from "@/components/admin-header";
import {
  FileText,
  CheckCircle,
  Clock,
  Users,
  CalendarCheck,
  History,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

type Stats = {
  completedCount: number;
  ongoingCount: number;
  reportsCount: number;
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AdminDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({
    completedCount: 0,
    ongoingCount: 0,
    reportsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const handleNavigation = (path: string) => router.push(path);

  async function loadStats() {
    try {
      setLoading(true);
      setErr(null);
      const res = await fetch("/api/stats/dashboard", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "gagal ambil statistik");
      setStats(json.data as Stats);
    } catch (e: any) {
      setErr(e?.message || "gagal ambil statistik");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  // Realtime: perubahan di projects / generated_reports -> refresh angka
  useEffect(() => {
    let t: any;
    const refresh = () => {
      clearTimeout(t);
      t = setTimeout(loadStats, 150);
    };

    const ch = supabase
      .channel("admin-dashboard-stats")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        refresh
      )
      // jika tabel generated_reports belum ada, channel tetap aman (tak ada event)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "generated_reports" },
        refresh
      )
      .subscribe();

    return () => {
      clearTimeout(t);
      supabase.removeChannel(ch);
    };
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader title="Dashboard Admin" />

      <main className="p-4">
        <div className="max-w-10xl mx-auto">
          {/* Statistics Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-green-100 rounded-full">
                    <CheckCircle className="h-12 w-12 text-green-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-1">
                      Pekerjaan Selesai
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.completedCount}
                    </p>
                  </div>
                </div>
                {err && (
                  <p className="text-xs text-red-600 mt-2">Error: {err}</p>
                )}
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-yellow-100 rounded-full">
                    <Clock className="h-12 w-12 text-yellow-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Sedang Berlangsung
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.ongoingCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="hover:shadow-lg transition-shadow">
              <CardContent className="p-8">
                <div className="flex items-center">
                  <div className="p-4 bg-blue-100 rounded-full">
                    <FileText className="h-12 w-12 text-blue-600" />
                  </div>
                  <div className="ml-6">
                    <p className="text-lg font-medium text-gray-600 mb-2">
                      Laporan Dibuat
                    </p>
                    <p className="text-4xl font-bold text-gray-900">
                      {loading ? "…" : stats.reportsCount}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Menu Section */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/manage_teknisi")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-purple-100 rounded-full group-hover:bg-purple-200 transition-colors">
                    <Users className="h-16 w-16 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Kelola Data
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Lihat & Kelola Data User dan Kendaraaan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/assign_penjadwalan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-orange-100 rounded-full group-hover:bg-orange-200 transition-colors">
                    <CalendarCheck className="h-16 w-16 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Assign Penjadwalan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Penjadwalan Project dan Teknisi
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/generate_laporan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6  bg-green-100 rounded-full group-hover:bg-green-200 transition-colors">
                    <FileText className="h-16 w-16 text-green-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Generate Laporan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Pilih pekerjaan dan generate laporan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card
              className="hover:shadow-lg transition-all cursor-pointer group"
              onClick={() => handleNavigation("/admin/history_pekerjaan")}
            >
              <CardContent className="p-6 text-center">
                <div className="flex flex-col items-center space-y-4">
                  <div className="p-6 bg-indigo-100 rounded-full group-hover:bg-indigo-200 transition-colors">
                    <History className="h-16 w-16 text-indigo-600" />
                  </div>
                  <div>
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      Riwayat Pekerjaan
                    </h3>
                    <p className="text-[14px] text-gray-600">
                      Lihat riwayat semua pekerjaan
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
