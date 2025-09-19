// app/api/survey/upload/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "survey-room-uploads";

const isUuid = (v?: string | null) =>
  !!v &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v || ""
  );

function parseDataUrl(dataUrl: string): {
  buffer: Buffer;
  contentType: string;
} {
  const m = /^data:(.+?);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("dataUrl invalid");
  const contentType = m[1];
  const b64 = m[2];
  return { buffer: Buffer.from(b64, "base64"), contentType };
}

async function ensureBucketExists(name: string) {
  const { data: buckets, error } = await supabaseAdmin.storage.listBuckets();
  if (error) throw error;
  const exists = (buckets || []).some((b) => b.name === name);
  if (!exists) {
    const { error: cErr } = await supabaseAdmin.storage.createBucket(name, {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      fileSizeLimit: 10 * 1024 * 1024,
    });
    if (cErr) throw cErr;
  }
}

async function uploadOnce(
  projectId: string,
  roomId: string,
  dataUrl: string,
  thumbDataUrl?: string | null
) {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  const baseKey = `${projectId}/${roomId}/${ts}-${rand}`;

  const { buffer: fullBuf, contentType: fullType } = parseDataUrl(dataUrl);
  const fullExt = (fullType.split("/")[1] || "jpg").toLowerCase();
  const fullPath = `${baseKey}.${fullExt}`;

  const up1 = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(fullPath, fullBuf, { contentType: fullType, upsert: false });
  if (up1.error) throw up1.error;

  const fullPub = supabaseAdmin.storage
    .from(BUCKET)
    .getPublicUrl(up1.data.path);
  const fullUrl = fullPub.data.publicUrl;

  let thumbUrl: string | null = null;
  if (typeof thumbDataUrl === "string" && thumbDataUrl.startsWith("data:")) {
    const { buffer: tBuf, contentType: tType } = parseDataUrl(thumbDataUrl);
    const tExt = (tType.split("/")[1] || "jpg").toLowerCase();
    const tPath = `${baseKey}-thumb.${tExt}`;
    const up2 = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(tPath, tBuf, { contentType: tType, upsert: false });
    if (up2.error) throw up2.error;
    const tPub = supabaseAdmin.storage.from(BUCKET).getPublicUrl(up2.data.path);
    thumbUrl = tPub.data.publicUrl;
  }

  return { fullUrl, thumbUrl };
}

/** POST = upload baru */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const {
      projectId,
      roomId,
      dataUrl,
      thumbDataUrl,
      category,
      measureValue,
      measureUnit,
    } = body || {};

    if (!isUuid(projectId))
      return NextResponse.json({ error: "projectId invalid" }, { status: 400 });
    if (!isUuid(roomId))
      return NextResponse.json({ error: "roomId invalid" }, { status: 400 });
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:"))
      return NextResponse.json({ error: "dataUrl invalid" }, { status: 400 });

    // guard existence
    const p = await supabaseAdmin
      .from("projects")
      .select("id")
      .eq("id", projectId)
      .maybeSingle();
    if (p.error) throw p.error;
    if (!p.data)
      return NextResponse.json({ error: "project not found" }, { status: 404 });

    const r = await supabaseAdmin
      .from("project_survey_rooms")
      .select("id")
      .eq("id", roomId)
      .maybeSingle();
    if (r.error) throw r.error;
    if (!r.data)
      return NextResponse.json({ error: "room not found" }, { status: 404 });

    await ensureBucketExists(BUCKET);

    let fullUrl = "";
    let thumbUrl: string | null = null;
    try {
      const up = await uploadOnce(projectId, roomId, dataUrl, thumbDataUrl);
      fullUrl = up.fullUrl;
      thumbUrl = up.thumbUrl;
    } catch (e: any) {
      if (
        String(e?.message || e)
          .toLowerCase()
          .includes("bucket not found")
      ) {
        await ensureBucketExists(BUCKET);
        const up2 = await uploadOnce(projectId, roomId, dataUrl, thumbDataUrl);
        fullUrl = up2.fullUrl;
        thumbUrl = up2.thumbUrl;
      } else {
        throw e;
      }
    }

    // insert upload
    const ins = await supabaseAdmin
      .from("survey_room_uploads")
      .insert({
        project_id: projectId,
        room_id: roomId,
        url: fullUrl,
        thumb_url: thumbUrl,
      })
      .select("id, created_at")
      .maybeSingle();
    if (ins.error) throw ins.error;
    const uploadId = ins.data!.id;

    // simpan meta (opsional)
    if (category) {
      const metaTry = await supabaseAdmin
        .from("survey_room_upload_meta")
        .insert({
          upload_id: uploadId,
          category: String(category),
          measure_value:
            typeof measureValue === "number"
              ? measureValue
              : Number(String(measureValue || "").replace(",", ".")) || null,
          measure_unit: measureUnit || "m",
        });
      if (metaTry.error && !/does not exist/i.test(metaTry.error.message)) {
        throw metaTry.error;
      }
    }

    return NextResponse.json({
      ok: true,
      id: uploadId,
      url: fullUrl,
      thumb_url: thumbUrl,
      created_at: ins.data!.created_at,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to upload survey photo" },
      { status: 500 }
    );
  }
}

/** GET = list upload untuk satu room (dengan meta jika ada) */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const roomId = url.searchParams.get("roomId");

    if (!isUuid(projectId) || !isUuid(roomId)) {
      return NextResponse.json(
        { error: "invalid projectId/roomId" },
        { status: 400 }
      );
    }

    const up = await supabaseAdmin
      .from("survey_room_uploads")
      .select("id, url, thumb_url, created_at")
      .eq("project_id", projectId)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });
    if (up.error) throw up.error;

    const uploads = up.data || [];
    const ids = uploads.map((u) => u.id);

    let metaMap = new Map<
      string,
      {
        category: string;
        measure_value: number | null;
        measure_unit: string | null;
      }
    >();
    if (ids.length) {
      const m = await supabaseAdmin
        .from("survey_room_upload_meta")
        .select("upload_id, category, measure_value, measure_unit")
        .in("upload_id", ids);
      if (!m.error) {
        for (const row of m.data || []) {
          metaMap.set(String(row.upload_id), {
            category: String(row.category),
            measure_value: row.measure_value as any,
            measure_unit: (row.measure_unit as any) ?? "m",
          });
        }
      }
    }

    const items = uploads.map((u) => ({
      id: String(u.id),
      url: u.url,
      thumb_url: u.thumb_url,
      created_at: u.created_at,
      meta: metaMap.get(String(u.id)) || null,
    }));

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "failed to fetch uploads" },
      { status: 500 }
    );
  }
}
