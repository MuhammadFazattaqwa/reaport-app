"use client";

import type React from "react";
import { useState, useRef, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { TechnicianHeader } from "@/components/technician-header";
import { ChevronRight, ChevronDown, Folder, FileText } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

/* ====== Tambahan untuk offline awareness ====== */
import { useOnlineStatus } from "@/lib/offline/online";

/* ====== Types dari kode kamu ====== */
interface Room {
  id: string;
  name: string;
  hasChildren: boolean;
  uploaded: number;
  required: number;
  status: "pending" | "partial" | "complete";
  children?: Room[];
}

interface Floor {
  id: string;
  floor_number: number;
  name: string;
  rooms: Room[];
  expanded: boolean;
}

type ApiPayload = {
  project: { id: string; job_id: string; name: string; lokasi: string | null };
  floors: any[]; // bisa 2 bentuk (lihat komentar di kode lama)
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/* ====== Util lama kamu (dipertahankan) ====== */
// ambil param pertama yang valid
const getParam = (sp: URLSearchParams, names: string[]): string | null => {
  for (const n of names) {
    const raw = sp.get(n);
    if (
      raw !== null &&
      raw.trim() !== "" &&
      raw.toLowerCase() !== "null" &&
      raw.toLowerCase() !== "undefined"
    ) {
      return raw;
    }
  }
  return null;
};

// debounce kecil
function debounce<T extends (...args: any[]) => void>(fn: T, ms = 200) {
  let t: any;
  return (...args: any[]) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Pastikan floors dari API selalu menjadi Floor[] yang valid & unik id-nya */
function normalizeFloors(rawFloors: any[]): Floor[] {
  const arr = Array.isArray(rawFloors) ? rawFloors : [];

  const floors: Floor[] = arr.map((f: any, fIdx: number) => {
    const floorNum = Number(
      f?.floor_number ?? f?.floor ?? (Number.isFinite(fIdx) ? fIdx + 1 : 1)
    );

    const computedId =
      typeof f?.id === "string" && f.id.trim()
        ? String(f.id)
        : `floor-${Number.isFinite(floorNum) ? floorNum : "x"}-${fIdx}`;

    const name = String(f?.name ?? `Lantai ${floorNum}`);
    const expanded = f?.expanded === false ? false : true;

    const roomsRaw: any[] = Array.isArray(f?.rooms) ? f.rooms : [];
    const rooms: Room[] = roomsRaw.map((r: any, rIdx: number) => {
      const rid =
        typeof r?.id === "string" && r.id.trim()
          ? String(r.id)
          : `${computedId}-room-${rIdx}`;

      const rname = String(r?.name ?? r?.room_name ?? `Room ${rIdx + 1}`);
      const uploaded = Number.isFinite(Number(r?.uploaded))
        ? Number(r.uploaded)
        : 0;
      const required = Number.isFinite(Number(r?.required))
        ? Number(r.required)
        : 0;

      let status: Room["status"];
      if (
        r?.status === "pending" ||
        r?.status === "partial" ||
        r?.status === "complete"
      ) {
        status = r.status;
      } else if (required > 0) {
        status =
          uploaded >= required
            ? "complete"
            : uploaded > 0
            ? "partial"
            : "pending";
      } else {
        status = uploaded > 0 ? "partial" : "pending";
      }

      return {
        id: rid,
        name: rname,
        uploaded,
        required,
        status,
        hasChildren: !!r?.hasChildren,
      };
    });

    return {
      id: computedId,
      floor_number: Number.isFinite(floorNum) ? floorNum : fIdx + 1,
      name,
      expanded,
      rooms,
    };
  });

  floors.sort((a, b) => a.floor_number - b.floor_number);
  return floors;
}

/* ====== KUNCI SNAPSHOT LOKAL ====== */
const floorsLSKey = (projectId: string) => `survey_floors_${projectId}`;

export default function SurveyFloors() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const online = useOnlineStatus();

  // Terima projectId dari "projectId" / "jobId" / "pid" (semua = projects.id)
  const projectId = useMemo(
    () => getParam(searchParams, ["projectId", "jobId", "pid"]),
    [searchParams]
  );

  const [treeData, setTreeData] = useState<Floor[]>([]);
  const [activeFloor, setActiveFloor] = useState<number>(1);
  const [expandedRooms, setExpandedRooms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [projectMeta, setProjectMeta] = useState<{
    id: string;
    job_id: string;
    name: string;
    lokasi: string | null;
  } | null>(null);

  const floorRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});
  const roomsChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(
    null
  );

  /* ===== helper tampilan (dipertahankan) ===== */
  const getStatusStyling = (status: string) => {
    switch (status) {
      case "pending":
        return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
      case "partial":
        return {
          bg: "bg-yellow-100",
          text: "text-yellow-700",
          dot: "bg-yellow-500",
        };
      case "complete":
        return {
          bg: "bg-green-100",
          text: "text-green-700",
          dot: "bg-green-500",
        };
      default:
        return { bg: "bg-gray-100", text: "text-gray-600", dot: "bg-gray-400" };
    }
  };

  const toggleFloor = (floorId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setTreeData((prev) =>
      prev.map((floor) =>
        floor.id === floorId ? { ...floor, expanded: !floor.expanded } : floor
      )
    );
  };

  const toggleRoom = (roomId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpandedRooms((prev) => {
      const next = new Set(prev);
      next.has(roomId) ? next.delete(roomId) : next.add(roomId);
      return next;
    });
  };

  const navigateToUpload = (
    entityType: "room" | "subroom",
    entityId: string,
    entityName: string,
    floorName: string
  ) => {
    const breadcrumb = `Survey > ${floorName} > ${entityName}`;
    const q = new URLSearchParams({
      entityType,
      id: entityId,
      roomName: entityName,
      breadcrumb,
      projectId: projectMeta?.id ?? projectId ?? "",
    });
    if (projectMeta?.job_id) q.set("job", projectMeta.job_id);
    router.push(`/user/survey/upload?${q.toString()}`);
  };

  /* ================= OFFLINE SNAPSHOT ================= */

  // 1) Restore snapshot lokal lebih dulu (biar UI muncul saat offline)
  useEffect(() => {
    if (!projectId) return;
    try {
      const raw = localStorage.getItem(floorsLSKey(projectId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setTreeData(parsed);
          // set default active floor
          if (parsed.length) setActiveFloor(parsed[0].floor_number);
        }
      }
    } catch {}
  }, [projectId]);

  // 2) Loader dari server (network-first), lalu simpan snapshot
  const load = async () => {
    if (!projectId) {
      setErr("Parameter projectId (projects.id) tidak ditemukan.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErr(null);

      // Jika offline, jangan pukul server—biarkan snapshot tampil
      if (!online) {
        setLoading(false);
        return;
      }

      const res = await fetch(
        `/api/survey/floors?projectId=${encodeURIComponent(projectId)}`,
        { cache: "no-store" }
      );
      const json: ApiPayload & { error?: string } = await res.json();
      if (!res.ok) throw new Error(json?.error || "Gagal memuat data survey");

      setProjectMeta(json.project);

      const normalized = normalizeFloors(json.floors);
      setTreeData(normalized);
      // simpan snapshot
      try {
        localStorage.setItem(
          floorsLSKey(projectId),
          JSON.stringify(normalized)
        );
      } catch {}

      if (normalized.length) setActiveFloor(normalized[0].floor_number);
    } catch (e: any) {
      setErr(e?.message || "Gagal memuat data survey");
      // biarkan snapshot yang sudah sempat dimuat tetap tampil
    } finally {
      setLoading(false);
    }
  };

  // initial load
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, online]); // kalau kembali online → refresh

  // kalau pindah ke offline, coba tampilkan snapshot terbaru
  useEffect(() => {
    if (!projectId) return;
    const onOffline = () => {
      try {
        const raw = localStorage.getItem(floorsLSKey(projectId));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) setTreeData(parsed);
        }
      } catch {}
    };
    window.addEventListener("offline", onOffline);
    return () => window.removeEventListener("offline", onOffline);
  }, [projectId]);

  // realtime: reload saat project_survey_rooms berubah
  useEffect(() => {
    if (!projectId) return;

    if (roomsChannelRef.current) {
      supabase.removeChannel(roomsChannelRef.current);
      roomsChannelRef.current = null;
    }

    const debounced = debounce(load, 150);

    const ch = supabase
      .channel("survey-tree-rooms")
      .on(
        "postgres_changes",
        {
          schema: "public",
          table: "project_survey_rooms",
          event: "*",
          filter: `project_id=eq.${projectId}`,
        },
        () => debounced()
      )
      .subscribe();

    roomsChannelRef.current = ch;

    return () => {
      if (roomsChannelRef.current)
        supabase.removeChannel(roomsChannelRef.current);
      roomsChannelRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // observer: update tombol lantai aktif saat scroll (tampilan kamu dipertahankan)
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const floorNumber = Number.parseInt(
              entry.target.getAttribute("data-floor") || "1"
            );
            setActiveFloor(floorNumber);
          }
        });
      },
      { threshold: 0.5, rootMargin: "-20% 0px -20% 0px" }
    );

    Object.values(floorRefs.current).forEach((ref) => {
      if (ref) observer.observe(ref);
    });

    return () => observer.disconnect();
  }, [treeData]);

  /* ====== Render tree item (dipertahankan) ====== */
  const renderTreeItem = (
    item: Room,
    level: number,
    floorName: string,
    isSubroom = false
  ) => {
    const styling = getStatusStyling(item.status);
    const isExpanded = expandedRooms.has(item.id);
    const paddingLeft = level === 0 ? 48 : 48 + level * 24;

    const handleItemClick = () => {
      if (item.hasChildren) {
        setExpandedRooms((prev) => {
          const next = new Set(prev);
          next.has(item.id) ? next.delete(item.id) : next.add(item.id);
          return next;
        });
      } else {
        navigateToUpload(
          isSubroom ? "subroom" : "room",
          item.id,
          item.name,
          floorName
        );
      }
    };

    return (
      <div key={item.id}>
        <div
          className="flex items-center py-2 px-2 hover:bg-gray-50 cursor-pointer min-h-[44px]"
          style={{ paddingLeft: `${paddingLeft}px` }}
          onClick={handleItemClick}
        >
          {item.hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleRoom(item.id, e);
              }}
              className="p-1 hover:bg-gray-200 rounded mr-2 -ml-6"
            >
              {isExpanded ? (
                <ChevronDown size={16} />
              ) : (
                <ChevronRight size={16} />
              )}
            </button>
          )}

          <div className="mr-2">
            {item.hasChildren ? (
              <Folder size={16} className="text-blue-600" />
            ) : (
              <FileText size={16} className="text-gray-600" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex items-center">
            <div className="font-medium text-sm text-gray-900 truncate">
              {item.name}
            </div>
            <div
              className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${styling.bg} ${styling.text}`}
            >
              {item.uploaded}/{item.required}
            </div>
          </div>
        </div>

        {item.hasChildren && isExpanded && item.children && (
          <div>
            {item.children.map((child) =>
              renderTreeItem(child, 1 + level, floorName, true)
            )}
          </div>
        )}
      </div>
    );
  };

  const scrollToFloor = (floorNumber: number) => {
    const floorElement = floorRefs.current[floorNumber];
    if (floorElement) {
      floorElement.scrollIntoView({
        behavior: "smooth",
        block: "start",
        inline: "nearest",
      });
      setActiveFloor(floorNumber);
    }
  };

  const hasFloors = useMemo(() => treeData.length > 0, [treeData]);

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <TechnicianHeader
        title="Survey - Tree View"
        showBackButton
        backUrl="/user/dashboard"
      />

      <main className="p-4">
        <div className="max-w-4xl mx-auto flex gap-4">
          <div className="flex-1 max-w-md">
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-6 px-6 text-center text-sm text-gray-600">
                    Memuat...
                  </div>
                ) : err ? (
                  <div className="py-6 px-6 text-center text-sm text-red-600">
                    {err}
                  </div>
                ) : !hasFloors ? (
                  <div className="py-6 px-6 text-center text-sm text-gray-600">
                    Belum ada data ruangan survey.
                  </div>
                ) : (
                  treeData.map((floor) => (
                    <div
                      key={floor.id}
                      className="border-b border-gray-100 last:border-b-0"
                      ref={(el) => {
                        floorRefs.current[floor.floor_number] = el;
                      }}
                      data-floor={floor.floor_number}
                    >
                      <div className="flex items-center py-3 px-4 bg-gray-50 hover:bg-gray-100 cursor-pointer min-h-[44px]">
                        <button
                          onClick={(e) => toggleFloor(floor.id, e)}
                          className="p-1 hover:bg-gray-200 rounded mr-2"
                        >
                          {floor.expanded ? (
                            <ChevronDown size={18} />
                          ) : (
                            <ChevronRight size={18} />
                          )}
                        </button>

                        <Folder size={18} className="text-blue-600 mr-3" />

                        <div className="flex-1">
                          <h3 className="font-bold text-sm text-gray-900">
                            {floor.name}
                          </h3>
                          <div className="text-xs text-gray-500">
                            {floor.rooms.length} ruangan
                          </div>
                        </div>
                      </div>

                      {floor.expanded && (
                        <div className="bg-white">
                          {floor.rooms.length === 0 ? (
                            <div className="py-4 px-8 text-sm text-gray-500 text-center">
                              Tidak ada ruangan
                            </div>
                          ) : (
                            floor.rooms.map((room) =>
                              renderTreeItem(room, 0, floor.name)
                            )
                          )}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-2 pt-2">
            <div className="text-xs font-medium text-gray-500 mb-2">Lantai</div>
            {hasFloors ? (
              treeData.map((floor) => (
                <button
                  key={`btn-${floor.id}`}
                  onClick={() => scrollToFloor(floor.floor_number)}
                  className={`w-10 h-10 rounded-lg border-2 text-sm font-medium transition-all duration-200 ${
                    activeFloor === floor.floor_number
                      ? "bg-blue-600 text-white border-blue-600 shadow-md"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-600"
                  }`}
                >
                  {floor.floor_number}
                </button>
              ))
            ) : (
              <div className="text-xs text-gray-400">-</div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
