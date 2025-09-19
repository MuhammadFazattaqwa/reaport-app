// app/api/technicians/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/technicians
 * Prefer view v_technicians_with_status; fallback ke tabel technicians.
 */
export async function GET() {
  // 1) Coba dari VIEW (kolom Indonesia)
  const { data: vdata, error: verror } = await supabaseAdmin
    .from("v_technicians_with_status")
    .select("*")
    .order("inisial", { ascending: true });

  if (!verror && vdata) {
    const shaped = (vdata ?? []).map((t: any) => ({
      id: String(t.id),
      // UI saat ini pakai "name" atau "nama"
      name: String(t.nama_lengkap ?? "Teknisi"),
      inisial: String(t.inisial ?? (t.nama_lengkap?.[0] ?? "?")).toUpperCase(),
      email: t.email ?? "",
      phone: t.telepon ?? "",
      joinDate:
        t.tanggal_gabung ??
        (t.dibuat_pada ? String(t.dibuat_pada).slice(0, 10) : ""),
      // seragamkan status untuk UI
      status: String(t.status_sekarang ?? "di_kantor"),
      // kolom Indonesia ikut dipaparkan bila perlu di UI
      nama_panggilan: t.nama_panggilan ?? "",
      aktif: !!t.aktif,
    }));
    return NextResponse.json({ data: shaped });
  }

  // 2) Fallback ke tabel technicians (kolom Indonesia)
  const { data, error } = await supabaseAdmin
    .from("technicians")
    .select("id, nama_lengkap, inisial, dibuat_pada, email, telepon, aktif, nama_panggilan")
    .order("inisial", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const shaped = (data ?? []).map((t: any) => ({
    id: String(t.id),
    name: String(t.nama_lengkap ?? "Teknisi"),
    inisial: String(t.inisial ?? (t.nama_lengkap?.[0] ?? "?")).toUpperCase(),
    email: t.email ?? "",
    phone: t.telepon ?? "",
    joinDate: t.dibuat_pada ? String(t.dibuat_pada).slice(0, 10) : "",
    status: "di_kantor",
    nama_panggilan: t.nama_panggilan ?? "",
    aktif: !!t.aktif,
  }));

  return NextResponse.json({ data: shaped });
}

/**
 * POST /api/technicians
 * Body (bebas Inggris/Indonesia):
 * { nama_lengkap* | name*, inisial?, email?, telepon?|phone?, aktif?|is_active?, nama_panggilan? }
 * - inisial: maks 2 huruf, akan di-UPPERCASE
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();

    // terima kedua gaya penamaan (Inggris/Indonesia)
    const nama_lengkap: string = (body?.nama_lengkap ?? body?.name ?? "").trim();
    const inisialRaw: string | null =
      body?.inisial ?? body?.initials ?? null;
    const email: string | null = body?.email ?? null;
    const telepon: string | null = (body?.telepon ?? body?.phone) ?? null;
    const aktif: boolean =
      body?.aktif ?? (typeof body?.is_active === "boolean" ? body.is_active : true);
    const nama_panggilan: string | null = body?.nama_panggilan ?? null;

    if (!nama_lengkap) {
      return NextResponse.json(
        { error: "Nama lengkap teknisi wajib diisi." },
        { status: 400 }
      );
    }
    let inisial: string | null = null;
    if (inisialRaw) {
      const s = String(inisialRaw).toUpperCase().replace(/[^A-Z]/g, "").slice(0, 2);
      if (s.length === 0) {
        return NextResponse.json(
          { error: "Inisial harus berupa huruf A–Z." },
          { status: 400 }
        );
      }
      inisial = s;
    }

    const insertPayload: any = {
      nama_lengkap,
      aktif: !!aktif,
      inisial,
      email: email ? String(email).trim() : null,
      telepon: telepon ? String(telepon).trim() : null,
      nama_panggilan: nama_panggilan ? String(nama_panggilan).trim() : null,
    };

    const { data, error } = await supabaseAdmin
      .from("technicians")
      .insert(insertPayload)
      .select("id, nama_lengkap, inisial, dibuat_pada, email, telepon, aktif, nama_panggilan")
      .single();

    if (error) {
      // 23505: unique violation (mis. inisial bentrok)
      const msg =
        (error as any).code === "23505"
          ? "Inisial teknisi sudah digunakan."
          : error.message;
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const shaped = {
      id: String(data!.id),
      name: data!.nama_lengkap,
      inisial: String(data!.inisial ?? data!.nama_lengkap?.[0] ?? "?").toUpperCase(),
      email: data!.email ?? "",
      phone: data!.telepon ?? "",
      joinDate: data!.dibuat_pada ? String(data!.dibuat_pada).slice(0, 10) : "",
      status: "di_kantor" as const,
      nama_panggilan: data!.nama_panggilan ?? "",
      aktif: !!data!.aktif,
    };

    return NextResponse.json({ data: shaped });
  } catch {
    return NextResponse.json(
      { error: "Gagal menambah teknisi" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/technicians?id=<uuid>
 */
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const technicianId = searchParams.get("id");

    if (!technicianId) {
      return NextResponse.json(
        { error: "ID teknisi diperlukan" },
        { status: 400 }
      );
    }

    // Cegah hapus bila masih ada assignment aktif
    const { count, error: chkErr } = await supabaseAdmin
      .from("project_assignments")
      .select("id", { count: "exact", head: true })
      .eq("technician_id", technicianId)
      .is("removed_at", null);

    if (chkErr) {
      return NextResponse.json({ error: chkErr.message }, { status: 500 });
    }
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: "Teknisi masih memiliki penugasan aktif." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("technicians")
      .delete()
      .eq("id", technicianId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: "Teknisi berhasil dihapus" });
  } catch {
    return NextResponse.json(
      { error: "Terjadi kesalahan saat menghapus teknisi" },
      { status: 500 }
    );
  }
}
