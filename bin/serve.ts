// Serves ../www on 127.0.0.1. nginx proxies to it; nothing else touches the files.
const port = Number(process.env.PORT ?? 1338);
const root = new URL("../www/", import.meta.url).pathname;

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);
    let rel: string;
    try {
      rel = pathname === "/" ? "index.html" : decodeURIComponent(pathname.slice(1));
    } catch {
      return new Response("bad request", { status: 400 });
    }

    const path = new URL(rel, `file://${root}`).pathname;
    // Refuse anything that resolves outside www/.
    if (!path.startsWith(root)) return new Response("not found", { status: 404 });

    const file = Bun.file(path);
    if (!(await file.exists())) return new Response("not found", { status: 404 });

    // Revalidate every time: sw.js/resolve.js must pick up new builds, and bangs.json is
    // refreshed weekly. The ETag lets clients (and the landing page's HEAD check) tell
    // whether anything changed without downloading the file.
    const etag = `"${file.lastModified.toString(36)}-${file.size.toString(36)}"`;
    const headers = { "cache-control": "no-cache", etag };
    if (req.headers.get("if-none-match") === etag) {
      return new Response(null, { status: 304, headers });
    }
    return new Response(file, { headers });
  },
});

console.log(`ununduck serving ${root} on 127.0.0.1:${port}`);
