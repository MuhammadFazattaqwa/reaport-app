"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseBrowser";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [msg, setMsg] = useState("Mengautentikasi...");
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const oauthErr =
          url.searchParams.get("error") ||
          url.searchParams.get("error_description");

        if (oauthErr) {
          setMsg(`Gagal autentikasi (OAuth): ${decodeURIComponent(oauthErr)}`);
          return;
        }
        if (!code) {
          setMsg(
            "Callback tidak membawa ?code=. Pastikan client diinisialisasi dengan auth.flowType='pkce', " +
              "tombol login pakai redirectTo ke /auth/callback pada origin yang sama, dan SW tidak intersep path itu."
          );
          return;
        }

        // ⬅️ resmi: terima code (string), bukan href
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          setMsg(`Gagal autentikasi: ${error.message}`);
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setMsg("User tidak ditemukan sesudah login.");
          return;
        }

        let role: string | undefined =
          (user.user_metadata as any)?.role || (user.app_metadata as any)?.role;
        if (!role) {
          const { data: prof } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .maybeSingle();
          role = prof?.role ?? undefined;
        }
        const isAdmin =
          role === "admin" || (user.email ?? "").includes("admin");

        setMsg("Autentikasi sukses. Mengarahkan...");
        router.replace(isAdmin ? "/admin/dashboard" : "/user/dashboard");
      } catch (e: any) {
        setMsg(`Gagal autentikasi (exception): ${e?.message ?? String(e)}`);
      }
    })();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <pre className="text-gray-700 text-sm whitespace-pre-wrap">{msg}</pre>
    </div>
  );
}
