#!/usr/bin/env bash
# Sondagem das fontes oficiais (só leitura; resultado vai para o log).
set -u
echo "== CNES =="
curl -sSL --max-time 300 -o cnes.zip https://s3.sa-east-1.amazonaws.com/ckan.saude.gov.br/CNES/cnes_estabelecimentos_csv.zip && ls -lh cnes.zip && unzip -l cnes.zip | head -5 && unzip -p cnes.zip | head -c 3000 | iconv -f latin1 -t utf-8 | head -3
echo "== SGB risco: serviço =="
curl -sS --max-time 60 "https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer?f=json" | head -c 2500; echo
for L in 0 1 2; do echo "== SGB camada $L =="; curl -sS --max-time 60 "https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/$L?f=json" | head -c 1500; echo; curl -sS --max-time 60 "https://geoportal.sgb.gov.br/server/rest/services/gestaoterritorial/risco/MapServer/$L/query?where=1%3D1&returnCountOnly=true&f=json"; echo; done
echo "== SNISB candidatos =="
for u in "http://arquivos.ana.gov.br/institucional/sof/barragens/relatorio_barragens.csv" "https://www.snisb.gov.br/portal-snisb/api/barragem" "https://www.snisb.gov.br/portal-snisb/api/barragens" "https://www.snisb.gov.br/portal-snisb/inicio" "https://metadados.snirh.gov.br/geonetwork/srv/api/search/records/_search?q=barragens%20snisb" "https://www.snirh.gov.br/arcgis/rest/services?f=json"; do echo "-- $u"; curl -sSL --max-time 60 -o /tmp/p -w "%{http_code} %{content_type} %{size_download}\n" "$u"; head -c 600 /tmp/p | tr -d '\0'; echo; done
