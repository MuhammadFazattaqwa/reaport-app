// app/api/survey/floors/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

type RoomStat = {
  id: string;
  name: string;
  uploaded: number;
  required: number;
  status: "pending" | "partial" | "complete";
  hasChildren: boolean;
};

function toStatus(uploaded: number, required: number): RoomStat["status"] {
  if (required > 0) {
    if (uploaded >= required) return "complete";
    if (uploaded > 0) return "partial";
    return "pending";
  }
  // kalau required belum ada → bila ada upload = partial, kalau belum ada = pending
  return uploaded > 0 ? "partial" : "pending";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");

    if (!projectId || !isUuid(projectId)) {
      return NextResponse.json(
        { error: "projectId tidak valid" },
        { status: 400 }
      );
    }

    // 1) Meta project
    const proj = await supabaseAdmin
      .from("projects")
      .select("id, job_id, name, lokasi")
      .eq("id", projectId)
      .maybeSingle();

    if (proj.error) throw proj.error;
    if (!proj.data) {
      return NextResponse.json(
        { error: "Project tidak ditemukan" },
        { status: 404 }
      );
    }

    // 2) Rooms (urut floor ASC, seq ASC)
    const rs = await supabaseAdmin
      .from("project_survey_rooms")
      .select("id, project_id, floor, seq, room_name")
      .eq("project_id", projectId)
      .order("floor", { ascending: true })
      .order("seq", { ascending: true });

    if (rs.error) throw rs.error;

    const rooms = (rs.data ?? []).map((r) => ({
      id: String(r.id),
      floor: Number(r.floor),
      seq: Number(r.seq),
      room_name: String(r.room_name),
    }));

    if (!rooms.length) {
      return NextResponse.json({
        project: {
          id: String(proj.data.id),
          job_id: String(proj.data.job_id),
          name: String(proj.data.name),
          lokasi: proj.data.lokasi ?? null,
        },
        floors: [],
      });
    }

    const roomIds = rooms.map((r) => r.id);

    // 3) REQUIRED per room (tanpa sum(...) di select) → agregasi di server
    const reqMap = new Map<string, number>();
    let reqTableMissing = false;
    {
      const q = await supabaseAdmin
        .from("survey_room_requirements")
        .select("room_id, required_count")
        .eq("project_id", projectId)
        .in("room_id", roomIds);

      if (q.error) {
        reqTableMissing = /does not exist/i.test(q.error.message);
        if (!reqTableMissing) throw q.error;
      } else {
        for (const row of q.data ?? []) {
          const k = String((row as any).room_id);
          const v = Number((row as any).required_count ?? 0);
          reqMap.set(k, (reqMap.get(k) ?? 0) + (Number.isFinite(v) ? v : 0));
        }
      }
    }

    // 4) UPLOADED per room (tanpa count(id) di select) → agregasi di server
    const upMap = new Map<string, number>();
    let upTableMissing = false;
    {
      const q = await supabaseAdmin
        .from("survey_room_uploads")
        .select("room_id") // ambil kolom ringan; hitung di server
        .eq("project_id", projectId)
        .in("room_id", roomIds);

      if (q.error) {
        upTableMissing = /does not exist/i.test(q.error.message);
        if (!upTableMissing) throw q.error;
      } else {
        for (const row of q.data ?? []) {
          const k = String((row as any).room_id);
          upMap.set(k, (upMap.get(k) ?? 0) + 1);
        }
      }
    }

    // 5) Susun floors[] sesuai format UI
    const floorsMap = new Map<
      number,
      { floor: number; name: string; rooms: (RoomStat & { _seq: number })[] }
    >();

    for (const r of rooms) {
      const uploaded = upMap.get(r.id) ?? 0;
      const required = reqMap.get(r.id) ?? 0; // kalau tabel requirement tidak ada → 0
      const status = toStatus(uploaded, required);

      if (!floorsMap.has(r.floor)) {
        floorsMap.set(r.floor, {
          floor: r.floor,
          name: `Lantai ${r.floor}`,
          rooms: [],
        });
      }

      floorsMap.get(r.floor)!.rooms.push({
        id: r.id,
        name: r.room_name,
        uploaded,
        required,
        status,
        hasChildren: false,
        _seq: r.seq,
      });
    }

    const floors = [...floorsMap.values()]
      .sort((a, b) => a.floor - b.floor)
      .map((f) => ({
        id: `floor-${f.floor}`,
        floor_number: f.floor,
        name: f.name,
        expanded: true,
        rooms: f.rooms
          .sort((a, b) => a._seq - b._seq)
          .map(({ _seq, ...rest }) => rest),
      }));

    return NextResponse.json({
      project: {
        id: String(proj.data.id),
        job_id: String(proj.data.job_id),
        name: String(proj.data.name),
        lokasi: proj.data.lokasi ?? null,
      },
      floors,
      tables: {
        requirementsMissing: reqTableMissing,
        uploadsMissing: upTableMissing,
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to fetch survey floors & room stats" },
      { status: 500 }
    );
  }
}
