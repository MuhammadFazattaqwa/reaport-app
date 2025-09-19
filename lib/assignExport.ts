import { toJpeg, toPng } from "html-to-image";
import {
  CellAssignment,
  UIProject,
  UITechnician,
} from "@/components/assign/types";
import {
  formatDateDDMMYYYY,
  getManDaysDisplay,
  getManDaysStatus,
  getProgressStatus,
  getProjectStatusDisplay,
} from "@/components/assign/helpers";

/* ===== Font ready ===== */
export async function waitForFontsReady(timeoutMs = 7000) {
  try {
    const anyDoc = document as any;
    if (anyDoc.fonts?.ready) {
      const p: Promise<void> = anyDoc.fonts.ready;
      if (!timeoutMs) return await p;
      await Promise.race([
        p,
        new Promise<void>((r) => setTimeout(r, timeoutMs)),
      ]);
    }
  } catch {
    /* ignore */
  }
}

export function computeHiResOpts(node: HTMLElement, minLongSide = 1920) {
  const rect = node.getBoundingClientRect();
  const width = Math.max(node.scrollWidth, rect.width);
  const height = Math.max(node.scrollHeight, rect.height);
  const longer = Math.max(width, height);
  const ratioTo1080p = Math.max(1, minLongSide / longer);
  const devicePR = window.devicePixelRatio || 1;
  const pixelRatio = Math.min(3, Math.max(1.5, ratioTo1080p * devicePR * 1.5));
  return { width, height, pixelRatio };
}

export function dataUrlToFile(
  dataUrl: string,
  filename: string,
  mime = "image/png"
): File {
  const arr = dataUrl.split(",");
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8 = new Uint8Array(n);
  while (n--) u8[n] = bstr.charCodeAt(n);
  return new File([u8], filename, { type: mime });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function getTableDataUrl(
  node: HTMLTableElement,
  type: "png" | "jpeg" = "png",
  minLongSide = 1920
) {
  await waitForFontsReady();

  const thead = node.querySelector("thead") as HTMLTableSectionElement | null;
  const prevTheadClass = thead?.className ?? "";
  if (thead)
    thead.className = prevTheadClass
      .replace(/\bsticky\b.*?\btop-0\b.*?\bz-10\b/g, "")
      .trim();

  const { width, height, pixelRatio } = computeHiResOpts(node, minLongSide);
  const baseOpts = {
    width,
    height,
    pixelRatio,
    backgroundColor: "#ffffff",
    cacheBust: true,
    style: { overflow: "visible" } as Partial<CSSStyleDeclaration>,
  };

  try {
    const run = async (pr: number) => {
      const opts = { ...baseOpts, pixelRatio: pr };
      return type === "png"
        ? await toPng(node, opts as any)
        : await toJpeg(node, { ...opts, quality: 0.95 } as any);
    };
    try {
      return await run(baseOpts.pixelRatio);
    } catch {
      return await run(Math.max(1, baseOpts.pixelRatio - 0.5));
    }
  } finally {
    if (thead) thead.className = prevTheadClass;
  }
}

/* ===== Excel (styled) ===== */
export async function buildStyledExcelBlob(
  techs: UITechnician[],
  projects: UIProject[],
  assignments: CellAssignment[],
  currentDate: string
): Promise<Blob> {
  const XLSX: any = await import("xlsx-js-style");

  const COLORS = {
    gray50: "F9FAFB",
    gray100: "F3F4F6",
    gray700: "374151",
    gray900: "111827",
    blue200: "BFDBFE",
    blue900: "1E3A8A",
    red100: "FEE2E2",
    red500: "EF4444",
    yellow100: "FEF9C3",
    green100: "D1FAE5",
    indigo100: "E0E7FF",
    white: "FFFFFF",
    border: "E5E7EB",
  };

  const getCellAssignment = (pid: string, tid: string) =>
    assignments.find((a) => a.projectId === pid && a.technicianId === tid);

  const getProjectAssignmentCount = (pid: string) =>
    assignments.filter(
      (a) => a.projectId === pid && (a.isSelected || a.isProjectLeader)
    ).length;

  const header = [
    "Nama Proyek",
    "Σ",
    "Man Days",
    "Progress (Hari)",
    "Datang",
    "Pulang",
    ...techs.map((t) => t.name),
    "Status",
    "Sales",
  ];
  const rows: any[][] = [header];

  const projectRowMeta: Array<{
    excelRow: number;
    project: UIProject;
    techCells: Array<{ cIdx: number; leader: boolean; selected: boolean }>;
  }> = [];

  for (const p of projects) {
    const sigma = `${getProjectAssignmentCount(p.id)}/${p.sigmaTeknisi ?? 0}`;
    const mdDisp = getManDaysDisplay(p).display;
    const progDisp = getProgressStatus(p).display;
    const base = [p.name, sigma, mdDisp, progDisp, p.jamDatang, p.jamPulang];

    const techCols: string[] = [];
    const techCellMeta: Array<{
      cIdx: number;
      leader: boolean;
      selected: boolean;
    }> = [];
    techs.forEach((t, i) => {
      const a = getCellAssignment(p.id, t.id);
      const val = a?.isProjectLeader
        ? "L"
        : a?.isSelected
        ? a?.inisial || t.inisial
        : "";
      techCols.push(val);
      techCellMeta.push({
        cIdx: 6 + i,
        leader: !!a?.isProjectLeader,
        selected: !!a?.isSelected,
      });
    });

    const statusLabel = getProjectStatusDisplay(p).label;
    rows.push([...base, ...techCols, statusLabel, p.sales || ""]);
    projectRowMeta.push({
      excelRow: rows.length,
      project: p,
      techCells: techCellMeta,
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 42 },
    { wch: 6 },
    { wch: 12 },
    { wch: 14 },
    { wch: 8 },
    { wch: 8 },
    ...techs.map(() => ({ wch: 4 })),
    { wch: 18 },
    { wch: 22 },
  ];

  const colLetter = (n: number) => {
    let s = "";
    while (n > 0) {
      const m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const range = XLSX.utils.decode_range(
    ws["!ref"] || `A1:${colLetter(header.length)}${rows.length}`
  );
  const ensureCell = (r: number, c: number) => {
    const addr = XLSX.utils.encode_cell({ r, c });
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    return addr;
  };

  // Header style
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = ensureCell(0, c);
    ws[addr].s = {
      font: { bold: true, sz: 11, color: { rgb: COLORS.gray900 } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      fill: { fgColor: { rgb: COLORS.gray100 } },
      border: {
        top: { style: "thin", color: { rgb: COLORS.border } },
        left: { style: "thin", color: { rgb: COLORS.border } },
        right: { style: "thin", color: { rgb: COLORS.border } },
        bottom: { style: "thin", color: { rgb: COLORS.border } },
      },
    };
  }
  // rotate tech headers
  const firstTechCol = 7; // 1-based
  for (let i = 0; i < techs.length; i++) {
    const addr = ensureCell(0, firstTechCol - 1 + i);
    ws[addr].s = {
      ...(ws[addr].s || {}),
      alignment: {
        horizontal: "center",
        vertical: "center",
        textRotation: 90,
        wrapText: true,
      },
    };
  }

  // Zebra & base border
  for (let r = 1; r <= range.e.r; r++) {
    const fill =
      r % 2 === 1
        ? { fgColor: { rgb: COLORS.gray50 } }
        : { fgColor: { rgb: COLORS.white } };
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = ensureCell(r, c);
      const isTechCol =
        c >= firstTechCol - 1 && c < firstTechCol - 1 + techs.length;
      ws[addr].s = {
        font: { sz: 10, color: { rgb: COLORS.gray900 } },
        alignment: {
          horizontal: isTechCol
            ? "center"
            : c <= 5
            ? c <= 1
              ? "left"
              : "center"
            : "left",
          vertical: "center",
          wrapText: true,
        },
        fill,
        border: {
          top: { style: "hair", color: { rgb: COLORS.border } },
          left: { style: "hair", color: { rgb: COLORS.border } },
          right: { style: "hair", color: { rgb: COLORS.border } },
          bottom: { style: "hair", color: { rgb: COLORS.border } },
        },
      };
    }
  }

  const statusColIdx = firstTechCol - 1 + techs.length;

  projectRowMeta.forEach(({ excelRow, project, techCells }) => {
    const r0 = excelRow - 1;

    // Man Days coloring
    {
      const man = getManDaysStatus(project);
      const addr = ensureCell(r0, 2);
      const mapColor = (bg: string) =>
        bg.includes("green")
          ? COLORS.green100
          : bg.includes("red")
          ? COLORS.red100
          : COLORS.gray100;
      ws[addr].s = {
        ...(ws[addr].s || {}),
        fill: { fgColor: { rgb: mapColor(man.bgColor) } },
        font: { ...(ws[addr].s?.font || {}), color: { rgb: COLORS.gray700 } },
        alignment: { ...(ws[addr].s?.alignment || {}), horizontal: "center" },
      };
    }
    // Progress coloring
    {
      const prog = getProgressStatus(project);
      const addr = ensureCell(r0, 3);
      const mapColor = (bg: string) =>
        bg.includes("green")
          ? COLORS.green100
          : bg.includes("red")
          ? COLORS.red100
          : bg.includes("yellow")
          ? COLORS.yellow100
          : COLORS.gray100;
      ws[addr].s = {
        ...(ws[addr].s || {}),
        fill: { fgColor: { rgb: mapColor(prog.bgColor) } },
        font: { ...(ws[addr].s?.font || {}), color: { rgb: COLORS.gray700 } },
        alignment: { ...(ws[addr].s?.alignment || {}), horizontal: "center" },
      };
    }
    // Technician cells
    techCells.forEach(({ cIdx, leader, selected }) => {
      if (!leader && !selected) return;
      const addr = ensureCell(r0, cIdx);
      if (leader) {
        ws[addr].s = {
          ...(ws[addr].s || {}),
          fill: { fgColor: { rgb: COLORS.red500 } },
          font: {
            ...(ws[addr].s?.font || {}),
            bold: true,
            color: { rgb: COLORS.white },
          },
          alignment: { ...(ws[addr].s?.alignment || {}), horizontal: "center" },
        };
      } else if (selected) {
        ws[addr].s = {
          ...(ws[addr].s || {}),
          fill: { fgColor: { rgb: COLORS.blue200 } },
          font: {
            ...(ws[addr].s?.font || {}),
            bold: true,
            color: { rgb: COLORS.blue900 },
          },
          alignment: { ...(ws[addr].s?.alignment || {}), horizontal: "center" },
        };
      }
    });
    // Status chip
    {
      const status = project.projectStatus;
      const addr = ensureCell(r0, statusColIdx);
      const fillColor =
        status === "completed"
          ? COLORS.green100
          : status === "awaiting_bast"
          ? COLORS.indigo100
          : status === "pending"
          ? COLORS.yellow100
          : status === "ongoing"
          ? COLORS.green100
          : COLORS.gray100;
      ws[addr].s = {
        ...(ws[addr].s || {}),
        fill: { fgColor: { rgb: fillColor } },
        font: { ...(ws[addr].s?.font || {}), color: { rgb: COLORS.gray700 } },
        alignment: { ...(ws[addr].s?.alignment || {}), horizontal: "center" },
      };
    }
  });

  // Flat sheet
  const flatHeader = [
    "Tanggal",
    "Project ID",
    "Project Name",
    "Technician ID",
    "Technician Name",
    "Inisial",
    "Leader",
    "Selected",
    "Datang",
    "Pulang",
  ];
  const flatRows: any[][] = [flatHeader];
  assignments
    .filter((a) => a.isSelected || a.isProjectLeader)
    .forEach((a) => {
      const p = projects.find((pp) => pp.id === a.projectId);
      const t = techs.find((tt) => tt.id === a.technicianId);
      flatRows.push([
        formatDateDDMMYYYY(currentDate),
        a.projectId,
        p?.name ?? "",
        a.technicianId,
        t?.name ?? "",
        a.inisial ?? t?.inisial ?? "",
        a.isProjectLeader ? "Y" : "N",
        a.isSelected ? "Y" : "N",
        p?.jamDatang ?? "",
        p?.jamPulang ?? "",
      ]);
    });
  const ws2 = XLSX.utils.aoa_to_sheet(flatRows);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Penjadwalan");
  XLSX.utils.book_append_sheet(wb, ws2, "Assignments");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
