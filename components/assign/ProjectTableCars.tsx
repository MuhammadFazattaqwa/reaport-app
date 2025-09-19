// components/assign/ProjectTableCars.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  UIProject,
  UITechnician,
  CellAssignment,
} from "@/components/assign/types";
import {
  truncateText,
  getProgressStatus,
  getManDaysDisplay,
  getManDaysStatus,
  getProjectStatusDisplay,
} from "@/components/assign/helpers";

/** Per-vehicle shape untuk UI */
type VehicleUI = { id: string; model: string; plate: string; inisial: string };

type Props = {
  projects: UIProject[];
  assignments: CellAssignment[];

  onCellClick: (projectId: string, technicianId: string) => void;
  onCellDoubleClick: (projectId: string, technicianId: string) => void;
  onStatusDoubleClick: (project: UIProject) => void;
  onProjectNameRightClick: (e: React.MouseEvent, project: UIProject) => void;

  getCellAssignment: (
    projectId: string,
    technicianId: string
  ) => CellAssignment | undefined;
  getTechnicianTrackNumber: (technicianId: string) => number;
  getProjectAssignmentCount: (projectId: string) => number;

  tableRef?: React.RefObject<HTMLTableElement>;
};

/** Ambil satu huruf inisial dari model/plate */
function vehicleInitialFrom(text?: string) {
  const raw = String(text || "").trim();
  if (!raw) return "?";
  const m = raw.match(/[A-Za-z\u00C0-\u024F]/);
  return (m?.[0] || raw[0] || "?").toUpperCase();
}

export default function ProjectTableCars({
  projects,
  assignments,
  onCellClick,
  onCellDoubleClick,
  onStatusDoubleClick,
  onProjectNameRightClick,
  getCellAssignment,
  getTechnicianTrackNumber,
  getProjectAssignmentCount,
  tableRef,
}: Props) {
  // ===== Ambil kendaraan dari DB lewat endpoint /api/vehicles =====
  const [vehicles, setVehicles] = useState<VehicleUI[]>([]);
  const [vehLoading, setVehLoading] = useState(true);
  const [vehError, setVehError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/vehicles", { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());

        // API bisa kirim {vehicles:[...]} atau {data:[...]}
        const json: any = await res.json();
        const arr: any[] = Array.isArray(json?.vehicles)
          ? json.vehicles
          : Array.isArray(json?.data)
          ? json.data
          : [];

        if (!active) return;

        const normalized: VehicleUI[] = arr.map((v: any) => {
          const id = String(v.id ?? v.vehicle_code ?? v.code ?? "");
          const model = String(v.model ?? v.tipe ?? v.name ?? "").trim();
          const plate = String(v.plate ?? v.no_polisi ?? "");
          const inisial = String(
            v.inisial ?? vehicleInitialFrom(model || plate)
          ).toUpperCase();
          return { id, model, plate, inisial };
        });

        setVehicles(normalized);
      } catch (e: any) {
        if (active) setVehError(e?.message ?? "Gagal memuat kendaraan");
      } finally {
        if (active) setVehLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // tampilkan semua kendaraan sebagai "teknisi" (kolom matriks)
  const allTechs: UITechnician[] = useMemo(
    () =>
      vehicles.map((v) => ({
        id: v.id, // contoh: "car-01"
        name: v.model, // gunakan MODEL untuk label kolom
        inisial: v.inisial,
      })),
    [vehicles]
  );

  return (
    <div className="bg-white rounded-lg shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table ref={tableRef} className="w-full text-xs">
          <thead className="bg-gray-100 sticky top-0 z-10">
            <tr>
              <th className="px-2 py-2 text-left font-semibold text-gray-900 border-r border-gray-300 w-28">
                Nama Proyek
              </th>

              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-10">
                <div className="flex flex-col items-center justify-end h-full">
                  <div className="text-lg font-bold">Σ</div>
                </div>
              </th>

              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                Man Days
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-16">
                Progress (Hari)
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                Datang
              </th>
              <th className="px-2 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-14">
                Pulang
              </th>

              {/* === HEADER KENDARAAN dari DB === */}
              {vehLoading && (
                <th className="px-2 py-2 text-center font-semibold text-gray-500 border-r border-gray-300">
                  Memuat kendaraan...
                </th>
              )}

              {!vehLoading &&
                allTechs.map((t, i) => {
                  const v = vehicles[i];
                  const plate = v?.plate ?? "";
                  return (
                    <th
                      key={t.id}
                      className="px-1 py-4 text-center font-semibold text-gray-900 border-r border-gray-300 w-8 sticky top-0 bg-gray-100 h-36"
                      title={`${t.name} — ${plate}`}
                    >
                      <div className="flex flex-col items-center justify-center h-full">
                        {/* No. Polisi */}
                        <div
                          className="text-[10px] italic"
                          style={{
                            writingMode: "vertical-lr",
                            textOrientation: "mixed",
                            transform: "rotate(180deg)",
                            height: "52px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            lineHeight: 1.1,
                          }}
                        >
                          {t.name}
                          {plate}
                        </div>
                      </div>
                    </th>
                  );
                })}

              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Status
              </th>
              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Sales
              </th>
            </tr>
          </thead>

          <tbody>
            {vehError && (
              <tr>
                <td
                  colSpan={8 + allTechs.length}
                  className="px-3 py-2 text-red-600"
                >
                  Gagal memuat kendaraan: {vehError}
                </td>
              </tr>
            )}

            {projects.map((project, idx) => {
              const rowBg = idx % 2 === 0 ? "bg-white" : "bg-gray-50";
              const progress = getProgressStatus(project);
              const sigmaCurrent = getProjectAssignmentCount(project.id);
              const sigmaTarget = project.sigmaTeknisi ?? 0;
              const sigmaOver = sigmaCurrent > sigmaTarget;
              const manDisp = getManDaysDisplay(project);
              const manSt = getManDaysStatus(project);
              const statusDisp = getProjectStatusDisplay(project);
              const isLockedRow =
                project.projectStatus === "pending" ||
                project.projectStatus === "awaiting_bast" ||
                project.status === "completed";
              const rowKey = `${project.id ?? "noid"}-${
                project.jobId ?? "nojob"
              }-${idx}`;

              return (
                <tr key={rowKey} className={rowBg}>
                  <td
                    className={`px-1 py-1 border-r border-gray-200 font-medium ${rowBg}`}
                  >
                    <div
                      className="text-xs font-semibold cursor-pointer hover:bg-blue-50 px-1 py-1 rounded transition-colors"
                      onContextMenu={(e) => onProjectNameRightClick(e, project)}
                      title={
                        project.jobId
                          ? "Klik kanan untuk shortcut Generate Laporan (DOCX)"
                          : "Job ID belum tersedia"
                      }
                    >
                      {project.name}
                    </div>
                    <div className="text-[9px] text-gray-500 leading-tight">
                      {project.jobId}
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 font-semibold ${rowBg}`}
                  >
                    <div
                      className={`text-xs font-bold ${
                        sigmaOver
                          ? "text-red-600 font-semibold"
                          : "text-gray-900"
                      }`}
                    >
                      {sigmaCurrent}/{sigmaTarget}
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${manSt.bgColor} ${manSt.textColor}`}
                    >
                      <span>{manDisp.display}</span>
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${progress.bgColor} ${progress.textColor}`}
                    >
                      <span>{progress.display}</span>
                    </div>
                  </td>

                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBg}`}
                  >
                    {project.jamDatang}
                  </td>
                  <td
                    className={`px-2 py-1 text-center border-r border-gray-200 text-xs ${rowBg}`}
                  >
                    {project.jamPulang}
                  </td>

                  {/* Matriks cell kendaraan */}
                  {allTechs.map((t) => {
                    const a = getCellAssignment(project.id, t.id);
                    const isSel = a?.isSelected === true;
                    const isLead = a?.isProjectLeader === true;

                    let cellBg = rowBg;
                    let textColor = "text-gray-900";
                    let disp = "";
                    if (isLead) {
                      cellBg = "bg-red-500";
                      textColor = "text-white";
                      disp = a?.inisial || t.inisial;
                    } else if (isSel) {
                      cellBg = "bg-blue-200";
                      textColor = "text-blue-900";
                      disp = a?.inisial || t.inisial;
                    }

                    const disabledCell = isLockedRow;

                    return (
                      <td
                        key={`${project.id}-${t.id}`}
                        className={`px-1 py-1 text-center border-r border-gray-200 ${
                          disabledCell
                            ? "cursor-not-allowed opacity-60"
                            : "cursor-pointer hover:bg-blue-100"
                        } transition-colors ${cellBg}`}
                        onClick={() =>
                          !disabledCell && onCellClick(project.id, t.id)
                        }
                        onDoubleClick={() =>
                          !disabledCell && onCellDoubleClick(project.id, t.id)
                        }
                        title={
                          disabledCell
                            ? project.projectStatus === "pending"
                              ? "Proyek sedang pending"
                              : "Proyek telah selesai"
                            : isLead
                            ? `${t.name} (Project Leader)`
                            : isSel
                            ? `${t.name} (Assigned)`
                            : `Assign ${t.name}`
                        }
                      >
                        <div
                          className={`h-4 w-4 mx-auto flex items-center justify-center rounded font-bold text-xs ${textColor}`}
                        >
                          {disp}
                        </div>
                      </td>
                    );
                  })}

                  <td
                    className={`px-1 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div
                      className={`px-2 py-1 rounded text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity ${statusDisp.bgColor} ${statusDisp.textColor}`}
                      title={
                        project.projectStatus === "pending" &&
                        project.pendingReason
                          ? project.pendingReason
                          : statusDisp.label
                      }
                      onDoubleClick={() => onStatusDoubleClick(project)}
                    >
                      {project.projectStatus === "pending" &&
                      project.pendingReason
                        ? truncateText(project.pendingReason)
                        : statusDisp.label}
                    </div>
                  </td>

                  <td
                    className={`px-1 py-1 text-center border-r border-gray-200 ${rowBg}`}
                  >
                    <div className="px-2 py-1 text-xs font-medium text-gray-700">
                      {project.sales ? truncateText(project.sales, 25) : "-"}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ========== Helper untuk Select All di halaman kendaraan (opsional) ========== */
/* Jika file ini perlu mengekspor helper, salin fungsi berikut ke tempat
   yang memanggilnya (mis. AssignScheduling) atau sesuaikan impor sesuai strukturmu. */

export async function fetchVehiclesCompat(): Promise<VehicleUI[]> {
  try {
    const res = await fetch("/api/vehicles", { cache: "no-store" });
    if (!res.ok) throw new Error(await res.text());
    const json: any = await res.json();
    const arr: any[] = Array.isArray(json?.vehicles)
      ? json.vehicles
      : Array.isArray(json?.data)
      ? json.data
      : [];
    return arr.map((v: any) => {
      const id = String(v.id ?? v.vehicle_code ?? v.code ?? "");
      const model = String(v.model ?? v.tipe ?? v.name ?? "").trim();
      const plate = String(v.plate ?? v.no_polisi ?? "");
      const inisial = String(
        v.inisial ?? vehicleInitialFrom(model || plate)
      ).toUpperCase();
      return { id, model, plate, inisial } as VehicleUI;
    });
  } catch (e) {
    console.error("fetchVehiclesCompat failed:", e);
    return [];
  }
}
