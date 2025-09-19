// src/lib/quotes.ts

const QUOTES: string[] = [
  "Kerjakan yang penting dulu, sempurnakan sambil jalan.",
  "Dokumentasi yang rapi menyelamatkan waktu besok.",
  "Kesalahan adalah data—pelajari, perbaiki, lanjutkan.",
  "Kecepatan itu baik, ketelitian itu wajib.",
  "Satu (%) perbaikan tiap hari = besar hasilnya.",
  "Kalau ragu, cek ulang; kalau yakin, tetap cek ulang.",
  "Komunikasi yang jelas adalah setengah dari solusi.",
  "Tidak ada kesuksesan yang instan, semua perlu proses.",
  "Jadilah seperti bunga yang mekar meskipun di taman yang tandus.",
  "Keberanian tidak pernah lepas dari ketidakpastian.",
  "Kesuksesan adalah buah dari kerja keras dan ketekunan.",
  "Kamu bisa, jika kamu berpikir bisa.",
  "Kita tidak bisa mengatur angin, tapi kita bisa mengatur layar.",    
  "Hidup ini harus kita jalani dengan ceria dan berpikir positif.",
  "Kegagalan adalah sukses yang tertunda.",
  "Kesuksesan terbesar adalah ketika kesuksesan itu datang setelah kegagalan.",
  "Berhentilah berfokus pada masalah, mulailah fokus pada solusi.",  
];

/** hash harian deterministik (berganti tiap hari UTC) */
function dailySeed(date = new Date()): number {
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) / 86400000;
  return Math.floor(day);
}

/** Ambil quote untuk hari ini */
export function getDailyQuote(date = new Date()): string {
  if (QUOTES.length === 0) {
    return "Selalu ada cara yang lebih baik—kita temukan hari ini.";
  }
  const idx = dailySeed(date) % QUOTES.length;
  return QUOTES[idx];
}
