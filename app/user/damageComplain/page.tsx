"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { TechnicianHeader } from "@/components/technician-header";

/* ================== Types ================== */
type VehicleInput =
  | {
      id?: string;
      projectId?: string;
      brand?: string;
      type?: string;
      plate?: string;
      name?: string; // e.g. "TOYOTA AVANZA L 1992 KK"
    }
  | string;

type Vehicle = {
  id?: string;
  projectId?: string;
  brand: string;
  type: string;
  plate: string;
};

/* ================== Helpers ================== */
function parseVehicleName(name: string): Vehicle {
  const tokens = name.trim().split(/\s+/);
  const brand = tokens[0] || "";
  const platePattern = /^[A-Z]{1,2}\s\d{1,4}\s[A-Z]{1,3}$/;

  let plate = "";
  if (tokens.length >= 3) {
    const maybePlate = `${tokens[tokens.length - 3]} ${
      tokens[tokens.length - 2]
    } ${tokens[tokens.length - 1]}`;
    if (platePattern.test(maybePlate)) {
      plate = maybePlate;
    }
  }
  let type = "";
  if (plate) {
    type = tokens.slice(1, tokens.length - 3).join(" ");
  } else {
    type = tokens.slice(1).join(" ");
  }
  return {
    brand: brand.toUpperCase(),
    type: type.trim(),
    plate: plate || "",
  };
}

function normalizeVehicles(raw: VehicleInput[]): Vehicle[] {
  const list: Vehicle[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      list.push(parseVehicleName(item));
    } else {
      if (item.brand && item.type && item.plate) {
        list.push({
          id: item.id,
          projectId: item.projectId,
          brand: item.brand.toUpperCase(),
          type: item.type,
          plate: item.plate,
        });
      } else if (item.name) {
        list.push(parseVehicleName(item.name));
      }
    }
  }
  const seen = new Set<string>();
  return list.filter((v) => {
    const key = v.plate || `${v.brand}-${v.type}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function todayISO(): string {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function buildHeaderMessage(params: {
  technicianName: string;
  jobId: string;
  brand: string;
  type: string;
  plate: string;
  locationType: "External" | "Internal";
  reportDate: string; // YYYY-MM-DD
}) {
  const {
    technicianName,
    jobId,
    brand,
    type,
    plate,
    locationType,
    reportDate,
  } = params;
  return (
    `Halo Admin, saya ${technicianName} dengan ID pekerjaan ${jobId} melaporkan adanya kerusakan pada kendaraan.\n\n` +
    `Detail Kendaraan:\n` +
    `- Merk: ${brand}\n` +
    `- Tipe: ${type}\n` +
    `- No Polisi: ${plate}\n\n` +
    `Informasi Kerusakan:\n` +
    `- Letak Kerusakan: ${locationType} \n` +
    `- Tanggal Lapor: ${reportDate}\n\n` +
    `Keterangan Kerusakan:`
  );
}

/** Hapus bagian template/header jika tanpa sengaja ikut tertulis di notes */
function stripTemplateFromText(text: string, header: string) {
  if (!text) return "";
  const marker = "Keterangan Kerusakan:";
  const idx = text.indexOf(marker);
  if (idx >= 0) {
    // Ambil hanya isi setelah marker
    const after = text.slice(idx + marker.length);
    return after.replace(/^\s*\n?/, "");
  }
  // Jika notes kebetulan diawali oleh header yang sama, potong
  const headerEsc = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp("^" + headerEsc + "\\s*", "m");
  if (re.test(text)) {
    return text.replace(re, "");
  }
  return text;
}

/** Compose final message (header + cleaned notes) */
function composeFinalMessage(header: string, notes: string) {
  const cleaned = stripTemplateFromText(notes, header).trim();
  return cleaned ? `${header}\n\n${cleaned}` : header;
}

function compactForWhatsApp(text: string) {
  return text
    .replace(/\r\n/g, "\n") // normalisasi EOL
    .replace(/\n{2,}/g, "\n") // lipat >1 newline jadi 1
    .replace(/[ \t]+\n/g, "\n") // hilangkan spasi sebelum newline
    .trim();
}

/* ================== Page ================== */
export default function DamageComplainPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const jobId = searchParams.get("job") || "001";
  const [technicianName, setTechnicianName] = useState("Ahmad Teknisi");

  // Vehicles
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [brand, setBrand] = useState("");
  const [type, setType] = useState("");
  const [plate, setPlate] = useState("");

  // Damage info
  const [locationType, setLocationType] = useState<
    "" | "External" | "Internal"
  >("");
  const [reportDate, setReportDate] = useState(todayISO());

  // Reason text handling (user-only)
  const [notes, setNotes] = useState("");
  const [forceShowTemplate, setForceShowTemplate] = useState(false);

  // Load technician + vehicles from localStorage (or fallback)
  useEffect(() => {
    if (typeof window === "undefined") return;

    const storedName =
      localStorage.getItem("technicianName") || "Ahmad Teknisi";
    setTechnicianName(storedName);

    const raw = localStorage.getItem("technicianVehicles");
    let parsed: VehicleInput[] | null = null;
    try {
      parsed = raw ? (JSON.parse(raw) as VehicleInput[]) : null;
    } catch {
      parsed = null;
    }
    const norm = parsed
      ? normalizeVehicles(parsed)
      : normalizeVehicles(["TOYOTA AVANZA L 1992 KK"]); // fallback example
    setVehicles(norm);
  }, []);

  // Auto-selects if only one vehicle available
  useEffect(() => {
    if (vehicles.length === 1) {
      const v = vehicles[0];
      setBrand(v.brand);
      setType(v.type);
      setPlate(v.plate);
    } else {
      if (brand && !vehicles.some((v) => v.brand === brand)) setBrand("");
      if (type && !vehicles.some((v) => v.brand === brand && v.type === type))
        setType("");
      if (
        plate &&
        !vehicles.some(
          (v) => v.brand === brand && v.type === type && v.plate === plate
        )
      )
        setPlate("");
    }
  }, [vehicles]); // eslint-disable-line react-hooks/exhaustive-deps

  // Options filtered step-by-step
  const brandOptions = useMemo(() => {
    const set = new Set(vehicles.map((v) => v.brand));
    return Array.from(set);
  }, [vehicles]);

  const typeOptions = useMemo(() => {
    const set = new Set(
      vehicles
        .filter((v) => (brand ? v.brand === brand : true))
        .map((v) => v.type)
    );
    return Array.from(set);
  }, [vehicles, brand]);

  const plateOptions = useMemo(() => {
    const set = new Set(
      vehicles
        .filter((v) => (brand ? v.brand === brand : true))
        .filter((v) => (type ? v.type === type : true))
        .map((v) => v.plate)
    );
    return Array.from(set);
  }, [vehicles, brand, type]);

  const isSingleVehicle = vehicles.length === 1;
  const readyForTemplate =
    !!brand && !!type && !!plate && !!locationType && !!reportDate;

  // Build header and display text (what user sees)
  const header = readyForTemplate
    ? buildHeaderMessage({
        technicianName,
        jobId,
        brand,
        type,
        plate,
        locationType: locationType as "External" | "Internal",
        reportDate,
      })
    : "";

  // Text yang tampil di textarea: header + notes (cleaned) jika siap template
  const displayText = readyForTemplate
    ? `${header}${notes ? " " + notes : " "}` // tampil rapat: header + satu spasi + notes
    : notes;

  useEffect(() => {
    if (!readyForTemplate) {
      setForceShowTemplate(false);
      return;
    }
    setForceShowTemplate(true);
  }, [readyForTemplate]);

  useEffect(() => {
    if (brand && !typeOptions.includes(type)) setType("");
  }, [brand, typeOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (type && !plateOptions.includes(plate)) setPlate("");
  }, [type, plateOptions]); // eslint-disable-line react-hooks/exhaustive-deps

  const isFormValid = readyForTemplate && displayText.trim().length > 0;

  // ===== Admin contacts (placeholder, ganti sesuai kebutuhan) =====
  const adminWhatsAppNumber = "6285859868295";
  const adminEmail = "admin@example.com";

  // Utility to try opening a new tab/window
  function openInNewTab(url: string) {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    return !!w;
  }

  // ===== Single "Send" handler: WA + Gmail + Outlook + mailto (no duplicate text) =====
  function handleSendAll() {
    if (!isFormValid) return;

    const messageForEmail = composeFinalMessage(header, notes);
    const messageForWhatsApp = compactForWhatsApp(messageForEmail); // <= pakai versi compact utk WA

    const subject = encodeURIComponent(
      `Pelaporan Kerusakan Kendaraan - ${jobId}`
    );
    const body = encodeURIComponent(messageForEmail);

    const waUrl = `https://wa.me/${adminWhatsAppNumber}?text=${encodeURIComponent(
      messageForWhatsApp
    )}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
      adminEmail
    )}&su=${subject}&body=${body}`;
    const outlookUrl = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(
      adminEmail
    )}&subject=${subject}&body=${body}`;
    const mailtoUrl = `mailto:${encodeURIComponent(
      adminEmail
    )}?subject=${subject}&body=${body}`;

    openInNewTab(waUrl);
    openInNewTab(gmailUrl);
    openInNewTab(outlookUrl);
    setTimeout(() => {
      window.location.href = mailtoUrl;
    }, 350);
  }

  // Textarea onChange: kalau template ready, simpan hanya isi setelah marker; kalau belum, simpan raw
  function handleTextareaChange(v: string) {
    if (!readyForTemplate) {
      setNotes(v);
      return;
    }
    const cleaned = stripTemplateFromText(v, header);
    setNotes(cleaned);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <TechnicianHeader
        title="Lapor Kerusakan"
        showBackButton={true}
        backUrl="/user/dashboard"
      />

      <main className="p-4">
        <div className="max-w-md mx-auto">
          <Card>
            <CardContent className="p-6 space-y-6">
              {/* 1. Merk Kendaraan */}
              <div className="space-y-2">
                <Label>Merk Kendaraan</Label>
                {isSingleVehicle || brandOptions.length <= 1 ? (
                  <Input value={brand} readOnly placeholder="Merk otomatis" />
                ) : (
                  <Select value={brand} onValueChange={(val) => setBrand(val)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih merk kendaraan" />
                    </SelectTrigger>
                    <SelectContent>
                      {brandOptions.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 2. Tipe Kendaraan */}
              <div className="space-y-2">
                <Label>Tipe Kendaraan</Label>
                {isSingleVehicle || typeOptions.length <= 1 ? (
                  <Input value={type} readOnly placeholder="Tipe otomatis" />
                ) : (
                  <Select
                    value={type}
                    onValueChange={(val) => setType(val)}
                    disabled={!brand}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          brand
                            ? "Pilih tipe kendaraan"
                            : "Pilih merk terlebih dahulu"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {typeOptions.map((t) => (
                        <SelectItem key={t} value={t}>
                          {t}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 3. No Polisi */}
              <div className="space-y-2">
                <Label>No Polisi</Label>
                {isSingleVehicle || plateOptions.length <= 1 ? (
                  <Input
                    value={plate}
                    readOnly
                    placeholder="No Polisi otomatis"
                  />
                ) : (
                  <Select
                    value={plate}
                    onValueChange={(val) => setPlate(val)}
                    disabled={!brand || !type}
                  >
                    <SelectTrigger>
                      <SelectValue
                        placeholder={
                          brand && type
                            ? "Pilih No Polisi"
                            : "Pilih Merk & Tipe terlebih dahulu"
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {plateOptions.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* 4. Letak Kerusakan */}
              <div className="space-y-2">
                <Label>Letak Kerusakan</Label>
                <Select
                  value={locationType}
                  onValueChange={(val: "External" | "Internal") =>
                    setLocationType(val)
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Pilih letak (External/Internal)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="External">External</SelectItem>
                    <SelectItem value="Internal">Internal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* 5. Tanggal Lapor */}
              <div className="space-y-2">
                <Label>Tanggal Lapor</Label>
                <Input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </div>

              {/* 6. Alasan (template otomatis jika 1-5 lengkap) */}
              <div className="space-y-2">
                <Label>Alasan</Label>
                <Textarea
                  value={displayText}
                  onChange={(e) => handleTextareaChange(e.target.value)}
                  className="min-h-[220px] resize-none"
                  placeholder="Tulis alasan/penjelasan kerusakan..."
                />
                {!forceShowTemplate && (
                  <p className="text-xs text-gray-500">
                    Template akan muncul otomatis setelah Merk, Tipe, No Polisi,
                    Letak, dan Tanggal terisi.
                  </p>
                )}
              </div>

              {/* 7. Satu tombol: WA + Gmail + Outlook + Mailto */}
              <div className="space-y-3 pt-2">
                <Button
                  onClick={handleSendAll}
                  disabled={!isFormValid}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Kirim Laporan (WA + Email)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
