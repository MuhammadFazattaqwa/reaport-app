"use client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EditProjectForm, ProjectStatus, UIProject } from "./types";
import React from "react";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectsData: UIProject[];
  form: EditProjectForm;
  setForm: (u: EditProjectForm) => void;
  onSubmit: () => void;
  loading: boolean;
};

export default function EditProjectDialog({
  open,
  onOpenChange,
  projectsData,
  form,
  setForm,
  onSubmit,
  loading,
}: Props) {
  const pendingInvalid =
    form.status === "pending" && form.reason.trim().length < 5;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Edit Project</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="project-select" className="flex items-center gap-1">
              Nama Project<span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.projectId}
              onValueChange={(value) => setForm({ ...form, projectId: value })}
              disabled={form.isReadOnlyProject}
            >
              <SelectTrigger
                className={form.isReadOnlyProject ? "bg-gray-100" : ""}
              >
                <SelectValue placeholder="Pilih project yang akan diedit" />
              </SelectTrigger>
              <SelectContent>
                {projectsData.map((p, i) => (
                  <SelectItem key={`${p.id}-${p.jobId}-${i}`} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.isReadOnlyProject && (
              <div className="text-xs text-gray-500">
                Project dipilih otomatis. Gunakan tombol "Edit Project" di
                header untuk mengganti project.
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="status-select" className="flex items-center gap-1">
              Ganti Status<span className="text-red-500">*</span>
            </Label>
            <Select
              value={form.status}
              onValueChange={(value: ProjectStatus) =>
                setForm({ ...form, status: value })
              }
            >
              <SelectTrigger autoFocus={form.isReadOnlyProject}>
                <SelectValue placeholder="Pilih status baru" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">
                  Belum Diassign (Abu-abu)
                </SelectItem>
                <SelectItem value="ongoing">Berlangsung (Hijau)</SelectItem>
                <SelectItem value="pending">Pending (Kuning)</SelectItem>
                <SelectItem value="awaiting_bast">
                  Menunggu Persetujuan BAST (Indigo)
                </SelectItem>
                <SelectItem value="completed">Selesai</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.status === "pending" && (
            <div className="grid gap-2">
              <Label
                htmlFor="pending-reason"
                className="flex items-center gap-1"
              >
                Alasan Pending<span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="pending-reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Masukkan alasan mengapa project di-pending..."
                className="min-h-[80px] resize-none"
                maxLength={300}
                onKeyDown={(e) => {
                  if (e.key === "Escape") onOpenChange(false);
                  if (e.key === "Enter" && e.ctrlKey) onSubmit();
                }}
              />
              <div className="text-xs text-gray-500 text-right">
                {form.reason.length}/300 karakter
              </div>
              {form.reason.length > 0 && pendingInvalid && (
                <div className="text-xs text-red-500">
                  Alasan minimal 5 karakter
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              setForm({
                projectId: "",
                status: "unassigned",
                reason: "",
                isReadOnlyProject: false,
              });
            }}
          >
            Batal
          </Button>
          <Button
            onClick={onSubmit}
            disabled={
              !form.projectId || !form.status || pendingInvalid || loading
            }
            className="bg-orange-600 hover:bg-orange-700"
          >
            {loading ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
