export type ProjectStatus =
  | "unassigned"
  | "ongoing"
  | "pending"
  | "awaiting_bast"
  | "completed";

export type ProgressStatus = "ongoing" | "completed" | "overdue";
export type ProjectCategory = "instalasi" | "survey" | null;

export type UITechnician = { id: string; name: string; inisial: string };

export type DbProjectWithStats = {
  id: string;
  job_id: string;
  name: string;
  lokasi: string | null;
  status: ProgressStatus;
  project_status: ProjectStatus;
  pending_reason: string | null;
  sigma_hari: number | null;
  sigma_teknisi: number | null;
  sigma_man_days: number | null;
  jam_datang: string | null;
  jam_pulang: string | null;
  days_elapsed: number | null;
  created_at: string;
  assignment_count: number;
  leader_count: number;
  actual_man_days: number | null;
  sales?: string | null;
  sales_name?: string | null;
  nama_sales?: string | null;
};

export type UIProject = {
  id: string;
  name: string;
  manPower: number;
  jamDatang: string;
  jamPulang: string;
  jobId: string;
  duration: number;
  daysElapsed: number;
  status: ProgressStatus;
  projectStatus: ProjectStatus;
  pendingReason: string;
  sigmaHari: number;
  sigmaTeknisi: number;
  sigmaManDays: string;
  actualManDays: number;
  sales?: string;
};

export interface CellAssignment {
  projectId: string;
  technicianId: string;
  isSelected: boolean;
  inisial?: string;
  isProjectLeader?: boolean;
}

export interface NewProjectForm {
  namaProject: string;
  lokasi: string;
  namaSales: string;
  namaPresales: string;
  tanggalSpkUser: string;
  tanggalTerimaPo: string;
  tanggalMulaiProject: string;
  tanggalDeadlineProject: string;
  sigmaManDays: string;
  sigmaHari: string;
  sigmaTeknisi: string;
  tipeTemplate: string;
  durasi?: string;
  insentif?: string;
  paketCount?: number;
  paketDetails?: Array<{ rw: string; rt: string }>;
}

export interface NewSurveyProjectForm {
  namaProject: string;
  namaGedung: string;
  lokasi: string;
  lantai: string;
  ruanganPerLantai: string;
  roomDetails: Array<{ floor: number; rooms: string[] }>;
  tanggalMulaiProject: string;
  tanggalDeadlineProject: string;
  totalHari: string;
  totalTeknisi: string;
  totalManDays: string;
  tipeTemplate: string;
}

export interface EditProjectForm {
  projectId: string;
  status: ProjectStatus;
  reason: string;
  isReadOnlyProject?: boolean;
}

export type TemplateOption = { value: string; label: string };
