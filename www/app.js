// Runs only when the service worker isn't handling the request yet
// (first visit, or a hard reload that bypasses it).
const swReady = "serviceWorker" in navigator
  ? navigator.serviceWorker.register("/sw.js").catch((err) => console.error(err))
  : Promise.resolve();

async function redirect(query) {
  const engine = await Ununduck.getEngine();
  let target;
  try {
    const res = await fetch("/bangs.json");
    target = Ununduck.resolve(Ununduck.buildIndex(await res.json()), query, engine);
  } catch {
    target = Ununduck.defaultSearch(query, engine);
  }
  // Let the worker finish installing so later searches skip this page.
  await Promise.race([swReady, new Promise((r) => setTimeout(r, 1000))]);
  location.replace(target);
}

const DATA_URL = "/bangs.json";

async function cachedEntry() {
  const cache = await globalThis.caches?.open("ununduck-data");
  return cache?.match(DATA_URL);
}

// HEAD only: compares ETags without downloading the 1 MB list.
async function latestEtag() {
  const res = await fetch(DATA_URL, { method: "HEAD", cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.headers.get("etag");
}

async function updateViaWorker() {
  const registration = await navigator.serviceWorker.ready;
  const channel = new MessageChannel();
  const reply = new Promise((resolve, reject) => {
    channel.port1.onmessage = ({ data }) =>
      data.ok ? resolve() : reject(new Error(data.error));
  });
  registration.active.postMessage({ type: "update" }, [channel.port2]);
  return reply;
}

async function showStatus() {
  const status = document.getElementById("status");
  const update = document.getElementById("update");
  update.hidden = true;

  const cached = await cachedEntry();
  if (!cached) {
    status.textContent = "No bangs cached on this device yet.";
    return;
  }
  const count = (await cached.json()).length;
  const fetchedAt = new Date(Number(cached.headers.get("x-ununduck-fetched-at")));
  const installed = `${count} bangs installed on this device (fetched ${fetchedAt.toLocaleString()}).`;
  status.textContent = `${installed} Checking for updates…`;

  try {
    const latest = await latestEtag();
    if (latest && latest !== cached.headers.get("x-ununduck-etag")) {
      status.textContent = `${installed} A newer bang list is available.`;
      update.hidden = false;
    } else {
      status.textContent = `${installed} Up to date.`;
    }
  } catch {
    status.textContent = `${installed} Couldn't reach the server to check for updates.`;
  }
}

function renderHome() {
  document.querySelector("main").hidden = false;
  const input = document.getElementById("url");
  input.value = `${location.origin}/?q=%s`;
  const engine = document.getElementById("engine");
  for (const [id, { name }] of Object.entries(Ununduck.ENGINES)) engine.add(new Option(name, id));
  Ununduck.getEngine().then((id) => (engine.value = id));
  engine.addEventListener("change", () => Ununduck.setEngine(engine.value));
  const copy = document.getElementById("copy");
  copy.addEventListener("click", async () => {
    await navigator.clipboard.writeText(input.value);
    copy.textContent = "Copied";
    setTimeout(() => (copy.textContent = "Copy"), 2000);
  });
  const update = document.getElementById("update");
  update.addEventListener("click", async () => {
    update.disabled = true;
    update.textContent = "Updating…";
    try {
      await updateViaWorker();
    } catch (err) {
      document.getElementById("status").textContent = `Update failed: ${err.message}`;
      update.disabled = false;
      update.textContent = "Retry update";
      return;
    }
    update.disabled = false;
    update.textContent = "Update bangs";
    await showStatus();
  });
  swReady.then(() => navigator.serviceWorker?.ready).then(showStatus);
}

const query = new URLSearchParams(location.search).get("q")?.trim();
if (query) redirect(query);
else renderHome();
