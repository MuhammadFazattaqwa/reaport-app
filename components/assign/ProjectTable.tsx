"use client";
import React from "react";
import { UIProject, UITechnician, CellAssignment } from "./types";
import {
  truncateText,
  getProgressStatus,
  getManDaysDisplay,
  getManDaysStatus,
  getProjectStatusDisplay,
} from "./helpers";

type Props = {
  tableRef: React.RefObject<HTMLTableElement>;
  techs: UITechnician[];
  projects: UIProject[];
  assignments: CellAssignment[];

  // handlers
  onCellClick: (projectId: string, technicianId: string) => void;
  onCellDoubleClick: (projectId: string, technicianId: string) => void;
  onStatusDoubleClick: (project: UIProject) => void;
  onProjectNameRightClick: (e: React.MouseEvent, project: UIProject) => void;

  // helpers
  getCellAssignment: (
    projectId: string,
    technicianId: string
  ) => CellAssignment | undefined;
  getTechnicianTrackNumber: (technicianId: string) => number;
  getProjectAssignmentCount: (projectId: string) => number;
  getIdleTechnicians: () => UITechnician[];
  getTechnicianStatus: (technicianId: string) => {
    status: string;
    color: string;
  };
};

export default function ProjectTable({
  tableRef,
  techs,
  projects,
  assignments,
  onCellClick,
  onCellDoubleClick,
  onStatusDoubleClick,
  onProjectNameRightClick,
  getCellAssignment,
  getTechnicianTrackNumber,
  getProjectAssignmentCount,
  getIdleTechnicians,
  getTechnicianStatus,
}: Props) {
  const totalAssignments = assignments.filter(
    (a) => a.isSelected || a.isProjectLeader
  ).length;

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
                  <div className="text-lg font-bold mb-2">Σ</div>
                  <div className="text-xs font-bold bg-gray-200 rounded px-1 min-w-[18px] text-center">
                    {totalAssignments}
                  </div>
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
              {techs.map((t) => (
                <th
                  key={t.id}
                  className="px-1 py-4 text-center font-semibold text-gray-900 border-r border-gray-300 w-6 sticky top-0 bg-gray-100 h-32"
                  title={t.name}
                >
                  <div className="flex flex-col items-center justify-end h-full">
                    <div
                      className="text-xs font-bold whitespace-nowrap mb-2"
                      style={{
                        writingMode: "vertical-lr",
                        textOrientation: "mixed",
                        transform: "rotate(180deg)",
                        height: "70px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {t.name}
                    </div>
                    <div className="text-xs font-bold bg-gray-200 rounded px-1 min-w-[18px] text-center">
                      {getTechnicianTrackNumber(t.id)}
                    </div>
                  </div>
                </th>
              ))}
              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Status
              </th>
              <th className="px-1 py-2 text-center font-semibold text-gray-900 border-r border-gray-300 w-20">
                Sales
              </th>
            </tr>
          </thead>

          <tbody>
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

                  {techs.map((t) => {
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
                            ? `${t.name} (Project Leader) - Double click to remove leader status`
                            : isSel
                            ? `${t.name} (Assigned) - Single click: toggle attendance | Double click: set as leader`
                            : `Single click: assign ${t.name} | Double click: set as project leader`
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

            {getIdleTechnicians().length > 0 && (
              <tr className="bg-blue-50 border-t-2 border-blue-200">
                <td className="px-1 py-1 border-r border-gray-200 font-medium bg-blue-50">
                  <div className="text-xs font-semibold">Di Kantor</div>
                  <div className="text-[9px] text-gray-500 leading-tight">
                    Teknisi Idle
                  </div>
                </td>
                <td className="px-2 py-1 text-center border-r border-gray-200 font-semibold bg-blue-50">
                  <div className="text-xs font-bold">
                    {getIdleTechnicians().length}
                  </div>
                </td>
                <td className="px-2 py-1 text-center border-r border-gray-200 bg-blue-50">
                  <div className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    <span>-</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-center border-r border-gray-200 bg-blue-50">
                  <div className="inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                    <span>-</span>
                  </div>
                </td>
                <td className="px-2 py-1 text-center border-r border-gray-200 text-xs bg-blue-50">
                  -
                </td>
                <td className="px-2 py-1 text-center border-r border-gray-200 text-xs bg-blue-50">
                  -
                </td>

                {techs.map((t) => {
                  const st = getTechnicianStatus(t.id);
                  const isIdle = st.status === "idle";
                  return (
                    <td
                      key={`idle-${t.id}`}
                      className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"
                    >
                      <div
                        className={`h-4 w-4 mx-auto flex items-center justify-center rounded font-bold text-xs ${
                          isIdle ? "text-gray-700" : ""
                        }`}
                      >
                        {isIdle ? t.inisial : ""}
                      </div>
                    </td>
                  );
                })}

                <td className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"></td>
                <td className="px-1 py-1 text-center border-r border-gray-200 bg-blue-50"></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
