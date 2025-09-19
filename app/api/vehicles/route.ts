// app/api/vehicles/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export const revalidate = 0;
export const dynamic = "force-dynamic";

function computeStatusPajakServer(
  paid?: string | null,
  due?: string | null
): "Aktif" | "Mati" {
  if (!due) return "Mati";
  const dDue = new Date(String(due));

  if (paid) {
    const dPaid = new Date(String(paid));
    if (isFinite(dPaid.getTime()) && isFinite(dDue.getTime()) && dPaid > dDue) {
      return "Mati";
    }
  }
  const today = new Date();
  return isFinite(dDue.getTime()) && today > dDue ? "Mati" : "Aktif";
}

function mapRowToUI(v: any) {
  return {
    id: v.vehicle_code ?? v.id, // utamakan code agar stabil
    merk: v.brand ?? "",
    tipe: v.model ?? "",
    no_polisi: v.plate ?? "",
    pajak_periode_ini: v.tax_paid_date ?? null, // tampil di UI sebagai paid
    pajak_periode_berikutnya: v.tax_due_date ?? null, // due
    status_pajak: computeStatusPajakServer(v.tax_paid_date, v.tax_due_date),
  };
}

export async function GET() {
  const sb = supabaseServer;

  const { data: rows, error } = await sb
    .from("vehicles")
    .select(
      "id, vehicle_code, brand, model, plate, tax_paid_date, tax_due_date, active"
    )
    .eq("active", true)
    .order("vehicle_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Gagal mengambil data kendaraan" },
      { status: 500 }
    );
  }

  const mapped = (rows ?? []).map(mapRowToUI);
  return NextResponse.json({ data: mapped });
}

export async function POST(req: Request) {
  const sb = supabaseServer;
  const body = await req.json().catch(() => ({} as any));

  // terima kedua gaya payload (baru & lama)
  const brand = body.brand ?? body.merk ?? null;
  const model = body.model ?? body.tipe ?? null;
  const plate = body.plate ?? body.no_polisi;
  const paid = body.tax_paid_date ?? body.pajak_periode_ini ?? null;
  const due = body.tax_due_date ?? body.pajak_periode_berikutnya ?? null;

  if (!plate || String(plate).trim() === "") {
    return NextResponse.json(
      { error: "Field 'plate' (no_polisi) wajib diisi." },
      { status: 400 }
    );
  }

  const nameRaw = body.name ?? `${brand ?? ""} ${model ?? ""}`.trim();
  const name = nameRaw || String(plate);

  const { data, error } = await sb
    .from("vehicles")
    .insert([
      {
        name,
        brand,
        model,
        plate,
        tax_paid_date: paid,
        tax_due_date: due,
        active: body.active ?? true,
      },
    ])
    .select(
      "id, vehicle_code, brand, model, plate, tax_paid_date, tax_due_date, active"
    )
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || "Gagal menambahkan kendaraan" },
      { status: 500 }
    );
  }

  return NextResponse.json({ data: mapRowToUI(data) }, { status: 201 });
}
