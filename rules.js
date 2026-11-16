/* Survival Radar — regras determinísticas (sem rede, testáveis em Node). */
(function (root) {
  'use strict';

  const EARTH_R = 6371008.8;
  const toRad = (d) => (d * Math.PI) / 180;

  function haversine(a, b) {
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Distância de p ao segmento ab, em metros (projeção equirretangular local).
  function distToSegment(p, a, b) {
    const k = Math.cos(toRad(p.lat));
    const ax = (a.lon - p.lon) * k, ay = a.lat - p.lat;
    const bx = (b.lon - p.lon) * k, by = b.lat - p.lat;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : -(ax * dx + ay * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return toRad(Math.sqrt(cx * cx + cy * cy)) * EARTH_R;
  }

  function distToPolyline(p, pts) {
    if (!pts || pts.length === 0) return Infinity;
    if (pts.length === 1) return haversine(p, pts[0]);
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) best = Math.min(best, distToSegment(p, pts[i - 1], pts[i]));
    return best;
  }

  function point(lat, lon, dist, bearingDeg) {
    const d = dist / EARTH_R, br = toRad(bearingDeg);
    const la1 = toRad(lat), lo1 = toRad(lon);
    const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
    const lo2 = lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
    return { lat: (la2 * 180) / Math.PI, lon: (((lo2 * 180) / Math.PI + 540) % 360) - 180 };
  }

  function median(arr) {
    const v = arr.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return NaN;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }

  const EMERGENCY_NAME = /\b(UPA|AMA|PS|Pronto[ -]?Socorro|Pronto[ -]?Atendimento|Emerg[êe]ncia)\b/i;

  const CATEGORIES = {
    hospital:  { label: 'Hospitais', group: 'service', color: '#63b0fd' },
    emergency: { label: 'UPA / Pronto atendimento', group: 'service', color: '#63b0fd' },
    fire:      { label: 'Bombeiros', group: 'service', color: '#eeeeee' },
    police:    { label: 'Polícia', group: 'service', color: '#bfbfbf' },
    ambulance: { label: 'Bases de ambulância', group: 'service', color: '#63b0fd' },
    shelter:   { label: 'Pontos de encontro de emergência', group: 'service', color: '#3fb8c4' },
    pharmacy:  { label: 'Farmácias', group: 'service', color: '#a3a3a3' },
    fuel:      { label: 'Postos de combustível', group: 'service', color: '#6e6e6e' },
    refinery:  { label: 'Refinarias, petróleo e petroquímicas', group: 'infra', color: '#ff6b7a' },
    chemical:  { label: 'Indústria química', group: 'infra', color: '#ff6b7a' },
    fuel_depot:{ label: 'Depósitos de combustível e gás', group: 'infra', color: '#ff6b7a' },
    pipeline:  { label: 'Dutos de gás e óleo', group: 'infra', color: '#ff6b7a' },
    nuclear:   { label: 'Usinas nucleares', group: 'infra', color: '#ff6b7a' },
    power_plant:{ label: 'Usinas de energia', group: 'infra', color: '#ffab40' },
    substation:{ label: 'Subestações elétricas', group: 'infra', color: '#ffab40' },
    airport:   { label: 'Aeroportos e aeródromos', group: 'infra', color: '#ffab40' },
    military:  { label: 'Áreas militares', group: 'infra', color: '#ffab40' },
    dam:       { label: 'Barragens', group: 'infra', color: '#ffab40' },
  };

  const SINGULAR = { hospital: 'Hospital', emergency: 'Pronto atendimento', fire: 'Bombeiros', police: 'Polícia', ambulance: 'Base de ambulância',
    shelter: 'Ponto de encontro', pharmacy: 'Farmácia', fuel: 'Posto de combustível', refinery: 'Instalação de petróleo', chemical: 'Indústria química',
    fuel_depot: 'Depósito de combustível ou gás', pipeline: 'Duto', nuclear: 'Usina nuclear', power_plant: 'Usina de energia', substation: 'Subestação',
    airport: 'Aeródromo', military: 'Área militar', dam: 'Barragem' };

  function classify(t) {
    if (!t) return null;
    const name = t.name || '';
    if (t.amenity === 'hospital' || t.healthcare === 'hospital') return 'hospital';
    if ((t.amenity === 'clinic' || t.healthcare === 'clinic' || t.healthcare === 'emergency') &&
        (t.emergency === 'yes' || EMERGENCY_NAME.test(name))) return 'emergency';
    if (t.amenity === 'fire_station') return 'fire';
    if (t.amenity === 'police') return 'police';
    if (t.emergency === 'ambulance_station') return 'ambulance';
    if (t.emergency === 'assembly_point') return 'shelter';
    if (t.amenity === 'pharmacy') return 'pharmacy';
    if (t.amenity === 'fuel') return 'fuel';
    if (t.man_made === 'pipeline' && /gas|oil|fuel|petro|naphtha|diesel/i.test(t.substance || t.type || '')) return 'pipeline';
    if (t.power === 'plant' && /nuclear/i.test(t['plant:source'] || t['generator:source'] || '')) return 'nuclear';
    if (/^(refinery|oil|petrochemical)$/.test(t.industrial || '') || (t.man_made === 'works' && /oil|petro/i.test(t.product || ''))) return 'refinery';
    if (t.industrial === 'chemical') return 'chemical';
    if (/^(fuel_depot|gas|gas_storage|oil_storage)$/.test(t.industrial || '') ||
        (t.man_made === 'storage_tank' && /oil|gas|fuel|petrol|diesel|lpg|glp/i.test(t.content || ''))) return 'fuel_depot';
    if (t.power === 'plant') return 'power_plant';
    if (t.power === 'substation') return 'substation';
    if (t.aeroway === 'aerodrome') return 'airport';
    if (t.landuse === 'military' || (t.military && t.military !== 'no')) return 'military';
    if (t.waterway === 'dam' || t.man_made === 'dam') return 'dam';
    return null;
  }

  function buildOverpassQuery(lat, lon, serviceRadius) {
    const r = Math.round(serviceRadius);
    const near = Math.min(3000, r);
    const c = `${lat.toFixed(6)},${lon.toFixed(6)}`;
    return `[out:json][timeout:90];
(
  nwr(around:${r},${c})[amenity~"^(hospital|fire_station|police)$"];
  nwr(around:${r},${c})[healthcare~"^(hospital|emergency)$"];
  nwr(around:${r},${c})[amenity=clinic][emergency=yes];
  nwr(around:${r},${c})[amenity=clinic][name~"UPA|AMA|Pronto|Emerg",i];
  nwr(around:${r},${c})[emergency~"^(ambulance_station|assembly_point)$"];
  nwr(around:${near},${c})[amenity~"^(pharmacy|fuel)$"];
  nwr(around:15000,${c})[industrial~"^(refinery|oil|petrochemical|chemical|fuel_depot|gas|gas_storage|oil_storage)$"];
  nwr(around:15000,${c})[man_made=works][product~"oil|petro",i];
  nwr(around:3000,${c})[man_made=storage_tank][content~"oil|gas|fuel|petrol|diesel|lpg|glp",i];
  nwr(around:40000,${c})[power=plant]["plant:source"=nuclear];
  nwr(around:5000,${c})[power=plant];
  nwr(around:1000,${c})[power=substation];
  nwr(around:15000,${c})[aeroway=aerodrome];
  nwr(around:10000,${c})[landuse=military];
  nwr(around:10000,${c})[military][military!=no];
  nwr(around:30000,${c})[waterway=dam];
)->.a;
.a out center tags;
way(around:3000,${c})[man_made=pipeline]->.p;
.p out geom tags;`;
  }

  // Converte a resposta do Overpass em itens classificados, com distância ao ponto.
  function parseOverpass(json, origin) {
    const out = {};
    const seen = new Set();
    for (const el of (json && json.elements) || []) {
      const t = el.tags || {};
      const cat = classify(t);
      if (!cat) continue;
      let lat, lon, dist;
      if (el.geometry && cat === 'pipeline') {
        const pts = el.geometry.map((g) => ({ lat: g.lat, lon: g.lon }));
        dist = distToPolyline(origin, pts);
        const mid = pts[Math.floor(pts.length / 2)];
        lat = mid.lat; lon = mid.lon;
      } else {
        lat = el.lat != null ? el.lat : el.center && el.center.lat;
        lon = el.lon != null ? el.lon : el.center && el.center.lon;
        if (lat == null || lon == null) continue;
        dist = haversine(origin, { lat, lon });
      }
      const name = t.name || t.operator || t['name:pt'] || SINGULAR[cat];
      const key = cat + '|' + name.toLowerCase() + '|' + Math.round(lat * 1000) + '|' + Math.round(lon * 1000);
      if (seen.has(key)) continue;
      seen.add(key);
      (out[cat] = out[cat] || []).push({
        cat, name, lat, lon, dist,
        osm: `${el.type}/${el.id}`,
        phone: t.phone || t['contact:phone'] || null,
        emergency: t.emergency === 'yes',
        hours: t.opening_hours || null,
        address: [t['addr:street'], t['addr:housenumber'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ') || null,
      });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.dist - b.dist);
    return out;
  }

  // Raio de busca por categoria (m). Serviços usam o raio escolhido pelo usuário.
  function radiusFor(cat, serviceRadius) {
    const fixed = { pharmacy: Math.min(3000, serviceRadius), fuel: Math.min(3000, serviceRadius),
      refinery: 15000, chemical: 15000, fuel_depot: 15000, pipeline: 3000, nuclear: 40000,
      power_plant: 5000, substation: 1000, airport: 15000, military: 10000, dam: 30000 };
    return fixed[cat] != null ? fixed[cat] : serviceRadius;
  }
  const MAX_RADIUS = 40000;

  // Blocos de 0,5° que cobrem o círculo de raio maxR.
  function tilesFor(lat, lon, maxR, tile) {
    tile = tile || 0.5;
    const dLat = maxR / 111320;
    const dLon = maxR / (111320 * Math.max(0.2, Math.cos(toRad(lat))));
    const keys = [];
    for (let y = Math.floor((lat - dLat + 90) / tile); y <= Math.floor((lat + dLat + 90) / tile); y++)
      for (let x = Math.floor((lon - dLon + 180) / tile); x <= Math.floor((lon + dLon + 180) / tile); x++)
        keys.push(`${y}_${x}`);
    return keys;
  }

  // Linhas dos blocos estáticos -> mesmo formato de parseOverpass.
  function fromTiles(rows, origin, serviceRadius, cats) {
    const out = {};
    const seen = new Set();
    for (const r of rows) {
      const cat = cats[r[0]];
      if (!cat || !CATEGORIES[cat]) continue;
      const key = cat + '|' + r[7];
      if (seen.has(key)) continue;
      seen.add(key);
      let lat = r[1], lon = r[2], dist;
      if (cat === 'pipeline') {
        dist = Infinity;
        for (const l of r[8] || []) {
          const pts = l.map(([a, b]) => ({ lat: a, lon: b }));
          const d = distToPolyline(origin, pts);
          if (d < dist) { dist = d; const mid = pts[Math.floor(pts.length / 2)]; lat = mid.lat; lon = mid.lon; }
        }
      } else dist = haversine(origin, { lat, lon });
      if (!(dist <= radiusFor(cat, serviceRadius))) continue;
      (out[cat] = out[cat] || []).push({
        cat, lat, lon, dist,
        name: r[3] || SINGULAR[cat],
        phone: r[4] || null, address: r[5] || null, emergency: r[6] === 1, osm: r[7],
      });
    }
    for (const k of Object.keys(out)) out[k].sort((a, b) => a.dist - b.dist);
    return out;
  }

  // Ponto dentro de polígono (anel [[lat,lon],...]), por ray casting.
  function inRing(p, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [yi, xi] = ring[i], [yj, xj] = ring[j];
      if (((yi > p.lat) !== (yj > p.lat)) && (p.lon < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  const CNES_HOSP = [5, 7, 15], CNES_URG = [20, 21, 73];
  // Linhas do CNES -> itens hospital/emergency com tipo e marcadores (24 h, maternidade, neonatal, pediátrico, SUS).
  function fromCnes(rows, origin, radius, tipos) {
    const out = { hospital: [], emergency: [] };
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r[7])) continue; seen.add(r[7]);
      const dist = haversine(origin, { lat: r[0], lon: r[1] });
      if (dist > radius) continue;
      const cat = CNES_HOSP.includes(r[5]) ? 'hospital' : CNES_URG.includes(r[5]) ? 'emergency' : null;
      if (!cat) continue;
      out[cat].push({ cat, lat: r[0], lon: r[1], dist, name: r[2] || SINGULAR[cat], phone: r[3] || null, address: r[4] || null,
        tipo: (tipos && tipos[r[5]]) || '', h24: !!(r[6] & 1), obst: !!(r[6] & 2), neo: !!(r[6] & 4), ped: !!(r[6] & 8), sus: !!(r[6] & 16), osm: 'cnes/' + r[7], official: true });
    }
    out.hospital.sort((a, b) => a.dist - b.dist); out.emergency.sort((a, b) => a.dist - b.dist);
    return out;
  }

  // Setores de risco do SGB: dentro de algum? qual o mais próximo?
  const trimDot = (t) => String(t || '').trim().replace(/[.\s]+$/, '');
  function geoRiskFrom(rows, origin) {
    let inside = null, nearest = null;
    const seen = new Set();
    for (const r of rows) {
      if (seen.has(r[4])) continue; seen.add(r[4]);
      for (const ring of r[5]) {
        const sector = { grau: r[0], tipo: r[1], local: trimDot(r[2]), munic: r[3], id: r[4] };
        if (inRing(origin, ring)) { if (!inside || /muito/i.test(sector.grau)) inside = sector; }
        const d = distToPolyline(origin, ring.map(([a, b]) => ({ lat: a, lon: b })));
        if (!nearest || d < nearest.dist) nearest = { ...sector, dist: d };
      }
    }
    return { inside, nearest };
  }

  const LEVEL_RANK = { alto: 3, moderado: 2, baixo: 1, info: 0 };

  function fmtDist(m) {
    if (!Number.isFinite(m)) return '—';
    return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',')} km`;
  }

  // ctx: { items, radius, elevation: {point, ring:[...]}, profile }
  function evaluate(ctx) {
    const f = [];
    const it = ctx.items || {};
    const first = (k) => (it[k] && it[k][0]) || null;
    const add = (level, title, detail) => f.push({ level, title, detail });
    const p = ctx.profile || {};

    // Infraestrutura crítica: [categoria, limite alto, limite moderado, texto]
    const infraRules = [
      ['refinery', 2000, 5000, 'Refinaria ou petroquímica', 'Risco de explosão, incêndio e nuvem tóxica. Em evento, saia contra o vento e em direção perpendicular à pluma.'],
      ['chemical', 2000, 5000, 'Indústria química', 'Risco de vazamento tóxico. Tenha plano de abrigo no local (vedar portas e janelas) e de saída contra o vento.'],
      ['fuel_depot', 1000, 3000, 'Depósito de combustível ou gás', 'Risco de incêndio e explosão. Conheça duas rotas de saída que não passem ao lado do depósito.'],
      ['pipeline', 200, 1000, 'Duto de gás ou óleo', 'Risco de vazamento e explosão em caso de ruptura. Cheiro de gás: saia sem acionar interruptores e ligue 193.'],
      ['nuclear', 10000, 30000, 'Usina nuclear', 'Siga o plano de emergência externo da usina e as orientações da Defesa Civil.'],
    ];
    for (const [cat, hi, mid, label, advice] of infraRules) {
      const x = first(cat);
      if (!x) continue;
      if (x.dist < hi) add('alto', `${label} a ${fmtDist(x.dist)}`, `${x.name}. ${advice}`);
      else if (x.dist < mid) add('moderado', `${label} a ${fmtDist(x.dist)}`, `${x.name}. ${advice}`);
    }
    const sub = first('substation');
    if (sub && sub.dist < 150) add('moderado', `Subestação elétrica a ${fmtDist(sub.dist)}`, 'Risco local de incêndio e de queda de energia prolongada no entorno em caso de falha.');
    const pp = first('power_plant');
    if (pp && pp.dist < 1000) add('moderado', `Usina de energia a ${fmtDist(pp.dist)}`, `${pp.name}. Infraestrutura crítica: área tende a ter acesso restrito em crise.`);
    const ap = first('airport');
    if (ap && ap.dist < 2000) add('moderado', `Aeroporto ou aeródromo a ${fmtDist(ap.dist)}`, `${ap.name}. Proximidade de rota de pouso e decolagem e de infraestrutura estratégica.`);
    const mil = first('military');
    if (mil && mil.dist < 2000) add('moderado', `Área militar a ${fmtDist(mil.dist)}`, `${mil.name}. Em conflito ou grave perturbação, entorno de instalações militares é área de restrição e de maior exposição.`);
    const dam = first('dam');
    if (dam) {
      if (dam.dist < 10000) add('moderado', `Barragem a ${fmtDist(dam.dist)}`, `${dam.name}. Se o endereço estiver a jusante (rio abaixo), pode estar na Zona de Autossalvamento. Verifique no SNISB e no plano de emergência da barragem.`);
      else add('info', `Barragem a ${fmtDist(dam.dist)}`, `${dam.name}. Verifique se o endereço está a jusante e a que distância pelo curso do rio.`);
    }

    // Relevo: ponto mais baixo que o entorno acumula água.
    const e = ctx.elevation;
    if (e && Number.isFinite(e.point) && e.ring && e.ring.length) {
      const med = median(e.ring);
      const delta = e.point - med;
      if (delta <= -10) add('alto', `Ponto baixo: ${Math.abs(Math.round(delta))} m abaixo do entorno`, `Altitude ${Math.round(e.point)} m; mediana do entorno (600 m) ${Math.round(med)} m. Forte indício de acúmulo de água em chuva intensa. Confirme com a Defesa Civil.`);
      else if (delta <= -4) add('moderado', `Ponto baixo: ${Math.abs(Math.round(delta))} m abaixo do entorno`, `Altitude ${Math.round(e.point)} m; mediana do entorno (600 m) ${Math.round(med)} m. Atenção a alagamento em chuva forte.`);
      else add('baixo', 'Relevo sem depressão relevante', `Altitude ${Math.round(e.point)} m; mediana do entorno ${Math.round(med)} m.`);
    }

    // Setores de risco geológico oficiais (SGB)
    const g = ctx.geoRisk;
    if (g && g.inside) add('alto', `Dentro de setor de risco geológico (${g.inside.grau.toLowerCase()})`, `${g.inside.tipo || 'Risco geológico'} · ${g.inside.local} · ${g.inside.munic}. Fonte: Serviço Geológico do Brasil. Combine o plano com a Defesa Civil do município.`);
    else if (g && g.nearest && g.nearest.dist < 300) add('moderado', `Setor de risco geológico a ${fmtDist(g.nearest.dist)}`, `${g.nearest.tipo || 'Risco geológico'} (grau ${g.nearest.grau.toLowerCase()}) · ${g.nearest.local}. Fonte: Serviço Geológico do Brasil.`);
    else if (g && g.nearest && g.nearest.dist < 1000) add('info', `Setor de risco geológico a ${fmtDist(g.nearest.dist)}`, `${g.nearest.tipo || 'Risco geológico'} (grau ${g.nearest.grau.toLowerCase()}). Fonte: Serviço Geológico do Brasil.`);

    // Acesso a serviços
    const hosp = [first('hospital'), first('emergency')].filter(Boolean).sort((a, b) => a.dist - b.dist)[0];
    const rLabel = fmtDist(ctx.radius);
    if (!hosp) add('alto', `Nenhum hospital ou pronto atendimento em ${rLabel}`, 'Pode ser lacuna de dados do OpenStreetMap. Identifique manualmente o pronto-socorro de referência e salve aqui.');
    else if (hosp.dist > 10000) add('moderado', `Atendimento de urgência mais próximo a ${fmtDist(hosp.dist)}`, `${hosp.name}. Distância alta para emergência; planeje transporte e teste o trajeto.`);
    else add('baixo', `Atendimento de urgência a ${fmtDist(hosp.dist)}`, hosp.name);

    const ped = [...(it.hospital || []), ...(it.emergency || [])].filter((x) => x.ped).sort((a, b) => a.dist - b.dist)[0];
    if (ped) add('info', `Atendimento pediátrico a ${fmtDist(ped.dist)}`, `${ped.name}${ped.h24 ? ' · 24 h' : ''}. Indício pelo nome no CNES: confirme por telefone.`);
    else if ((ctx.profile || {}).infants > 0 && (it.hospital || []).some((x) => x.official)) add('moderado', 'Nenhuma unidade pediátrica identificada no raio', 'O CNES não indica pediatria pelo nome das unidades próximas. Confirme com o plano de saúde qual pronto-socorro atende crianças.');

    const fire = first('fire');
    if (!fire) add('moderado', `Nenhum quartel de bombeiros em ${rLabel}`, 'Pode ser lacuna de dados. Tempo de resposta a incêndio tende a ser maior.');
    else if (fire.dist > 10000) add('moderado', `Bombeiros a ${fmtDist(fire.dist)}`, fire.name);

    if (!p.car && hosp && hosp.dist > 3000) add('moderado', `Sem carro: urgência a ${fmtDist(hosp.dist)} a pé`, 'Combine transporte de emergência com vizinhos ou parentes e salve o contato de táxi ou aplicativo.');

    f.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
    const top = f.reduce((m, x) => Math.max(m, LEVEL_RANK[x.level]), 0);
    const overall = top >= 3 ? 'alto' : top === 2 ? 'moderado' : 'baixo';
    return { findings: f, overall };
  }

  function recommend(ctx, evaluation) {
    const p = ctx.profile || {};
    const it = ctx.items || {};
    const a = [];
    const lv = (re) => evaluation.findings.some((x) => re.test(x.title) && (x.level === 'alto' || x.level === 'moderado'));

    a.push('Cadastre o CEP deste local na Defesa Civil: envie o CEP por SMS para 40199.');
    const hosp = [(it.hospital || [])[0], (it.emergency || [])[0]].filter(Boolean).sort((x, y) => x.dist - y.dist);
    if (hosp.length) a.push(`Faça uma vez, em horário de pico, o trajeto até ${hosp[0].name} e anote o tempo real.`);
    if (p.infants > 0 || p.kids > 0) a.push('Confirme por telefone ou com o plano de saúde quais destes hospitais têm pronto-socorro pediátrico 24 h. O mapa não traz essa informação.');
    if (p.elderly > 0 || p.mobility) a.push('Defina quem ajuda na saída de quem tem mobilidade reduzida e onde fica a cadeira de rodas ou o andador.');
    if (p.meds) a.push('Medicação ou equipamento elétrico: mantenha 30 dias de margem de medicação e energia de reserva (estação portátil) para o equipamento.');
    if (p.pets) a.push('Inclua os animais no plano de saída: caixa de transporte, ração e água para 3 dias.');
    if (lv(/Refinaria|química|Depósito|Duto|nuclear/i)) a.push('Planeje abrigo no local para vazamento tóxico: um cômodo com poucas janelas, fita e plástico para vedar, rádio a pilha.');
    if (lv(/Ponto baixo|Barragem/i)) a.push('Defina um ponto alto de refúgio a pé (andar alto de prédio de parente ou área elevada) e a rota até ele.');
    if (lv(/Bombeiros/i)) a.push('Tenha extintor ABC em casa e saiba usar. Revise a validade anualmente.');
    a.push('Salve este relatório neste aparelho para consulta offline e imprima uma cópia para a bolsa de emergência.');
    return a;
  }

  function reportText(model) {
    const L = [];
    L.push(`SURVIVAL RADAR — ${model.name || 'Local'}`);
    L.push(`${model.address || ''}`);
    L.push(`Coordenadas: ${model.lat.toFixed(5)}, ${model.lon.toFixed(5)} · Gerado em ${new Date(model.ts).toLocaleString('pt-BR')}`);
    L.push(`Exposição geral: ${model.evaluation.overall.toUpperCase()}`);
    L.push('');
    L.push('RISCOS');
    for (const x of model.evaluation.findings) L.push(`- [${x.level}] ${x.title} — ${x.detail}`);
    L.push('');
    L.push('AÇÕES');
    model.actions.forEach((x, i) => L.push(`${i + 1}. ${x}`));
    L.push('');
    L.push('SERVIÇOS MAIS PRÓXIMOS (linha reta)');
    for (const [k, c] of Object.entries(CATEGORIES)) {
      if (c.group !== 'service') continue;
      const list = (model.items[k] || []).slice(0, 3);
      if (!list.length) continue;
      L.push(`${c.label}:`);
      for (const x of list) L.push(`  - ${x.name} — ${fmtDist(x.dist)}${x.phone ? ' · ' + x.phone : ''}${x.address ? ' · ' + x.address : ''}`);
    }
    L.push('');
    L.push('INFRAESTRUTURA CRÍTICA NO ENTORNO');
    for (const [k, c] of Object.entries(CATEGORIES)) {
      if (c.group !== 'infra') continue;
      const x = (model.items[k] || [])[0];
      if (x) L.push(`- ${c.label}: ${x.name} — ${fmtDist(x.dist)}`);
    }
    L.push('');
    L.push('Emergência: SAMU 192 · Bombeiros 193 · Polícia 190 · Defesa Civil 199');
    L.push('Fontes: OpenStreetMap (Overpass), Open-Meteo. Distâncias em linha reta. Heurística de planejamento, não laudo técnico.');
    return L.join('\n');
  }

  function aiBriefing(model) {
    const p = model.profile || {};
    return [
      'Você é um especialista em gestão de risco e defesa civil no Brasil. Com base nos dados abaixo, monte um plano de preparação para esta família, objetivo e priorizado por perda esperada (probabilidade × impacto).',
      'Regras: use apenas os dados fornecidos e conhecimento público verificável; marque claramente o que é suposição; aponte lacunas de dados e como preenchê-las; não invente nomes de hospitais ou números de telefone.',
      'Entregue: (1) os 3 riscos mais relevantes para este endereço e por quê; (2) plano para 72 horas, 14 dias e evacuação; (3) o que verificar pessoalmente nesta semana.',
      '',
      `Perfil da família: ${p.adults || 0} adultos, ${p.infants || 0} crianças <2 anos, ${p.kids || 0} crianças de 2 a 12, ${p.elderly || 0} idosos; mobilidade reduzida: ${p.mobility ? 'sim' : 'não'}; depende de medicação/equipamento: ${p.meds ? 'sim' : 'não'}; carro: ${p.car ? 'sim' : 'não'}; animais: ${p.pets ? 'sim' : 'não'}.`,
      '',
      reportText(model),
    ].join('\n');
  }

  const api = { haversine, distToSegment, distToPolyline, point, median, classify, buildOverpassQuery, parseOverpass, radiusFor, tilesFor, fromTiles, fromCnes, geoRiskFrom, inRing, MAX_RADIUS, evaluate, recommend, reportText, aiBriefing, fmtDist, CATEGORIES, LEVEL_RANK };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SR = api;
})(typeof self !== 'undefined' ? self : this);
