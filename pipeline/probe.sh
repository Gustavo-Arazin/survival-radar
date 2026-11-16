#!/usr/bin/env bash
set -u
for f in DADOSABERTOS SRE SPR SFI INDE SUM; do echo "== $f =="; curl -sS --max-time 60 "https://www.snirh.gov.br/arcgis/rest/services/$f?f=json" | head -c 1500; echo; done
echo "== SGB amostra =="
curl -sS --max-time 120 "https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&outSR=4326&maxAllowableOffset=0.0001&resultRecordCount=2&f=geojson" | head -c 2500; echo
