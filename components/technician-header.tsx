"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabaseBrowser";
import { ensurePushSubscription } from "@/lib/pushClient";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ArrowLeft,
  Menu,
  LogOut,
  UserCircle,
  AlertCircle,
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Loader2,
} from "lucide-react";

interface TechnicianHeaderProps {
  title: string;
  showBackButton?: boolean;
  backUrl?: string;
  showFilter?: boolean;
  filterValue?: "all" | "survey" | "instalasi";
  onFilterChange?: (value: "all" | "survey" | "instalasi") => void;
}

type NotifStatus =
  | "idle"        // belum dicek
  | "loading"     // sedang proses enable
  | "enabled"     // permission granted & ada subscription
  | "prompt"      // bisa diminta (permission default)
  | "blocked"     // permission denied
  | "unsupported" // browser tidak support
  | "error";      // error saat enable

export function TechnicianHeader({
  title,
  showBackButton = false,
  backUrl = "/user/dashboard",
  showFilter = false,
  filterValue = "all",
  onFilterChange,
}: TechnicianHeaderProps) {
  const router = useRouter();

  /* =================== Logout & navigasi existing =================== */
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    }).catch(() => {});
    const next = encodeURIComponent("/auth/login");
    window.location.href = `/auth/login`;
  }

  const handleBack = () => {
    router.push(backUrl);
  };

  const handleProfileClick = () => {
    router.push("/user/profile");
  };

  const handleComplaintClick = () => {
    router.push("/user/complain");
  };

  const handleDamageComplainClick = () => {
    router.push("/user/damageComplain");
  };

  /* =================== Push Notification (baru) =================== */

  const supported = useMemo(() => {
    // minimal support untuk web push
    return (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window
    );
  }, []);

  const [notifStatus, setNotifStatus] = useState<NotifStatus>("idle");
  const [email, setEmail] = useState<string | undefined>(undefined);

  // Ambil email user dari Supabase (client)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const em =
          (data?.user?.email && data.user.email.trim()) ||
          // fallback kecil bila kamu simpan local:
          (typeof window !== "undefined"
            ? localStorage.getItem("userEmail") || undefined
            : undefined);
        setEmail(em || undefined);
      } catch {
        // abaikan
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Deteksi status permission + subscription awal
  useEffect(() => {
    if (!supported) {
      setNotifStatus("unsupported");
      return;
    }
    let disposed = false;
    (async () => {
      try {
        const perm = Notification.permission; // "granted" | "denied" | "default"
        // cek subscription yang aktif
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (disposed) return;

        if (perm === "denied") {
          setNotifStatus("blocked");
        } else if (perm === "granted") {
          setNotifStatus(sub ? "enabled" : "prompt"); // granted tapi sub null → perlu subscribe ulang
        } else {
          setNotifStatus("prompt");
        }
      } catch {
        if (!disposed) setNotifStatus("error");
      }
    })();
    return () => {
      disposed = true;
    };
  }, [supported]);

  async function handleEnableNotifications() {
    if (!supported) {
      setNotifStatus("unsupported");
      return;
    }
    if (!email) {
      // tanpa email kita tidak bisa simpan subscription terikat user
      alert("Tidak dapat mengaktifkan notifikasi: email user tidak tersedia.");
      return;
    }
    setNotifStatus("loading"); 
    try {
    await ensurePushSubscription({
      subscribeEndpoint: "/api/push/subscribe",
      getEmail: () => email!,                // pastikan email sudah ada sebelum dipanggil
      onDenied: () => setNotifStatus("blocked"),
      onError: () => setNotifStatus("error"),
    });
      // re-cek subscription untuk pastikan enabled
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setNotifStatus(sub ? "enabled" : "prompt");
    } catch (e) {
      console.error("Enable notifications error:", e);
      setNotifStatus("error");
    }
  }

  // Elemen tombol + status kecil
  const NotifButton = () => {
    if (!supported) {
      return (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
          <BellOff className="h-4 w-4 mr-1" />
          Notifikasi: Tidak didukung
        </Button>
      );
    }
    if (notifStatus === "enabled") {
      return (
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled>
          <CheckCircle2 className="h-4 w-4 mr-1" />
          Notifikasi Aktif
        </Button>
      );
    }
    if (notifStatus === "blocked") {
      return (
        <Button
          variant="destructive"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() =>
            alert(
              "Notifikasi diblokir oleh browser. Buka pengaturan situs di browser Anda dan izinkan Notifications untuk domain ini."
            )
          }
        >
          <BellOff className="h-4 w-4 mr-1" />
          Notifikasi Diblokir
        </Button>
      );
    }
    if (notifStatus === "loading") {
      return (
        <Button variant="default" size="sm" className="h-7 px-2 text-xs" disabled>
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          Mengaktifkan...
        </Button>
      );
    }
    if (notifStatus === "error") {
      return (
        <Button variant="destructive" size="sm" className="h-7 px-2 text-xs" onClick={handleEnableNotifications}>
          <Bell className="h-4 w-4 mr-1" />
          Coba Lagi
        </Button>
      );
    }
    // "idle" | "prompt"
    return (
      <Button variant="default" size="sm" className="h-7 px-2 text-xs" onClick={handleEnableNotifications}>
        <Bell className="h-4 w-4 mr-1" />
        Aktifkan Notifikasi
      </Button>
    );
  };

  return (
    <header className="bg-white shadow-sm border-b">
      <div className="px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showBackButton && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBack}
              className="p-2"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <h1 className="text-[15px] font-bold text-gray-900">{title}</h1>
        </div>

        <div className="flex items-center gap-2">
          {/* === Filter existing === */}
          {showFilter && (
            <div className="flex items-center gap-1">
              <Button
                variant={filterValue === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("all")}
                className="h-7 px-2 text-xs font-sans"
              >
                All
              </Button>
              <Button
                variant={filterValue === "survey" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("survey")}
                className="h-7 px-2 text-xs font-sans"
              >
                Survey
              </Button>
              <Button
                variant={filterValue === "instalasi" ? "default" : "outline"}
                size="sm"
                onClick={() => onFilterChange?.("instalasi")}
                className="h-7 px-2 text-xs font-sans"
              >
                Instalasi
              </Button>
            </div>
          )}

          {/* === Tombol Enable Notifications (baru) === */}
          <NotifButton />

          {/* === Menu existing === */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="p-2">
                <Menu className="h-6 w-6" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={handleProfileClick}>
                <UserCircle className="h-4 w-4 mr-2" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDamageComplainClick}>
                <AlertTriangle className="h-4 w-4 mr-2" />
                Lapor Kerusakan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleComplaintClick}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Ajukan Komplain
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleLogout} className="text-red-600">
                <LogOut className="h-4 w-4 mr-2" />
                Keluar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
