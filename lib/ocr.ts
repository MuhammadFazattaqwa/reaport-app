/* eslint-disable @typescript-eslint/ban-ts-comment */

export type OcrStatus = "idle" | "barcode" | "ocr" | "done" | "error";

export interface OcrInfo {
  status: OcrStatus;
  progress: number;
  error?: string;
}

export interface RecognizeOptions {
  onProgress?: (info: OcrInfo) => void;
  enableBarcode?: boolean;
  abortSignal?: AbortSignal;
}

/* ================= Helpers (mengikuti logika di file kamu) ================= */

// Normalisasi salah OCR umum pada SN (lebih “smart”, termasuk Q→0 saat diikuti digit)
export function normalizeSN(val: string) {
  let out = (val || "").trim().toUpperCase();

  // Q→0 jika diikuti digit (kasus: HFEQ9F3HKDT -> HFE09F3HKDT)
  out = out.replace(/Q(?=\d)/g, "0");

  // O→0 kalau diapit digit atau diikuti digit/akhir
  out = out.replace(/(?<=\d)O(?=\d)/g, "0").replace(/O(?=\d)/g, "0");

  // I/l → 1 di sekitar digit
  out = out.replace(/(?<=\d)[IL](?=\d)/g, "1");

  // B→8, S→5 hanya jika diapit digit
  out = out.replace(/(?<=\d)B(?=\d)/g, "8");
  out = out.replace(/(?<=\d)S(?=\d)/g, "5");

  // Buang simbol aneh (tetap izinkan dash)
  out = out.replace(/[^\w\-]/g, "");

  return out;
}

// Pola label & nilai (sama seperti di kode kamu)
const labelPattern = /\b(?:S\/?N|Serial(?:\s*No\.?| Number)?)\b/i;
const valuePattern = /[:#\-]?\s*([A-Z0-9\-]{5,})/i;

/** Versi "single" persis seperti fungsi extractSN kamu (mengembalikan satu string atau ""). */
export function extractSNSingle(
  ocrText: string,
  words?: Array<{ text: string }>,
  lines?: Array<{ text: string }>
) {
  // 1) Baris yang mengandung label
  for (const l of lines || []) {
    if (labelPattern.test(l.text)) {
      const m = l.text.match(
        new RegExp(labelPattern.source + valuePattern.source, "i")
      );
      if (m?.[1]) return normalizeSN(m[1]);
    }
  }

  // 2) Token setelah label
  if (words && words.length) {
    for (let i = 0; i < words.length; i++) {
      if (labelPattern.test(words[i].text)) {
        const nextTokens = [
          words[i + 1]?.text,
          words[i + 2]?.text,
          words[i + 3]?.text,
        ]
          .filter(Boolean)
          .join(" ");
        const m = nextTokens.match(valuePattern);
        if (m?.[1]) return normalizeSN(m[1]);
      }
    }
  }

  // 3) Regex global di seluruh teks
  const mAll = ocrText.match(
    new RegExp(labelPattern.source + valuePattern.source, "i")
  );
  if (mAll?.[1]) return normalizeSN(mAll[1]);

  // 4) Fallback: deretan alnum panjang di baris label
  const lineSN = (
    ocrText.split(/\r?\n/).find((l) => labelPattern.test(l)) || ""
  ).replace(labelPattern, "");
  const mLoose = lineSN.match(/[A-Z0-9\-]{6,}/i);
  if (mLoose?.[0]) return normalizeSN(mLoose[0]);

  // 5) Fallback terakhir: angka panjang (bila label tak terbaca)
  const mDigits = ocrText.match(/\b\d{10,}\b/);
  if (mDigits?.[0]) return normalizeSN(mDigits[0]);

  return "";
}

/** Versi "multi" yang memungut semua kandidat dengan urutan dari logika yang sama. */
function extractSNCandidates(
  ocrText: string,
  words?: Array<{ text: string }>,
  lines?: Array<{ text: string }>
): string[] {
  const c: string[] = [];

  // 1) baris yang mengandung label
  for (const l of lines || []) {
    if (!labelPattern.test(l.text)) continue;
    const m = l.text.match(
      new RegExp(labelPattern.source + valuePattern.source, "i")
    );
    if (m?.[1]) c.push(normalizeSN(m[1]));
  }

  // 2) token setelah label (1..3 token)
  if (words && words.length) {
    for (let i = 0; i < words.length; i++) {
      if (!labelPattern.test(words[i].text)) continue;
      const nextTokens = [
        words[i + 1]?.text,
        words[i + 2]?.text,
        words[i + 3]?.text,
      ]
        .filter(Boolean)
        .join(" ");
      const m = nextTokens.match(valuePattern);
      if (m?.[1]) c.push(normalizeSN(m[1]));
    }
  }

  // 3) regex global
  const mAll = ocrText.match(
    new RegExp(labelPattern.source + valuePattern.source, "i")
  );
  if (mAll?.[1]) c.push(normalizeSN(mAll[1]));

  // 4) fallback: alnum panjang di baris label
  const lineSN = (
    ocrText.split(/\r?\n/).find((l) => labelPattern.test(l)) || ""
  ).replace(labelPattern, "");
  const mLoose = lineSN.match(/[A-Z0-9\-]{6,}/i);
  if (mLoose?.[0]) c.push(normalizeSN(mLoose[0]));

  // 5) fallback terakhir: angka panjang jika label tak terbaca
  if (!c.length) {
    const mDigits = ocrText.match(/\b\d{10,}\b/);
    if (mDigits?.[0]) c.push(normalizeSN(mDigits[0]));
  }

  // dedup + panjang minimal
  return Array.from(new Set(c)).filter((s) => s.length >= 6);
}

/* ================= Barcode helper ================= */

async function loadImg(source: Blob | string): Promise<HTMLImageElement> {
  return await new Promise((resolve, reject) => {
    const im = new Image();
    (im as any).decoding = "async";
    im.crossOrigin = "anonymous";
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error("load image failed"));
    im.src = typeof source === "string" ? source : URL.createObjectURL(source);
  });
}

async function tryDecodeBarcodeFromImage(
  img: HTMLImageElement
): Promise<string | null> {
  try {
    const { BrowserMultiFormatReader } = await import("@zxing/browser");
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageElement(img);
    const txt = (result as any)?.getText?.() ?? "";
    return txt ? normalizeSN(txt) : null;
  } catch {
    return null;
  }
}

/* ================= Tesseract helper ================= */

type Word = { text: string };
type Line = { text: string };

let _Tesseract: any;
async function getTesseract() {
  if (_Tesseract) return _Tesseract;
  _Tesseract = (await import("tesseract.js")).default;
  return _Tesseract;
}

async function runTesseract(
  image: Blob | string,
  psm: number,
  onProgress?: (i: OcrInfo) => void
) {
  const Tesseract = await getTesseract();
  const result = await Tesseract.recognize(image, "eng", {
    // @ts-ignore
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789:-/#",
    // @ts-ignore
    user_defined_dpi: "300",
    // @ts-ignore
    tessedit_pageseg_mode: psm,
    logger: (m: any) => {
      if (m?.status === "recognizing text" && typeof m.progress === "number") {
        onProgress?.({
          status: "ocr",
          progress: Math.max(1, Math.round(m.progress * 100)),
        });
      }
    },
  });

  const text = (result.data?.text ?? "").trim();
  const words = ((result.data as any)?.words ?? []) as Word[];
  const lines = ((result.data as any)?.lines ?? []) as Line[];
  return { text, words, lines };
}

/* ================= Public API ================= */

/**
 * Baca barcode dulu, lalu OCR penuh mengikuti logika file kamu.
 * Mengembalikan kandidat untuk dipilih teknisi.
 */
export async function recognizeSerialNumberWithCandidates(
  source: Blob | string,
  opts: RecognizeOptions = {}
): Promise<{ best: string | null; candidates: string[] }> {
  const { onProgress, enableBarcode = true, abortSignal } = opts;

  const pool: string[] = [];
  let best: string | null = null;

  // 1) Barcode (opsional)
  if (enableBarcode) {
    onProgress?.({ status: "barcode", progress: 0 });
    try {
      const img = await loadImg(source);
      const bc = await tryDecodeBarcodeFromImage(img);
      if (bc) {
        pool.push(bc);
        best = best || bc;
      }
    } catch {
      /* ignore */
    }
  }

  // 2) OCR penuh (PSM 6 → fallback 7) lalu ekstraksi label-only
  const psmList = [6, 7];
  for (let i = 0; i < psmList.length; i++) {
    const { text, words, lines } = await runTesseract(
      source,
      psmList[i],
      onProgress
    );
    if (abortSignal?.aborted) throw new Error("aborted");

    const list = extractSNCandidates(text, words as any, lines as any);
    pool.push(...list);

    // bila sudah ada kandidat dari label, cukup
    if (list.length) break;
  }

  // dedup
  const candidates = Array.from(new Set(pool.map(normalizeSN))).filter(
    (s) => s.length >= 6
  );
  if (!best && candidates.length) best = candidates[0];

  onProgress?.({ status: "done", progress: 100 });
  return { best, candidates };
}

/** Kompat: hanya satu hasil utama (opsional). */
export async function recognizeSerialNumber(
  source: Blob | string,
  opts: RecognizeOptions = {}
): Promise<string | null> {
  const { best } = await recognizeSerialNumberWithCandidates(source, opts);
  return best ?? null;
}
