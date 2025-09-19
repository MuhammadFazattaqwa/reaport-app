"use client";

import type React from "react";
import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getDailyQuote } from "@/lib/quotes";
import { PWAInstallPrompt } from "@/components/pwa-install-prompt";
import { supabase } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const router = useRouter();

  const quote = useMemo(() => getDailyQuote(), []);

  const routeAfterLogin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Login berhasil tapi user tidak ditemukan.");
      return;
    }

    // 1) Role dari metadata
    let role: string | undefined =
      (user.user_metadata as any)?.role || (user.app_metadata as any)?.role;

    // 2) (Opsional) role dari profiles
    if (!role) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();
      role = prof?.role;
    }

    // 3) fallback
    const isAdmin = role === "admin" || (user.email ?? "").includes("admin");

    router.replace(isAdmin ? "/admin/dashboard" : "/user/dashboard");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message || "Email atau password salah");
        return;
      }
      await routeAfterLogin();
    } catch (err: any) {
      setError(err?.message ?? "Terjadi kesalahan saat login");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    setError("");
    try {
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) setError(error.message);
    } catch (err: any) {
      setError(err?.message ?? "Gagal memulai login Google");
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleForgotPassword = () => router.push("/auth/forgot_password");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-gray-900">
            Reaport
          </CardTitle>
          <CardDescription>
            Masuk ke akun Anda untuk melanjutkan
          </CardDescription>

          {/* Quote harian */}
          <div className="mt-4 rounded-md border bg-white px-4 py-3 text-sm italic text-gray-700">
            “{quote}”
          </div>
        </CardHeader>

        <CardContent>
          {/* Login Email / Password */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="Masukkan email Anda"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Masukkan password Anda"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full"
                autoComplete="current-password"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "Masuk..." : "Login"}
            </Button>
          </form>

          {/* Divider */}
          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-500">atau</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Login dengan Google */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleLogin}
            disabled={isGoogleLoading}
          >
            {/* Ikon Google (SVG kecil) */}
            <svg className="mr-2 h-4 w-4" viewBox="0 0 533.5 544.3">
              <path
                d="M533.5 278.4c0-18.5-1.7-36.3-5-53.5H272v101.2h146.9c-6.3 34-25.2 62.8-53.8 82v68.1h86.9c51 47 80.5 116.3 80.5 196.8 0 17.7-1.7 35-4.9 51.6h105.9V278.4z"
                fill="#4285f4"
              />
              <path
                d="M272 544.3c73.5 0 135.3-24.3 180.4-65.9l-86.9-68.1c-24.2 16.3-55.2 26-93.5 26-71.9 0-132.8-48.6-154.6-114.1H-1.7v71.6C43.3 491.2 149.5 544.3 272 544.3z"
                fill="#34a853"
              />
              <path
                d="M117.4 322.2c-5.6-16.7-8.7-34.5-8.7-53s3.1-36.3 8.7-53V144.6H-1.7C-20.6 185.6-31 230.7-31 269.2s10.4 83.6 29.3 124.6l119.1-71.6z"
                fill="#fbbc05"
              />
              <path
                d="M272 106.6c39.9 0 75.7 13.8 103.9 40.7l78.1-78.1C407.3 25.6 345.5 1 272 1 149.5 1 43.3 54.1-1.7 143.7l119.1 71.6C139.2 155.9 200.1 106.6 272 106.6z"
                fill="#ea4335"
              />
            </svg>
            {isGoogleLoading ? "Menghubungkan..." : "Lanjutkan dengan Google"}
          </Button>

          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-800 underline"
            >
              Lupa Password?
            </button>
          </div>
        </CardContent>
      </Card>

      <PWAInstallPrompt />
    </div>
  );
}
