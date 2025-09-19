// @/lib/wib.ts

/**
 * Mengembalikan tanggal (WIB) dalam format "YYYY-MM-DD".
 * Jika ref diberikan (Date|number|ISO string), gunakan itu sebagai acuan; else gunakan "now".
 */
export function effectiveWIBDate(ref?: Date | number | string): string {
  const base =
    ref instanceof Date
      ? ref.getTime()
      : typeof ref === "number"
      ? ref
      : typeof ref === "string"
      ? Date.parse(ref)
      : Date.now();

  const wibMs = base + 7 * 60 * 60 * 1000; // UTC -> WIB
  return new Date(wibMs).toISOString().slice(0, 10);
}

export function isoToWIBDate(iso: string): string {
  const dt = new Date(iso);
  return effectiveWIBDate(dt);
}
export function nowWIBIso(): string {
  const wibMs = Date.now() + 7 * 60 * 60 * 1000;
  return new Date(wibMs).toISOString().replace("Z", "+07:00");
}

export function visibleUntilCompletedAt(
  completedAt: string | null,
  queryDate: string, // "YYYY-MM-DD" (WIB)
  _todayWIB?: string, // tidak dipakai
  _nowMs?: number // tidak dipakai
): boolean {
  if (!completedAt) return true;

  const completedWIB = effectiveWIBDate(completedAt); // YYYY-MM-DD in WIB
  // tampil hanya bila queryDate <= completedWIB (H tampil, H+1 hilang)
  return queryDate <= completedWIB;
}
