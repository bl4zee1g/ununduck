importScripts("/resolve.js");

const DATA_CACHE = "ununduck-data";
const DATA_URL = "/bangs.json";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FETCHED_AT = "x-ununduck-fetched-at";
const ETAG = "x-ununduck-etag";

// Parsed index survives as long as the worker stays alive; rebuilt from Cache Storage after.
let index = null;
let fetchedAt = 0;
let refreshing = null;

async function refresh() {
  refreshing ??= (async () => {
    // `no-cache` revalidates against nginx's ETag; unchanged data costs a 304.
    const res = await fetch(DATA_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${DATA_URL}: HTTP ${res.status}`);
    const text = await res.text();
    const bangs = JSON.parse(text);
    if (!Array.isArray(bangs) || bangs.length === 0) throw new Error(`${DATA_URL}: no bangs`);

    const now = Date.now();
    const cache = await caches.open(DATA_CACHE);
    await cache.put(
      DATA_URL,
      new Response(text, {
        headers: {
          "content-type": "application/json",
          [FETCHED_AT]: String(now),
          [ETAG]: res.headers.get("etag") ?? "",
        },
      }),
    );
    index = self.Ununduck.buildIndex(bangs);
    fetchedAt = now;
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function loadIndex() {
  if (index) return;
  const cached = await (await caches.open(DATA_CACHE)).match(DATA_URL);
  if (!cached) return;
  index = self.Ununduck.buildIndex(await cached.json());
  fetchedAt = Number(cached.headers.get(FETCHED_AT)) || 0;
}

async function redirect(query, event) {
  await loadIndex();
  if (!index) {
    // Cache evicted or never filled: wait for the network once.
    await refresh().catch(() => {});
  } else if (Date.now() - fetchedAt > MAX_AGE_MS) {
    // Stale: redirect from the old data now, update in the background.
    event.waitUntil(refresh().catch(() => {}));
  }

  const engine = await self.Ununduck.getEngine();
  let target;
  try {
    target = index
      ? self.Ununduck.resolve(index, query, engine)
      : self.Ununduck.defaultSearch(query, engine);
    new URL(target); // Response.redirect throws on malformed URLs.
  } catch {
    target = self.Ununduck.defaultSearch(query, engine);
  }
  return Response.redirect(target, 302);
}

self.addEventListener("install", (event) => {
  event.waitUntil(refresh().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.mode !== "navigate") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname !== "/") return;
  const query = url.searchParams.get("q");
  if (!query?.trim()) return;
  event.respondWith(redirect(query, event));
});

// The landing page's "Update" button: refresh now and report back on the page's port.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "update") return;
  const port = event.ports[0];
  event.waitUntil(
    refresh().then(
      () => port?.postMessage({ ok: true }),
      (err) => port?.postMessage({ ok: false, error: String(err) }),
    ),
  );
});
