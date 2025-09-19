// app/api/pwa/vapid-public/route.ts
export const dynamic = "force-dynamic";

export async function GET() {
  const pub = process.env.VAPID_PUBLIC_KEY || "";
  return new Response(pub, { status: 200, headers: { "Content-Type": "text/plain" } });
}
