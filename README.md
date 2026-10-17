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
mkdir -p ~/.config/systemd/user
cp deploy/ununduck-*.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user start ununduck-update.service   # first bangs.json
systemctl --user enable --now ununduck-update.timer ununduck-web.service
sudo loginctl enable-linger "$USER"              # keep units running while logged out / after reboot
```

The units assume Bun at `/usr/bin/bun`; change `ExecStart` in `ununduck-web.service` if yours
lives elsewhere (`command -v bun`).

nginx only proxies, so it needs no access to your home directory. Edit `server_name` and the
certificate paths in `deploy/nginx.conf` first. On nginx < 1.25.1 drop `http2 on;` and use
`listen 443 ssl http2;`.

```sh
sudo cp deploy/nginx.conf /etc/nginx/conf.d/ununduck.conf
sudo nginx -t && sudo systemctl reload nginx
```

Service workers need HTTPS. Logs: `journalctl --user -u ununduck-web -u ununduck-update`.

Set `https://search.example.com/?q=%s` as the browser's default search engine, then open
`https://search.example.com/` once on each device to install the worker.
