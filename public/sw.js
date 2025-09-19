/* public/sw.js — fast offline upload with timeout & ACK (Instalasi + Survey, merged) */
const VERSION = "magang-app-v1.0.48"; // ⬅️ bump versi agar SW baru aktif
const STATIC_CACHE = VERSION + "-static";
const DYNAMIC_CACHE = VERSION + "-dynamic";

/* ===== App Shell (gabungan) ===== */
const APP_SHELL = [
  "/",
  "/user/dashboard",
  "/user/upload_foto",
  "/user/survey",
  "/user/survey/room",
  "/user/survey/floors",
  "/user/survey/upload",
  "/auth/login",
  "/offline",
  "/manifest.json",
  "/logo-reaport.png",
];

/* ===== Config upload/meta ===== */
const QUEUE_DB = "photo-upload-queue-db";
const QUEUE_STORE = "requests";
const UPLOAD_PATH = "/api/job-photos/upload";
const META_PATH = "/api/job-photos/meta";
// 🔥 Dukung Survey
const SURVEY_UPLOAD_PATH = "/api/survey/uploads";
// const SURVEY_META_PATH = "/api/survey/meta"; // siapkan jika perlu
const UPLOAD_TIMEOUT_MS = 2500; // jika fetch > 2.5s → antre (UI cepat dapat respons)

/* ===== IndexedDB (queue) ===== */
function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(QUEUE_DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function queueAdd(rec) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(rec);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function queueAll() {
  const db = await idbOpen();
  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  db.close();
  return items;
}
async function queueDel(id) {
  const db = await idbOpen();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function notifyClients(msg) {
  const arr = await self.clients.matchAll({ includeUncontrolled: true });
  for (const c of arr) {
    try {
      c.postMessage(msg);
    } catch (_) {}
  }
}

/* ===== Replay helpers ===== */
function sanitizeHeaders(raw) {
  const h = {};
  if (!raw) return h;
  for (const k in raw) {
    const lk = k.toLowerCase();
    if (
      [
        "content-length",
        "connection",
        "keep-alive",
        "proxy-connection",
        "transfer-encoding",
      ].includes(lk)
    )
      continue;
    h[lk] = raw[k];
  }
  return h;
}

async function processQueue() {
  const items = await queueAll();
  const okIds = [];

  for (const item of items) {
    try {
      const headers = sanitizeHeaders(item.headers || {});
      const res = await fetch(item.url, {
        method: item.method || "POST",
        headers,
        body: item.body || null,
      });

      if (res && res.ok) {
        await queueDel(item.id);
        okIds.push(item.id);
        await notifyClients({ type: "upload-synced", queueId: item.id });
      } else {
        const code = res ? res.status : 0;
        await notifyClients({
          type: "upload-error",
          queueId: item.id,
          status: code,
          message: `Replay failed: ${code}`,
        });
      }
    } catch (e) {
      await notifyClients({
        type: "upload-error",
        queueId: item.id,
        message: String(e),
      });
    }
  }

  if (okIds.length)
    await notifyClients({ type: "sync-complete", queueIds: okIds });
}

/* ===== Cache utils ===== */
async function precache(cache, urls) {
  await Promise.all(
    urls.map(async (u) => {
      try {
        await cache.add(new Request(u, { cache: "reload" }));
      } catch (_) {}
    })
  );
}
async function putDual(cache, req, res) {
  try {
    await cache.put(req, res.clone());
  } catch (_) {}
  try {
    const url = new URL(req.url);
    const pathReq = new Request(url.pathname, {
      headers: req.headers,
      mode: "same-origin",
    });
    await cache.put(pathReq, res.clone());
  } catch (_) {}
}
async function matchHtml(urlOrReq) {
  let hit = await caches.match(urlOrReq, { ignoreSearch: true });
  if (hit) return hit;
  const url =
    typeof urlOrReq === "string"
      ? new URL(urlOrReq, self.location.origin)
      : new URL(urlOrReq.url);
  const candidates = [
    url.href,
    url.pathname + url.hash,
    url.pathname,
    url.pathname.replace(/\/$/, ""),
    url.pathname.endsWith("/") ? url.pathname : url.pathname + "/",
  ];
  for (const c of candidates) {
    hit = await caches.match(c, { ignoreSearch: true });
    if (hit) return hit;
  }
  return null;
}

/* ===== Install / Activate ===== */
self.addEventListener("install", (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await precache(cache, APP_SHELL);
    })()
  );
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((k) =>
            k.startsWith("magang-app-") &&
            k !== STATIC_CACHE &&
            k !== DYNAMIC_CACHE
              ? caches.delete(k)
              : Promise.resolve()
          )
        )
      )
  );
  self.clients.claim();
});

/* ===== Background Sync & Messages ===== */
self.addEventListener("sync", (e) => {
  if (e.tag === "photo-upload-sync" || e.tag === "meta-sync") {
    e.waitUntil(processQueue());
  }
});
self.addEventListener("message", (e) => {
  if (e.data?.type === "force-sync") {
    e.waitUntil(processQueue());
  }
  if (e.data?.type === "heartbeat") {
    e.waitUntil(
      (async () => {
        const items = await queueAll();
        if (items.length) await processQueue();
      })()
    );
  }
  if (e.data?.type === "persist-now") {
    notifyClients({ type: "persist-now" });
  }
});

/* ===== Fetch ===== */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // 🔐 Bypass untuk Supabase auth callback/confirm (dari code 1)
  if (
    url.origin === self.location.origin &&
    (url.pathname === "/auth/callback" ||
      url.pathname.startsWith("/auth/callback") ||
      url.pathname === "/auth/confirm" ||
      url.pathname.startsWith("/auth/confirm"))
  ) {
    return;
  }

  // 0) Intercept upload/meta: network-first dengan TIMEOUT; kalau lambat/gagal → antre
  if (
    req.method === "POST" &&
    (url.pathname === UPLOAD_PATH ||
      url.pathname === META_PATH ||
      url.pathname === SURVEY_UPLOAD_PATH)
    // || url.pathname === SURVEY_META_PATH
  ) {
    e.respondWith(
      (async () => {
        try {
          const onlineRes = await Promise.race([
            fetch(req.clone()),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error("timeout")), UPLOAD_TIMEOUT_MS)
            ),
          ]);

          // ACK cepat ke client jika upload sukses (Instalasi & Survey)
          if (
            url.pathname === UPLOAD_PATH ||
            url.pathname === SURVEY_UPLOAD_PATH
          ) {
            try {
              const resClone = onlineRes.clone();
              const data = await resClone.json().catch(() => null);
              if (
                data &&
                (data.ok || data.photoUrl || data.thumbUrl || data.thumb_url)
              ) {
                await notifyClients({
                  type: "upload-online-ack",
                  categoryId: data.categoryId || null, // instalasi kadang kirim
                  thumbUrl: data.thumbUrl || data.thumb_url || null, // camel/snake
                  serialNumber: data.serialNumber || null,
                  meter: typeof data.meter === "number" ? data.meter : null,
                });
                await notifyClients({ type: "persist-now" });
              }
            } catch (_) {}
          }
          return onlineRes;
        } catch {
          // timeout / error → antre
          const body = await req.clone().arrayBuffer();
          const headers = {};
          req.headers.forEach((v, k) => (headers[k] = v));
          const id = Date.now() + "-" + Math.random().toString(36).slice(2);
          await queueAdd({
            id,
            url: req.url,
            method: "POST",
            headers,
            body,
            createdAt: Date.now(),
            // tandai meta via path:
            kind:
              url.pathname ===
              META_PATH /* || url.pathname === SURVEY_META_PATH */
                ? "meta"
                : "upload",
          });
          try {
            await self.registration.sync.register(
              url.pathname ===
                META_PATH /* || url.pathname === SURVEY_META_PATH */
                ? "meta-sync"
                : "photo-upload-sync"
            );
          } catch (_) {}
          return new Response(
            JSON.stringify({ status: "queued", queueId: id }),
            { headers: { "Content-Type": "application/json" } }
          );
        }
      })()
    );
    return;
  }

  if (req.method !== "GET") return;

  const isSameOrigin = url.origin === self.location.origin;
  const accept = req.headers.get("accept") || "";
  const isHTML = req.mode === "navigate" || accept.includes("text/html");

  // 🛡️ Bypass cache untuk Supabase & cross-origin JSON (hindari data basi)
  const isSupabase = /\.supabase\.(co|net)$/.test(url.hostname);
  const wantsJson = accept.includes("application/json");
  if (!isSameOrigin && (isSupabase || wantsJson)) {
    e.respondWith(fetch(req)); // network-only
    return;
  }

  // 1) HTML → network-first; fallback cache/offline
  if (isHTML) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          const resForCache = res.clone();
          e.waitUntil(
            caches.open(DYNAMIC_CACHE).then((c) => putDual(c, req, resForCache))
          );
          return res;
        } catch {
          return (
            (await matchHtml(req)) ||
            (await caches.match("/", { ignoreSearch: true })) ||
            (await caches.match("/offline", { ignoreSearch: true })) ||
            new Response("<h1>Offline</h1>", {
              headers: { "Content-Type": "text/html" },
            })
          );
        }
      })()
    );
    return;
  }

  // 2) Static assets (same-origin) → stale-while-revalidate
  const isStatic =
    isSameOrigin &&
    (url.pathname.startsWith("/_next/") ||
      /\.(?:js|css|woff2?|ttf|eot|png|jpg|jpeg|gif|svg|webp|ico)$/i.test(
        url.pathname
      ));
  if (isStatic) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(DYNAMIC_CACHE);
        const cached = await cache.match(req, { ignoreSearch: true });
        const network = fetch(req)
          .then((res) => {
            const copy = res.clone();
            e.waitUntil(cache.put(req, copy));
            return res;
          })
          .catch(() => null);
        return cached || (await network) || (await matchHtml("/offline"));
      })()
    );
    return;
  }

  // 3) API GET (same-origin) → network-first + fallback cache
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(req);
          const copy = r.clone();
          e.waitUntil(
            caches.open(DYNAMIC_CACHE).then((c) => putDual(c, req, copy))
          );
          return r; // <-- return di dalam try, variabel in-scope
        } catch {
          const hit = await caches.match(req, { ignoreSearch: true });
          if (hit) return hit;
          return new Response(JSON.stringify({ error: "offline" }), {
            headers: { "Content-Type": "application/json" },
            status: 503,
          });
        }
      })()
    );
    return;
  }

  // 4) Default → network-first; fallback cache
  e.respondWith(
    (async () => {
      try {
        return await fetch(req);
      } catch {
        return (
          (await caches.match(req, { ignoreSearch: true })) || Response.error()
        );
      }
    })()
  );
});
