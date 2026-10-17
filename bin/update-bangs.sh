#!/bin/sh
# Pull Kagi's bang repo and write a trimmed bangs.json for the web root.
# Drops data/kagi_bangs.json entirely and every bangs.json entry that points at Kagi itself.
set -eu

# Everything lives next to this script: <root>/bin, <root>/www, <root>/state.
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_URL="${REPO_URL:-https://github.com/kagisearch/bangs.git}"
REPO_DIR="${REPO_DIR:-$ROOT/state/bangs}"
OUT_FILE="${OUT_FILE:-$ROOT/www/bangs.json}"

mkdir -p "$(dirname "$REPO_DIR")"
MIN_BANGS="${MIN_BANGS:-5000}"

if [ -d "$REPO_DIR/.git" ]; then
  git -C "$REPO_DIR" fetch --quiet --depth 1 origin main
  git -C "$REPO_DIR" reset --quiet --hard FETCH_HEAD
else
  git clone --quiet --depth 1 --branch main "$REPO_URL" "$REPO_DIR"
fi

tmp="$(mktemp "$OUT_FILE.XXXXXX")"
trap 'rm -f "$tmp"' EXIT

# Kagi-specific: relative URLs (served by kagi.com) or any kagi.com host/domain.
# Only `!kagi` is kept, as a fixed entry with an absolute URL (appended at the end).
jq -c '
  def kagi: test("^([^/]*\\.)?kagi\\.com$");
  [ .[]
    | select(
        (.u | startswith("/") | not)
        and (.d | kagi | not)
        and ((.u | capture("^[a-zA-Z]+://(?<h>[^/:?#]*)").h // "") | kagi | not)
      )
    | {t, ts, u, x, fmt, d, ad}
    | with_entries(select(.value != null))
  ] + [{t: "kagi", u: "https://kagi.com/search?q={{{s}}}", d: "kagi.com"}]
' "$REPO_DIR/data/bangs.json" >"$tmp"

count="$(jq length "$tmp")"
if [ "$count" -lt "$MIN_BANGS" ]; then
  echo "refusing to publish: only $count bangs (< $MIN_BANGS)" >&2
  exit 1
fi

chmod 644 "$tmp"
mv -f "$tmp" "$OUT_FILE"
trap - EXIT
echo "published $count bangs to $OUT_FILE ($(git -C "$REPO_DIR" rev-parse --short HEAD))"
