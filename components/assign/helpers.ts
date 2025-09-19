import { UIProject } from "./types";

/* ===== Format & waktu ===== */
export const fmtID = (iso: string) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  return `${d}-${m}-${y}`;
};
export const formatDateDDMMYYYY = (iso: string) => fmtID(iso);

export const msToNextMidnight = () => {
  const now = new Date();
  const next = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    2
  );
  return next.getTime() - now.getTime();
};

export function unwrap<T = any>(payload: any): T {
  if (!payload) return [] as unknown as T;
  if (Array.isArray(payload)) return payload as T;
  if ("data" in payload) return payload.data as T;
  if ("projects" in payload) return payload.projects as T;
  if ("technicians" in payload) return payload.technicians as T;
  if ("items" in payload) return payload.items as T;
  return payload as T;
}

export function time5(v: any, def = "08:00") {
  if (!v) return def;
  const s = String(v);
  return s.length >= 5 ? s.slice(0, 5) : def;
}

export const safeUUID = () =>
  typeof crypto !== "undefined" && (crypto as any).randomUUID
    ? (crypto as any).randomUUID()
    : Math.random().toString(36).slice(2);

export const addDaysToIso = (iso: string, delta: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + delta);
  const y2 = dt.getFullYear();
  const m2 = String(dt.getMonth() + 1).padStart(2, "0");
  const d2 = String(dt.getDate()).padStart(2, "0");
  return `${y2}-${m2}-${d2}`;
};

/* ===== UI helper untuk status/label ===== */
export const getProgressStatus = (project: UIProject) => {
  const sigmaHari = Number(project.sigmaHari || 0);
  const currentDays = Number(project.daysElapsed || 0);
  const isPending =
    project.projectStatus === "pending" || !!project.pendingReason;

  if (isPending) {
    return {
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-700",
      display: `${currentDays}/${sigmaHari}`,
    };
  }

  switch (project.status) {
    case "completed":
      return {
        bgColor: "bg-green-100",
        textColor: "text-green-700",
        display: `${currentDays}/${sigmaHari}`,
      };
    case "overdue":
      return {
        bgColor: "bg-red-100",
        textColor: "text-red-700",
        display: `${currentDays}/${sigmaHari}`,
      };
    case "ongoing":
    default:
      return {
        bgColor: "bg-gray-100",
        textColor: "text-gray-700",
        display: `${currentDays}/${sigmaHari}`,
      };
  }
};

export const getManDaysDisplay = (project: UIProject) => {
  const current = Number(project.actualManDays || 0);
  const target = Number.parseInt(project.sigmaManDays) || 0;
  return { current, target, display: `${current}/${target}` };
};

export const getManDaysStatus = (project: UIProject) => {
  const current = Number(project.actualManDays || 0);
  const target = Number.parseInt(project.sigmaManDays) || 0;
  let bgColor = "bg-gray-100";
  let textColor = "text-gray-700";

  if (target > 0 && current >= target && current <= target * 1.2) {
    bgColor = "bg-green-100";
    textColor = "text-green-700";
  } else if (target > 0 && current > target * 1.2) {
    bgColor = "bg-red-100";
    textColor = "text-red-700";
  }
  return { bgColor, textColor };
};

export const getProjectStatusDisplay = (project: UIProject) => {
  const { projectStatus, pendingReason } = project;
  let bgColor = "bg-gray-100";
  let textColor = "text-gray-700";
  let label = "Belum Diassign";

  switch (projectStatus) {
    case "completed":
      bgColor = "bg-emerald-100";
      textColor = "text-emerald-700";
      label = "Selesai";
      break;
    case "awaiting_bast":
      bgColor = "bg-indigo-100";
      textColor = "text-indigo-700";
      label = "Menunggu BAST";
      break;
    case "ongoing":
      bgColor = "bg-green-100";
      textColor = "text-green-700";
      label = "Berlangsung";
      break;
    case "pending":
      bgColor = "bg-yellow-100";
      textColor = "text-yellow-700";
      label = "Pending";
      break;
    case "unassigned":
    default:
      bgColor = "bg-gray-100";
      textColor = "text-gray-700";
      label = "Belum Diassign";
  }
  return { bgColor, textColor, label, reason: pendingReason };
};

export const truncateText = (t: string, max = 20) =>
  t.length <= max ? t : t.substring(0, max) + "...";
