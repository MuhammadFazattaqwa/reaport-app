// lib/supabaseServer.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
if (!serviceKey)
  console.warn(
    "[supabase] Warning: SUPABASE_SERVICE_ROLE_KEY not set. Upload may fail if bucket is private."
  );

export function supabaseServer() {
  return createClient(supabaseUrl, serviceKey ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function projectRefFromUrl(url: string | undefined | null) {
  if (!url) return null;
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

function decodeBase64Web(b64: string) {
  try {
    if (typeof atob === "function") return atob(b64);
  } catch {}
  try {
    return Buffer.from(b64, "base64").toString("utf8");
  } catch {
    return "";
  }
}

async function readAccessTokenFromCookies(): Promise<string | null> {
  const store = await cookies();

  const raw = store.get("access_token")?.value;
  if (raw) return raw;

  const alt =
    store.get("sb-access-token")?.value ||
    store.get("supabase-access-token")?.value;
  if (alt) return alt;

  const ref = projectRefFromUrl(SUPABASE_URL);
  if (ref) {
    const name = `sb-${ref}-auth-token`;
    const val = store.get(name)?.value;
    if (val) {
      let text = val;
      if (text.startsWith("base64-")) {
        text = decodeBase64Web(text.slice(7));
      }
      try {
        const obj = JSON.parse(text);
        if (obj?.access_token) return obj.access_token as string;
      } catch {
      }
    }
  }

  return null;
}

export async function supabaseServers(): Promise<SupabaseClient> {
  const access = await readAccessTokenFromCookies();

  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      detectSessionInUrl: false,
      autoRefreshToken: false,
    },
    global: access
      ? { headers: { Authorization: `Bearer ${access}` } }
      : undefined,
  });
}
