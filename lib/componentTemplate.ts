// lib/componentTemplate.ts
export interface ComponentTemplateItem {
  id: string;
  name: string;
  unit: string; 
  sort: number;
}

export const COMPONENT_ROWS = 28;

export const COMPONENT_TEMPLATE: ComponentTemplateItem[] = [
  { id: "1",  name: "IP Camera Outdoor 5MP",            unit: "Unit", sort: 1 },
  { id: "2",  name: "Switch Unmanaged 8 Port POE",      unit: "Unit", sort: 2 },
  { id: "3",  name: "NVR 4 Channel POE",                unit: "Unit", sort: 3 },
  { id: "4",  name: "Monitor LED Uk. 22 inch",          unit: "Unit", sort: 4 },
  { id: "5",  name: "Hard Disk Internal 4TB",           unit: "Unit", sort: 5 },
  { id: "6",  name: "Router Mikrotik RB750 R2 5 Port",  unit: "Pcs",  sort: 6 },
  { id: "7",  name: "Kabel LAN SFTP SPC Cat6",          unit: "M",    sort: 7 },
  { id: "8",  name: "Kabel NYM Uk. 2 x 1.5 mm",         unit: "M",    sort: 8},
  { id: "9", name: "Kabel Twisted Uk. 2x10mm",         unit: "M",    sort: 9 },
  { id: "10", name: "Duradus Masko 10x10 Hitam",        unit: "Pcs",  sort: 10 },
  { id: "11", name: "Box Panel Outdoor Saka 40x30x20",  unit: "Pcs",  sort: 11 },
  { id: "12", name: "Steker Arde Uticon Kaki 2",        unit: "Pcs",  sort: 12 },
  { id: "13", name: "Stop Kontak Outbow Uticon 4 Hole", unit: "Pcs",  sort: 13 },
];
