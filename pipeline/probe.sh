#!/usr/bin/env bash
set -u
for f in DADOSABERTOS SPR INDE SGH SGI STI SIP; do curl -sS --max-time 60 "https://www.snirh.gov.br/arcgis/rest/services/$f?f=json" | python3 -c "import sys,json; [print(s['name'],s['type']) for s in json.load(sys.stdin).get('services',[]) if any(k in s['name'].lower() for k in ['barr','snisb','reserv','dam'])]"; done
echo "== INDE camadas =="; curl -sS --max-time 60 "https://www.snirh.gov.br/arcgis/rest/services/INDE/Camadas/MapServer?f=json" | python3 -c "import sys,json; [print(l['id'],l['name']) for l in json.load(sys.stdin).get('layers',[])]" | grep -i -E "barr|snisb|reserv" 
