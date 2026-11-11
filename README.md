# ununduck

Alternative to [unduck](https://github.com/t3dotgg/unduck) using [Kagi's bang list](https://github.com/kagisearch/bangs).
A service worker resolves `!bangs` on the device and answers the search navigation with a 302,
so after the first visit no page loads and the server doesn't have to be reachable.
Queries with no known bang go to Brave Search by default; each device can pick Google, DuckDuckGo, Ecosia, Qwant, Bing or Startpage on the landing page.

- Bangs: `kagisearch/bangs` `data/bangs.json`. Kagi-only entries are dropped: everything in
  `kagi_bangs.json`, and any bang whose domain or URL is `kagi.com` / `*.kagi.com` or relative. The only exception to this is !kagi.
- Multi-argument bangs (`x` regex): `!xec CHF USD 100`, `!rsr linux arch wiki`.
- Bang anywhere in the query: `rust traits !g`. A bare `!gh` opens the site's homepage.
- Once a device's cached bangs are over 30 days old, a search still redirects from the cache
  immediately and refreshes `bangs.json` in the background.
- Visiting the site itself shows how many bangs the device has, whether the server has a newer
  list, and an "Update bangs" button.
- Favicon: drop a PNG at `www/favicon.png`. Without one, the tab simply has no icon.
- Server: a weekly systemd timer pulls the bang repo and rewrites `www/bangs.json`; a small Bun
  server serves `www/` on `127.0.0.1:1338`; nginx terminates TLS and proxies to it.

## Install

Requires `git`, `jq`, `bun`, `nginx`. Everything runs as your own user (systemd _user_ units).
Paths below assume the project is at `~/data/ununduck`.

```sh
bun run <path to ununduck/bin/serve.ts>
```

Now just check the site, it tells you what to set as your default search engine :)
