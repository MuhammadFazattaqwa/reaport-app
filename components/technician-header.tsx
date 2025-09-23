"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
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
} from "lucide-react";

export type TechnicianHeaderProps = {
  title: string;
  showBackButton?: boolean;
  backUrl?: string;
  showFilter?: boolean;
  filterValue?: "all" | "survey" | "instalasi";
  onFilterChange?: (value: "all" | "survey" | "instalasi") => void;
};

function TechnicianHeader({
  title,
  showBackButton = false,
  backUrl = "/user/dashboard",
  showFilter = false,
  filterValue = "all",
  onFilterChange,
}: TechnicianHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();

  /* =================== Logout & navigasi =================== */
  async function handleLogout() {
    try {
      await supabase.auth.signOut();
    } catch {}
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    window.location.href = `/auth/login`;
  }

  const handleBack = () => router.push(backUrl);
  const handleProfileClick = () => router.push("/user/profile");
  const handleComplaintClick = () => router.push("/user/complain");
  const handleDamageComplainClick = () => router.push("/user/damageComplain");

  /* =================== Push Notification (guard & email) =================== */
  const supported = useMemo(
    () =>
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window,
    []
  );

  const [email, setEmail] = useState<string | undefined>(undefined);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (!mounted) return;
        const em =
          (data?.user?.email && data.user.email.trim()) ||
          (typeof window !== "undefined"
            ? localStorage.getItem("userEmail") || undefined
            : undefined);
        setEmail(em || undefined);
      } catch {
        // ignore
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* =================== Floating Button (pojok kanan bawah) =================== */
  const [showFab, setShowFab] = useState(false);

  // Tampilkan FAB hanya di dashboard & ketika belum aktif
  useEffect(() => {
    if (!supported) {
      setShowFab(false);
      return;
    }
    if (!pathname?.startsWith("/user/dashboard")) {
      setShowFab(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const perm = Notification.permission; // "default" | "granted" | "denied"
        if (perm === "denied") {
          if (!cancelled) setShowFab(false);
          return;
        }
        if (perm === "default") {
          if (!cancelled) setShowFab(true);
          return;
        }
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (!cancelled) setShowFab(!sub);
      } catch {
        if (!cancelled) setShowFab(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported, pathname]);

  async function onFabClick() {
    // Sembunyikan tombol segera setelah diklik (sesuai request)
    setShowFab(false);
    try {
      await ensurePushSubscription({
        subscribeEndpoint: "/api/push/subscribe",
        getEmail: () => email!,
      });
    } catch {
      // diamkan; teknisi tetap bisa lanjut
    }
  }

  return (
    <>
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
            {/* Segmented filter (opsional) */}
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

            {/* Menu */}
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

      {/* Floating “Aktifkan Notifikasi” (mobile-only, pojok kanan bawah) */}
      {showFab && (
        <Button
          onClick={onFabClick}
          size="icon"
          className="fixed md:hidden bottom-4 right-4 z-50 h-14 w-14 rounded-full shadow-lg"
          aria-label="Aktifkan notifikasi"
          title="Aktifkan notifikasi"
        >
          <Bell className="h-6 w-6" />
        </Button>
      )}
    </>
  );
}

export default TechnicianHeader;
export { TechnicianHeader };
