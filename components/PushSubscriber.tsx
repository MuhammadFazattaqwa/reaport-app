"use client";

import { useEffect, useState } from "react";
import { ensurePushSubscribed } from "@/lib/pushClient";

export function PushSubscriber() {
  const [status, setStatus] = useState<"idle" | "ok" | "no" | "err">("idle");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const r = await ensurePushSubscribed("Technician Phone");
        if (!mounted) return;
        setStatus(r.ok ? "ok" : "no");
      } catch {
        if (!mounted) return;
        setStatus("err");
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Tidak perlu tampil UI; kalau mau, ganti jadi badge kecil.
  return null;
}
