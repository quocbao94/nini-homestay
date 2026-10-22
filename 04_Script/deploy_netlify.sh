#!/usr/bin/env bash
# Dang thu muc web/ len Netlify qua API (khong can GitHub Desktop).
# Token doc tu file .netlify_token o thu muc cha cua repo (KHONG nam trong repo).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
TOKEN_FILE="${NETLIFY_TOKEN_FILE:-$REPO/../.netlify_token}"
SITE="${NETLIFY_SITE:-nini-homestay}"
MSG="${1:-Cap nhat tu Claude}"
TOKEN="$(tr -d ' \r\n' < "$TOKEN_FILE")"
API=https://api.netlify.com/api/v1
SITE_ID=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/sites?name=$SITE&filter=all" | python3 -c "import sys,json;d=[s for s in json.load(sys.stdin) if s['name']=='$SITE'];print(d[0]['site_id'] if d else '')")
[ -n "$SITE_ID" ] || { echo "Khong tim thay site $SITE"; exit 1; }
ZIP=$(mktemp --suffix=.zip)
python3 - "$REPO/web" "$ZIP" <<'PY'
import sys,os,zipfile
src,out=sys.argv[1],sys.argv[2]
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
    for r,_,fs in os.walk(src):
        for f in fs:
            p=os.path.join(r,f); z.write(p,os.path.relpath(p,src))
PY
TITLE=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$MSG")
RES=$(curl -sf -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/zip" --data-binary @"$ZIP" "$API/sites/$SITE_ID/deploys?title=$TITLE")
rm -f "$ZIP"
echo "$RES" | python3 -c "import sys,json;d=json.load(sys.stdin);print('Deploy',d['id'],d['state'],d.get('ssl_url') or d.get('url'))"
