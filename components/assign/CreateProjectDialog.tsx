"use client";
import React, { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  UIProject,
  DbProjectWithStats,
  ProjectCategory,
  NewProjectForm,
  NewSurveyProjectForm,
  TemplateOption,
} from "./types";
import { formatDateDDMMYYYY } from "./helpers";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { apiFetch } from "@/lib/apiFetch";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (p: UIProject) => void; // callback setelah sukses create
};

export default function CreateProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: Props) {
  const [isSaving, setIsSaving] = useState(false);
  const [dateErr, setDateErr] = useState("");
  const [tmplErr, setTmplErr] = useState("");
  const [projectCategory, setProjectCategory] = useState<ProjectCategory>(null);
  const [templateOptions, setTemplateOptions] = useState<TemplateOption[]>([]);
  const [currentFloorPage, setCurrentFloorPage] = useState(1);
  const [paketCountInput, setPaketCountInput] = useState<string>("0");

  const [newProjectForm, setNewProjectForm] = useState<NewProjectForm>({
    namaProject: "",
    lokasi: "",
    namaSales: "",
    namaPresales: "",
    tanggalSpkUser: "",
    tanggalTerimaPo: "",
    tanggalMulaiProject: "",
    tanggalDeadlineProject: "",
    sigmaManDays: "",
    sigmaHari: "",
    sigmaTeknisi: "",
    tipeTemplate: "",
    durasi: "120",
    insentif: "2000",
    paketCount: 0,
    paketDetails: [],
  });

  const [newSurveyProjectForm, setNewSurveyProjectForm] =
    useState<NewSurveyProjectForm>({
      namaProject: "",
      namaGedung: "",
      lokasi: "",
      lantai: "",
      ruanganPerLantai: "",
      roomDetails: [],
      tanggalMulaiProject: "",
      tanggalDeadlineProject: "",
      totalHari: "",
      totalTeknisi: "",
      totalManDays: "",
      tipeTemplate: "",
    });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/report-templates", { cache: "no-store" });
        const json = await res.json();
        setTemplateOptions(json.items ?? []);
      } catch {
        setTemplateOptions([]);
      }
    })();
  }, []);

  const validateDates = (start: string, deadline: string) => {
    if (start && deadline) {
      const s = new Date(start);
      const d = new Date(deadline);
      if (d < s) {
        setDateErr(
          "Tanggal deadline harus sama atau setelah tanggal mulai project"
        );
        return false;
      }
    }
    setDateErr("");
    return true;
  };

  // Survey: generate rooms per floor
  const generateRoomDetails = (floors: number, roomsPerFloor: number) => {
    const details: Array<{ floor: number; rooms: string[] }> = [];
    for (let floor = 1; floor <= floors; floor++) {
      const rooms: string[] = [];
      for (let room = 1; room <= roomsPerFloor; room++) {
        rooms.push(`Ruangan #${room}`);
      }
      details.push({ floor, rooms });
    }
    setCurrentFloorPage(1);
    return details;
  };

  useEffect(() => {
    const f = parseInt(newSurveyProjectForm.lantai || "0", 10);
    const r = parseInt(newSurveyProjectForm.ruanganPerLantai || "0", 10);
    if (f > 0 && r > 0) {
      const newDetails = generateRoomDetails(f, r);
      setNewSurveyProjectForm((prev) => ({ ...prev, roomDetails: newDetails }));
    } else if (newSurveyProjectForm.roomDetails.length) {
      setNewSurveyProjectForm((prev) => ({ ...prev, roomDetails: [] }));
    }
  }, [newSurveyProjectForm.lantai, newSurveyProjectForm.ruanganPerLantai]);

  const PER_COL = 5;
  const paketGroups = (() => {
    const details = newProjectForm.paketDetails ?? [];
    const groups: {
      start: number;
      items: Array<{ rw: string; rt: string }>;
    }[] = [];
    for (let start = 0; start < details.length; start += PER_COL) {
      groups.push({ start, items: details.slice(start, start + PER_COL) });
    }
    return groups;
  })();

  const setPaketCount = (count: number) => {
    const n = Math.max(0, Math.min(30, Math.floor(count || 0)));
    setNewProjectForm((prev) => {
      const nextDetails = [...(prev.paketDetails ?? [])];
      if (n > nextDetails.length) {
        for (let i = nextDetails.length; i < n; i++)
          nextDetails.push({ rw: "", rt: "" });
      } else {
        nextDetails.length = n;
      }
      return { ...prev, paketCount: n, paketDetails: nextDetails };
    });
  };
  const handlePaketInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === "") {
      setPaketCountInput("");
      setPaketCount(0);
      return;
    }
    if (!/^\d+$/.test(raw)) return;
    const normalized = String(parseInt(raw, 10));
    const clamped = Math.min(30, Math.max(0, parseInt(normalized, 10)));
    setPaketCountInput(normalized);
    setPaketCount(clamped);
  };
  const updatePaketDetail = (
    idx: number,
    field: "rw" | "rt",
    value: string
  ) => {
    setNewProjectForm((prev) => {
      const next = [...(prev.paketDetails ?? [])];
      if (!next[idx]) next[idx] = { rw: "", rt: "" };
      next[idx] = { ...next[idx], [field]: value };
      return { ...prev, paketDetails: next };
    });
  };

  const resetAll = () => {
    setProjectCategory(null);
    setDateErr("");
    setTmplErr("");
    setIsSaving(false);
    setNewProjectForm({
      namaProject: "",
      lokasi: "",
      namaSales: "",
      namaPresales: "",
      tanggalSpkUser: "",
      tanggalTerimaPo: "",
      tanggalMulaiProject: "",
      tanggalDeadlineProject: "",
      sigmaManDays: "",
      sigmaHari: "",
      sigmaTeknisi: "",
      tipeTemplate: "",
      durasi: "120",
      insentif: "2000",
      paketCount: 0,
      paketDetails: [],
    });
    setPaketCountInput("0");
    setNewSurveyProjectForm({
      namaProject: "",
      namaGedung: "",
      lokasi: "",
      lantai: "",
      ruanganPerLantai: "",
      roomDetails: [],
      tanggalMulaiProject: "",
      tanggalDeadlineProject: "",
      totalHari: "",
      totalTeknisi: "",
      totalManDays: "",
      tipeTemplate: "",
    });
  };

  const buildUIProject = (p: DbProjectWithStats): UIProject => ({
    id: p.id,
    name: p.name,
    manPower: p.sigma_teknisi ?? 0,
    jamDatang: p.jam_datang ? String(p.jam_datang).slice(0, 5) : "08:00",
    jamPulang: p.jam_pulang ? String(p.jam_pulang).slice(0, 5) : "17:00",
    jobId: p.job_id,
    duration: p.sigma_hari ?? 0,
    daysElapsed: p.days_elapsed ?? 0,
    status: p.status,
    projectStatus: p.project_status,
    pendingReason: p.pending_reason ?? "",
    sigmaHari: p.sigma_hari ?? 0,
    sigmaTeknisi: p.sigma_teknisi ?? 0,
    sigmaManDays: String(p.sigma_man_days ?? 0),
    actualManDays: p.actual_man_days ?? 0,
    sales: p.sales ?? p.sales_name ?? p.nama_sales ?? "",
  });

  const submitInstalasi = async () => {
    if (
      !newProjectForm.namaProject ||
      !newProjectForm.tanggalMulaiProject ||
      !newProjectForm.tanggalDeadlineProject ||
      !newProjectForm.sigmaManDays ||
      !newProjectForm.sigmaHari ||
      !newProjectForm.sigmaTeknisi
    )
      return;

    if (!newProjectForm.tipeTemplate) {
      setTmplErr("Harap pilih tipe template");
      return;
    }
    if (
      !validateDates(
        newProjectForm.tanggalMulaiProject,
        newProjectForm.tanggalDeadlineProject
      )
    )
      return;

    setTmplErr("");

    try {
      setIsSaving(true);
      const payload = {
        namaProject: newProjectForm.namaProject || null,
        lokasi: newProjectForm.lokasi || null,
        namaSales: newProjectForm.namaSales || null,
        namaPresales: newProjectForm.namaPresales || null,
        tanggalSpkUser: newProjectForm.tanggalSpkUser || null,
        tanggalTerimaPo: newProjectForm.tanggalTerimaPo || null,
        tanggalMulaiProject: newProjectForm.tanggalMulaiProject,
        tanggalDeadlineProject: newProjectForm.tanggalDeadlineProject,
        sigmaManDays: Number(newProjectForm.sigmaManDays),
        sigmaHari: Number(newProjectForm.sigmaHari),
        sigmaTeknisi: Number(newProjectForm.sigmaTeknisi),
        templateKey: newProjectForm.tipeTemplate,
        durasiMinutes: newProjectForm.durasi
          ? Number(newProjectForm.durasi)
          : undefined,
        insentif: newProjectForm.insentif
          ? Number(newProjectForm.insentif)
          : undefined,
        paketDetails:
          (newProjectForm.paketDetails ?? []).map((p, idx) => ({
            seq: idx + 1,
            rw: p.rw || null,
            rt: p.rt || null,
          })) ?? [],
      };

      const res = await apiFetch<{ data: DbProjectWithStats }>(
        "/api/projects",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      const p = (res as any).data ?? res;
      onCreated(buildUIProject(p));
      onOpenChange(false);
      resetAll();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Gagal membuat project");
    } finally {
      setIsSaving(false);
    }
  };

  const submitSurvey = async () => {
    if (
      !newSurveyProjectForm.namaProject ||
      !newSurveyProjectForm.namaGedung ||
      !newSurveyProjectForm.lokasi ||
      !newSurveyProjectForm.tanggalMulaiProject ||
      !newSurveyProjectForm.tanggalDeadlineProject ||
      !newSurveyProjectForm.totalHari ||
      !newSurveyProjectForm.totalTeknisi ||
      !newSurveyProjectForm.totalManDays ||
      !newSurveyProjectForm.tipeTemplate
    )
      return;

    if (
      !validateDates(
        newSurveyProjectForm.tanggalMulaiProject,
        newSurveyProjectForm.tanggalDeadlineProject
      )
    )
      return;

    try {
      setIsSaving(true);
      const payload = {
        namaProject: newSurveyProjectForm.namaProject,
        namaGedung: newSurveyProjectForm.namaGedung,
        lokasi: newSurveyProjectForm.lokasi,
        tanggalMulaiProject: newSurveyProjectForm.tanggalMulaiProject,
        tanggalDeadlineProject: newSurveyProjectForm.tanggalDeadlineProject,
        totalHari: Number(newSurveyProjectForm.totalHari),
        totalTeknisi: Number(newSurveyProjectForm.totalTeknisi),
        totalManDays: Number(newSurveyProjectForm.totalManDays),
        tipeTemplate: newSurveyProjectForm.tipeTemplate,
        roomDetails: newSurveyProjectForm.roomDetails ?? [],
      };

      const res = await apiFetch<{ data: DbProjectWithStats }>(
        "/api/projects/survey",
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );

      const p = (res as any).data ?? res;
      onCreated(buildUIProject(p));
      onOpenChange(false);
      resetAll();
    } catch (err: any) {
      console.error(err);
      alert(err?.message || "Gagal membuat project survey");
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateClick = () => {
    if (projectCategory === "survey") submitSurvey();
    else submitInstalasi();
  };

  const canCreate =
    projectCategory === "survey"
      ? !!newSurveyProjectForm.namaProject &&
        !!newSurveyProjectForm.namaGedung &&
        !!newSurveyProjectForm.lokasi &&
        !!newSurveyProjectForm.tanggalMulaiProject &&
        !!newSurveyProjectForm.tanggalDeadlineProject &&
        !!newSurveyProjectForm.totalManDays &&
        !!newSurveyProjectForm.totalHari &&
        !!newSurveyProjectForm.totalTeknisi &&
        !!newSurveyProjectForm.tipeTemplate &&
        !dateErr
      : !!newProjectForm.namaProject &&
        !!newProjectForm.tanggalMulaiProject &&
        !!newProjectForm.tanggalDeadlineProject &&
        !!newProjectForm.sigmaManDays &&
        !!newProjectForm.sigmaHari &&
        !!newProjectForm.sigmaTeknisi &&
        !!newProjectForm.tipeTemplate &&
        !dateErr;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) resetAll();
      }}
    >
      <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between">
            <div className="flex flex-col gap-4">
              <DialogTitle>Buat Project Baru</DialogTitle>
              <div className="flex gap-2">
                <Button
                  variant={
                    projectCategory === "instalasi" ? "default" : "outline"
                  }
                  onClick={() => setProjectCategory("instalasi")}
                  size="sm"
                >
                  Instalasi
                </Button>
                <Button
                  variant={projectCategory === "survey" ? "default" : "outline"}
                  onClick={() => setProjectCategory("survey")}
                  size="sm"
                >
                  Survey
                </Button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2 mr-6">
              <Button
                onClick={handleCreateClick}
                disabled={isSaving || !canCreate}
                className="bg-green-600 hover:bg-green-700"
                size="sm"
              >
                {isSaving ? "Menyimpan..." : "Buat Project"}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* ===== INSTALASI ===== */}
        {projectCategory === "instalasi" && (
          <div className="grid gap-4 py-2">
            {/* Nama, lokasi */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaProject" className="min-w-[140px]">
                Nama Project<span className="text-red-500">*</span>
              </Label>
              <input
                id="namaProject"
                type="text"
                value={newProjectForm.namaProject}
                onChange={(e) =>
                  setNewProjectForm({
                    ...newProjectForm,
                    namaProject: e.target.value,
                  })
                }
                placeholder="Format: NamaBarang_NamaInstansi_Lokasi"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="lokasi" className="min-w-[140px]">
                Lokasi
              </Label>
              <div className="flex-1">
                <input
                  id="lokasi"
                  type="text"
                  value={newProjectForm.lokasi}
                  onChange={(e) =>
                    setNewProjectForm({
                      ...newProjectForm,
                      lokasi: e.target.value,
                    })
                  }
                  placeholder="Contoh: Bank Mandiri Darmo"
                  maxLength={140}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maksimal 140 karakter ({newProjectForm.lokasi.length}/140)
                </p>
              </div>
            </div>

            {/* Paket */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="paket" className="min-w-[140px]">
                Paket <span className="text-red-500">*</span>
              </Label>
              <input
                id="paket"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={paketCountInput}
                onChange={handlePaketInputChange}
                placeholder="Jumlah paket (0–30)"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">
                  Detail Paket (RW / RT)
                </span>
                <span className="text-xs text-gray-500">
                  {newProjectForm.paketCount} paket
                </span>
              </div>
              {newProjectForm.paketCount === 0 ? (
                <p className="text-xs text-gray-500">
                  Atur jumlah paket untuk menampilkan sub-field RW/RT.
                </p>
              ) : (
                <div
                  className="grid gap-4"
                  style={{
                    gridTemplateColumns: `repeat(${paketGroups.length}, minmax(0, 1fr))`,
                  }}
                >
                  {paketGroups.map((group, colIdx) => (
                    <div key={colIdx} className="space-y-3">
                      {group.items.map((p, idxInCol) => {
                        const absoluteIndex = group.start + idxInCol;
                        return (
                          <div
                            key={absoluteIndex}
                            className="grid grid-cols-3 gap-2 items-center"
                          >
                            <div className="text-xs font-medium text-gray-700">
                              Paket #{absoluteIndex + 1}
                            </div>
                            <input
                              type="text"
                              placeholder="RW"
                              value={p.rw}
                              onChange={(e) =>
                                updatePaketDetail(
                                  absoluteIndex,
                                  "rw",
                                  e.target.value
                                )
                              }
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                            />
                            <input
                              type="text"
                              placeholder="RT"
                              value={p.rt}
                              onChange={(e) =>
                                updatePaketDetail(
                                  absoluteIndex,
                                  "rt",
                                  e.target.value
                                )
                              }
                              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                            />
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Sales / Presales */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaSales" className="min-w-[140px]">
                Nama Sales <span className="text-red-500">*</span>
              </Label>
              <input
                id="namaSales"
                type="text"
                value={newProjectForm.namaSales}
                onChange={(e) =>
                  setNewProjectForm({
                    ...newProjectForm,
                    namaSales: e.target.value,
                  })
                }
                placeholder="Masukkan nama sales"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaPresales" className="min-w-[140px]">
                Nama Presales
              </Label>
              <input
                id="namaPresales"
                type="text"
                value={newProjectForm.namaPresales}
                onChange={(e) =>
                  setNewProjectForm({
                    ...newProjectForm,
                    namaPresales: e.target.value,
                  })
                }
                placeholder="Masukkan nama presales"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>

            {/* Dates & Numbers */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="tanggalSpkUser" className="min-w-[120px]">
                    Tanggal SPK User
                  </Label>
                  <input
                    id="tanggalSpkUser"
                    type="date"
                    value={newProjectForm.tanggalSpkUser}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        tanggalSpkUser: e.target.value,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label
                    htmlFor="tanggalMulaiProject"
                    className="min-w-[120px]"
                  >
                    Tanggal Mulai Instalasi{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="tanggalMulaiProject"
                    type="date"
                    value={newProjectForm.tanggalMulaiProject}
                    onChange={(e) => {
                      setNewProjectForm({
                        ...newProjectForm,
                        tanggalMulaiProject: e.target.value,
                      });
                      validateDates(
                        e.target.value,
                        newProjectForm.tanggalDeadlineProject
                      );
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaManDays" className="min-w-[120px]">
                    Man Days <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaManDays"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaManDays}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        sigmaManDays: e.target.value,
                      })
                    }
                    placeholder="Target Man Days"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaTeknisi" className="min-w-[120px]">
                    Total Teknisi <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaTeknisi"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaTeknisi}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        sigmaTeknisi: e.target.value,
                      })
                    }
                    placeholder="Jumlah Teknisi"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="durasi" className="min-w-[120px]">
                    Durasi <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="durasi"
                    type="number"
                    min="1"
                    value={newProjectForm.durasi}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        durasi: e.target.value,
                      })
                    }
                    placeholder="Durasi pengumpulan foto (menit)"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="tanggalTerimaPo" className="min-w-[120px]">
                    Tanggal Terima PO
                  </Label>
                  <input
                    id="tanggalTerimaPo"
                    type="date"
                    value={newProjectForm.tanggalTerimaPo}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        tanggalTerimaPo: e.target.value,
                      })
                    }
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label
                    htmlFor="tanggalDeadlineProject"
                    className="min-w-[120px] md:mt-2"
                  >
                    Tanggal Deadline Instalasi{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <input
                      id="tanggalDeadlineProject"
                      type="date"
                      value={newProjectForm.tanggalDeadlineProject}
                      onChange={(e) => {
                        setNewProjectForm({
                          ...newProjectForm,
                          tanggalDeadlineProject: e.target.value,
                        });
                        validateDates(
                          newProjectForm.tanggalMulaiProject,
                          e.target.value
                        );
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
                        dateErr ? "border-red-500" : "border-input"
                      }`}
                      required
                    />
                    {dateErr && (
                      <p className="text-xs text-red-500 mt-1">{dateErr}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="sigmaHari" className="min-w-[120px]">
                    Total Hari <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="sigmaHari"
                    type="number"
                    min="0"
                    value={newProjectForm.sigmaHari}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        sigmaHari: e.target.value,
                      })
                    }
                    placeholder="Durasi Project (Hari)"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label
                    htmlFor="tipeTemplate"
                    className="min-w-[120px] md:mt-2"
                  >
                    Tipe Template <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <select
                      id="tipeTemplate"
                      value={newProjectForm.tipeTemplate}
                      onChange={(e) => {
                        setNewProjectForm({
                          ...newProjectForm,
                          tipeTemplate: e.target.value,
                        });
                        if (e.target.value) setTmplErr("");
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
                        tmplErr ? "border-red-500" : "border-input"
                      }`}
                      required
                    >
                      <option value="" disabled>
                        Pilih Tipe Template
                      </option>
                      {templateOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {tmplErr && (
                      <p className="text-xs text-red-500 mt-1">{tmplErr}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="insentif" className="min-w-[120px]">
                    Insentif <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="insentif"
                    type="number"
                    min="1"
                    value={newProjectForm.insentif}
                    onChange={(e) =>
                      setNewProjectForm({
                        ...newProjectForm,
                        insentif: e.target.value,
                      })
                    }
                    placeholder="Insentif Per Project"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== SURVEY ===== */}
        {projectCategory === "survey" && (
          <div className="grid gap-4 py-2">
            {/* Nama, lokasi */}
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="surveyNamaProject" className="min-w-[140px]">
                Nama Project<span className="text-red-500">*</span>
              </Label>
              <input
                id="surveyNamaProject"
                type="text"
                value={newSurveyProjectForm.namaProject}
                onChange={(e) =>
                  setNewSurveyProjectForm({
                    ...newSurveyProjectForm,
                    namaProject: e.target.value,
                  })
                }
                placeholder="Format: Survey_NamaGedung_Lokasi"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="namaGedung" className="min-w-[140px]">
                Nama Gedung<span className="text-red-500">*</span>
              </Label>
              <input
                id="namaGedung"
                type="text"
                value={newSurveyProjectForm.namaGedung}
                onChange={(e) =>
                  setNewSurveyProjectForm({
                    ...newSurveyProjectForm,
                    namaGedung: e.target.value,
                  })
                }
                placeholder="Contoh: Gedung Grahadi"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="flex flex-col md:flex-row md:items-center gap-2">
              <Label htmlFor="surveyLokasi" className="min-w-[140px]">
                Lokasi<span className="text-red-500">*</span>
              </Label>
              <div className="flex-1">
                <input
                  id="surveyLokasi"
                  type="text"
                  value={newSurveyProjectForm.lokasi}
                  onChange={(e) =>
                    setNewSurveyProjectForm({
                      ...newSurveyProjectForm,
                      lokasi: e.target.value,
                    })
                  }
                  placeholder="Contoh: Jl. Tunjungan Surabaya"
                  maxLength={140}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Maksimal 140 karakter ({newSurveyProjectForm.lokasi.length}
                  /140)
                </p>
              </div>
            </div>

            {/* Floor detail */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <Label htmlFor="lantai" className="min-w-[120px]">
                  Lantai<span className="text-red-500">*</span>
                </Label>
                <input
                  id="lantai"
                  type="number"
                  min="1"
                  value={newSurveyProjectForm.lantai}
                  onChange={(e) =>
                    setNewSurveyProjectForm({
                      ...newSurveyProjectForm,
                      lantai: e.target.value,
                    })
                  }
                  placeholder="Jumlah lantai"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
              <div className="flex flex-col md:flex-row md:items-center gap-2">
                <Label htmlFor="ruanganPerLantai" className="min-w-[120px]">
                  Ruangan per Lantai<span className="text-red-500">*</span>
                </Label>
                <input
                  id="ruanganPerLantai"
                  type="number"
                  min="1"
                  value={newSurveyProjectForm.ruanganPerLantai}
                  onChange={(e) =>
                    setNewSurveyProjectForm({
                      ...newSurveyProjectForm,
                      ruanganPerLantai: e.target.value,
                    })
                  }
                  placeholder="Ruangan per lantai"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  required
                />
              </div>
            </div>

            {newSurveyProjectForm.roomDetails.length > 0 && (
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-medium">
                      Detail Ruangan (per Lantai)
                    </h3>
                    {newSurveyProjectForm.roomDetails.length > 1 && (
                      <div className="flex items-center gap-1 ml-4">
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentFloorPage((p) => Math.max(1, p - 1))
                          }
                          disabled={currentFloorPage === 1}
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronLeft className="h-3 w-3" />
                        </button>
                        <span className="text-xs font-medium text-gray-600 px-1">
                          {currentFloorPage}/
                          {newSurveyProjectForm.roomDetails.length}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setCurrentFloorPage((p) =>
                              Math.min(
                                newSurveyProjectForm.roomDetails.length || 1,
                                p + 1
                              )
                            )
                          }
                          disabled={
                            currentFloorPage ===
                            newSurveyProjectForm.roomDetails.length
                          }
                          className="p-1 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-6">
                  {newSurveyProjectForm.roomDetails
                    .filter((_, idx) => idx === currentFloorPage - 1)
                    .map((floor, _) => {
                      const actualIndex = currentFloorPage - 1;
                      return (
                        <div key={floor.floor} className="space-y-3">
                          <h5 className="font-medium text-gray-800 border-b pb-1">
                            Lantai #{floor.floor}
                          </h5>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {floor.rooms.map((room, rIdx) => (
                              <div key={rIdx} className="flex flex-col gap-1">
                                <Label
                                  htmlFor={`room-${actualIndex}-${rIdx}`}
                                  className="text-xs text-gray-600"
                                >
                                  Ruangan #{rIdx + 1}
                                </Label>
                                <input
                                  id={`room-${actualIndex}-${rIdx}`}
                                  type="text"
                                  value={room}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setNewSurveyProjectForm((prev) => {
                                      const updated = [...prev.roomDetails];
                                      updated[actualIndex].rooms[rIdx] = val;
                                      return { ...prev, roomDetails: updated };
                                    });
                                  }}
                                  placeholder={`Nama ruangan ${rIdx + 1}`}
                                  className="flex h-8 w-full rounded-md border border-input bg-white px-2 py-1 text-xs"
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* Tanggal & angka */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="surveyTanggalMulai" className="min-w-[120px]">
                    Tanggal Mulai Project{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="surveyTanggalMulai"
                    type="date"
                    value={newSurveyProjectForm.tanggalMulaiProject}
                    onChange={(e) => {
                      setNewSurveyProjectForm({
                        ...newSurveyProjectForm,
                        tanggalMulaiProject: e.target.value,
                      });
                      validateDates(
                        e.target.value,
                        newSurveyProjectForm.tanggalDeadlineProject
                      );
                    }}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="totalHari" className="min-w-[120px]">
                    Total Hari <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="totalHari"
                    type="number"
                    min="0"
                    value={newSurveyProjectForm.totalHari}
                    onChange={(e) =>
                      setNewSurveyProjectForm({
                        ...newSurveyProjectForm,
                        totalHari: e.target.value,
                      })
                    }
                    placeholder="Durasi project (hari)"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="totalManDays" className="min-w-[120px]">
                    Total Man Days <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="totalManDays"
                    type="number"
                    min="0"
                    value={newSurveyProjectForm.totalManDays}
                    onChange={(e) =>
                      setNewSurveyProjectForm({
                        ...newSurveyProjectForm,
                        totalManDays: e.target.value,
                      })
                    }
                    placeholder="Target man days"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label
                    htmlFor="surveyTanggalDeadline"
                    className="min-w-[120px] md:mt-2"
                  >
                    Tanggal Deadline Project{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <input
                      id="surveyTanggalDeadline"
                      type="date"
                      value={newSurveyProjectForm.tanggalDeadlineProject}
                      onChange={(e) => {
                        setNewSurveyProjectForm({
                          ...newSurveyProjectForm,
                          tanggalDeadlineProject: e.target.value,
                        });
                        validateDates(
                          newSurveyProjectForm.tanggalMulaiProject,
                          e.target.value
                        );
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
                        dateErr ? "border-red-500" : "border-input"
                      }`}
                      required
                    />
                    {dateErr && (
                      <p className="text-xs text-red-500 mt-1">{dateErr}</p>
                    )}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row md:items-center gap-2">
                  <Label htmlFor="totalTeknisi" className="min-w-[120px]">
                    Total Teknisi <span className="text-red-500">*</span>
                  </Label>
                  <input
                    id="totalTeknisi"
                    type="number"
                    min="1"
                    value={newSurveyProjectForm.totalTeknisi}
                    onChange={(e) =>
                      setNewSurveyProjectForm({
                        ...newSurveyProjectForm,
                        totalTeknisi: e.target.value,
                      })
                    }
                    placeholder="Jumlah teknisi"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    required
                  />
                </div>
                <div className="flex flex-col md:flex-row md:items-start gap-2">
                  <Label
                    htmlFor="surveyTipeTemplate"
                    className="min-w-[120px] md:mt-2"
                  >
                    Tipe Template <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex-1">
                    <select
                      id="surveyTipeTemplate"
                      value={newSurveyProjectForm.tipeTemplate}
                      onChange={(e) => {
                        setNewSurveyProjectForm({
                          ...newSurveyProjectForm,
                          tipeTemplate: e.target.value,
                        });
                        if (e.target.value) setTmplErr("");
                      }}
                      className={`flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ${
                        tmplErr ? "border-red-500" : "border-input"
                      }`}
                      required
                    >
                      <option value="" disabled>
                        Pilih Tipe Template
                      </option>
                      {templateOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {tmplErr && (
                      <p className="text-xs text-red-500 mt-1">{tmplErr}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
