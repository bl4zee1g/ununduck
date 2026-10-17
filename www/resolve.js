// Shared by the service worker (importScripts) and the page (<script>).
// Bang format: https://github.com/kagisearch/bangs#bang-format
(() => {
  // Where a query with no (known) bang goes. Chosen per device on the landing page.
  const ENGINES = {
    brave: { name: "Brave Search", url: "https://search.brave.com/search?q={{{s}}}" },
    google: { name: "Google", url: "https://www.google.com/search?q={{{s}}}" },
    duckduckgo: { name: "DuckDuckGo", url: "https://duckduckgo.com/?q={{{s}}}" },
    ecosia: { name: "Ecosia", url: "https://www.ecosia.org/search?q={{{s}}}" },
    qwant: { name: "Qwant", url: "https://www.qwant.com/?q={{{s}}}" },
    bing: { name: "Bing", url: "https://www.bing.com/search?q={{{s}}}" },
    startpage: { name: "Startpage", url: "https://www.startpage.com/sp/search?query={{{s}}}" },
  };
  const DEFAULT_ENGINE = "brave";
  // Stored in its own cache so bang-list refreshes (which only rewrite ununduck-data) never reset it.
  const SETTINGS_CACHE = "ununduck-settings";
  const ENGINE_KEY = "/engine";

  async function getEngine() {
    try {
      const hit = await (await caches.open(SETTINGS_CACHE)).match(ENGINE_KEY);
      const id = hit && (await hit.text());
      return id in ENGINES ? id : DEFAULT_ENGINE;
    } catch {
      return DEFAULT_ENGINE;
    }
  }

  async function setEngine(id) {
    if (!(id in ENGINES)) throw new Error(`unknown engine: ${id}`);
    await (await caches.open(SETTINGS_CACHE)).put(ENGINE_KEY, new Response(id));
  }
  // Kagi's default when `fmt` is absent: every flag enabled.
  const ALL_FLAGS = [
    "open_base_path",
    "open_snap_domain",
    "url_encode_placeholder",
    "url_encode_space_to_plus",
  ];

  function buildIndex(bangs) {
    const index = new Map();
    for (const bang of bangs) {
      for (const trigger of [bang.t, ...(bang.ts ?? [])]) {
        const key = trigger.toLowerCase();
        if (!index.has(key)) index.set(key, bang);
      }
    }
    return index;
  }

  function encode(value, flags) {
    if (flags.includes("url_encode_placeholder")) {
      const encoded = encodeURIComponent(value);
      return flags.includes("url_encode_space_to_plus")
        ? encoded.replace(/%20/g, "+")
        : encoded;
    }
    return flags.includes("url_encode_space_to_plus")
      ? value.replace(/ /g, "+")
      : value;
  }

  function defaultSearch(query, engine = DEFAULT_ENGINE) {
    const url = (ENGINES[engine] ?? ENGINES[DEFAULT_ENGINE]).url;
    return url.replace("{{{s}}}", encode(query, ALL_FLAGS));
  }

  function homepage(bang, flags) {
    if (flags.includes("open_snap_domain") && bang.ad) return `https://${bang.ad}/`;
    if (flags.includes("open_base_path")) {
      try {
        return new URL(bang.u).origin + "/";
      } catch {
        return `https://${bang.d}/`;
      }
    }
    return bang.u.replace("{{{s}}}", "").replace(/\$\d+/g, "");
  }

  // Multi-arg bangs: `x` is matched against the text after the trigger and
  // its groups fill `$1`, `$2`, ... in `u`. Retried case-insensitively so
  // `!xec chf usd 100` works like `!xec CHF USD 100`.
  function applyPattern(bang, rest, flags) {
    for (const regexFlags of ["", "i"]) {
      let match;
      try {
        match = rest.match(new RegExp(bang.x, regexFlags));
      } catch {
        return null;
      }
      if (match) {
        return bang.u.replace(/\$(\d+)/g, (_, i) => encode(match[i] ?? "", flags));
      }
    }
    return null;
  }

  function resolve(index, rawQuery, engine = DEFAULT_ENGINE) {
    const query = rawQuery.trim();
    // First `!trigger` token (start of query or after whitespace) that is a known bang.
    for (const match of query.matchAll(/(^|\s)!(\S+)/g)) {
      const bang = index.get(match[2].toLowerCase());
      if (!bang) continue;

      const start = match.index + match[1].length;
      const rest = (query.slice(0, start) + query.slice(start + match[2].length + 1))
        .replace(/\s+/g, " ")
        .trim();
      const flags = bang.fmt ?? ALL_FLAGS;

      if (!rest) return homepage(bang, flags);
      if (bang.x) {
        const url = applyPattern(bang, rest, flags);
        if (url) return url;
        // Arguments don't fit the pattern: plain search with the remainder.
        return bang.u.includes("{{{s}}}")
          ? bang.u.replace("{{{s}}}", encode(rest, flags))
          : defaultSearch(rest, engine);
      }
      return bang.u.replace("{{{s}}}", encode(rest, flags));
    }
    // No known bang: pass the query to the chosen engine untouched (it may know its own bangs).
    return defaultSearch(query, engine);
  }

  self.Ununduck = { ENGINES, DEFAULT_ENGINE, getEngine, setEngine, buildIndex, resolve, defaultSearch };
})();
