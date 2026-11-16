/* Survival Radar — interface. Nenhum dado sai do aparelho além das consultas públicas de mapa. */
(function () {
  'use strict';
  const SR = window.SR;
  const $ = (id) => document.getElementById(id);

  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ];
  const NOMINATIM = 'https://nominatim.openstreetmap.org';
  const ELEVATION = 'https://api.open-meteo.com/v1/elevation';
  const STORE_KEY = 'sr_saved_v1';
  const PROFILE_KEY = 'sr_profile_v1';

  let current = null; // modelo do relatório atual

  // ---------- armazenamento local seguro ----------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  };

  // ---------- mapa ----------
  const map = L.map('map', { zoomControl: false }).setView([-15.78, -47.93], 4);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  window.__srMap = map;
  // Camadas base: satélite (Esri) e vetorial (OpenStreetMap), ambas em monocromático via CSS.
  const BASES = {
    sat: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19, attribution: 'Imagens &copy; Esri, Maxar, Earthstar Geographics',
    }),
    dark: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; colaboradores do OpenStreetMap' }),
  };
  let base = (() => { try { return localStorage.getItem('sr_base') || 'sat'; } catch { return 'sat'; } })();
  function setBase(b) {
    Object.values(BASES).forEach((l) => map.removeLayer(l));
    BASES[b].addTo(map);
    base = b;
    $('mapwrap').className = 'mapwrap basemap-' + b;
    document.querySelectorAll('[data-base]').forEach((x) => x.classList.toggle('on', x.dataset.base === b));
    $('hudMode').textContent = b === 'sat' ? 'SAT_VIEW' : 'VECTOR';
    try { localStorage.setItem('sr_base', b); } catch {}
  }
  document.querySelectorAll('[data-base]').forEach((x) => (x.onclick = () => setBase(x.dataset.base)));
  setBase(base);

  // HUD: coordenadas do centro em graus, minutos e segundos.
  const dms = (v, pos, neg) => {
    const a = Math.abs(v), d = Math.floor(a), mf = (a - d) * 60, m = Math.floor(mf), sec = ((mf - m) * 60).toFixed(1);
    return `${d}° ${String(m).padStart(2, '0')}' ${sec.padStart(4, '0')}" ${v < 0 ? neg : pos}`;
  };
  function hud() {
    const c = map.getCenter();
    $('hudLat').textContent = dms(c.lat, 'N', 'S');
    $('hudLon').textContent = dms(c.lng, 'E', 'W');
    $('hudZoom').textContent = String(map.getZoom()).padStart(2, '0');
    $('hudSector').textContent = `${Math.floor((c.lat + 90) * 2)}-${Math.floor((c.lng + 180) * 2)}`;
  }
  map.on('move zoom', hud);
  hud();

  const layer = L.layerGroup().addTo(map);
  map.on('click', (e) => analyze(e.latlng.lat, e.latlng.lng, null));

  // ---------- perfil (vem do Plano da casa) ----------
  const readProfile = () => (window.SR_HOUSE_PROFILE ? window.SR_HOUSE_PROFILE() : {});
  window.addEventListener('sr-house-changed', () => { if (current) rescore(); });

  // ---------- status ----------
  function status(msg) {
    $('statusPanel').hidden = !msg;
    $('status').textContent = msg || '';
  }
  function netStatus() {
    const on = navigator.onLine;
    $('netStatus').textContent = on ? 'online' : 'offline';
    $('netStatus').className = 'pill ' + (on ? '' : 'off');
  }
  window.addEventListener('online', netStatus);
  window.addEventListener('offline', netStatus);
  netStatus();

  // ---------- rede ----------
  async function fetchJSON(url, opts = {}, timeoutMs = 30000) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(url, { ...opts, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function overpass(query) {
    let lastErr;
    for (const ep of OVERPASS) {
      try {
        return await fetchJSON(ep, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(query),
        }, 95000);
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('Overpass indisponível');
  }

  // Base nacional pré-processada (blocos estáticos servidos com o site).
  let dataIndex;
  async function loadIndex() {
    if (dataIndex !== undefined) return dataIndex;
    try { dataIndex = await fetchJSON('data/index.json', { cache: 'no-cache' }, 15000); } catch { dataIndex = null; }
    return dataIndex;
  }
  async function localItems(lat, lon, radius) {
    const idx = await loadIndex();
    if (!idx) return null;
    const have = new Set(idx.tiles);
    const keys = SR.tilesFor(lat, lon, SR.MAX_RADIUS, idx.tile).filter((k) => have.has(k));
    const parts = await Promise.all(keys.map((k) => fetchJSON(`data/t/${k}.json?b=${encodeURIComponent(idx.built)}`, {}, 30000).catch(() => [])));
    return { items: SR.fromTiles(parts.flat(), { lat, lon }, radius, idx.cats), built: idx.built };
  }

  async function elevation(lat, lon) {
    const pts = [{ lat, lon }];
    for (let b = 0; b < 360; b += 45) pts.push(SR.point(lat, lon, 600, b));
    const url = `${ELEVATION}?latitude=${pts.map((p) => p.lat.toFixed(5)).join(',')}&longitude=${pts.map((p) => p.lon.toFixed(5)).join(',')}`;
    const j = await fetchJSON(url, {}, 15000);
    const e = j.elevation || [];
    return { point: e[0], ring: e.slice(1) };
  }

  async function reverse(lat, lon) {
    try {
      const j = await fetchJSON(`${NOMINATIM}/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lon}&accept-language=pt-BR`, {}, 10000);
      return j.display_name || null;
    } catch { return null; }
  }

  // ---------- busca ----------
  $('searchForm').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const q = $('q').value.trim();
    if (!q) return;
    status('Procurando o endereço…');
    try {
      const res = await fetchJSON(`${NOMINATIM}/search?format=jsonv2&countrycodes=br&limit=5&accept-language=pt-BR&q=${encodeURIComponent(q)}`, {}, 15000);
      const ul = $('candidates');
      ul.innerHTML = '';
      if (!res.length) { status('Endereço não encontrado. Tente rua + número + cidade, ou toque no mapa.'); ul.hidden = true; return; }
      if (res.length === 1) { ul.hidden = true; return analyze(+res[0].lat, +res[0].lon, res[0].display_name); }
      status('Escolha o resultado correto:');
      for (const r of res) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = r.display_name;
        b.onclick = () => { ul.hidden = true; analyze(+r.lat, +r.lon, r.display_name); };
        li.appendChild(b); ul.appendChild(li);
      }
      ul.hidden = false;
    } catch (e) {
      status('Não foi possível buscar agora (' + e.message + '). Toque no mapa para escolher o ponto.');
    }
  });

  $('gpsBtn').addEventListener('click', () => {
    if (!navigator.geolocation) return status('Este aparelho não oferece localização.');
    status('Obtendo localização…');
    navigator.geolocation.getCurrentPosition(
      (p) => analyze(p.coords.latitude, p.coords.longitude, null),
      (e) => status('Localização negada ou indisponível (' + e.message + ').'),
      { enableHighAccuracy: true, timeout: 20000 }
    );
  });

  // ---------- análise ----------
  async function analyze(lat, lon, address) {
    if (!navigator.onLine) return status('Sem internet. Abra um local salvo abaixo.');
    const radius = +$('radius').value;
    layer.clearLayers();
    map.setView([lat, lon], radius > 10000 ? 11 : 13);
    drawOrigin(lat, lon, radius, $('placeName').value.trim() || 'Local', 'Analisando');
    status('Consultando serviços, infraestrutura e relevo…');
    $('report').hidden = true;

    const [loc, el, addr] = await Promise.allSettled([
      localItems(lat, lon, radius),
      elevation(lat, lon),
      address ? Promise.resolve(address) : reverse(lat, lon),
    ]);
    let items, built = null;
    if (loc.status === 'fulfilled' && loc.value) {
      items = loc.value.items; built = loc.value.built;
    } else {
      status('Base local indisponível; consultando o OpenStreetMap ao vivo (pode demorar)…');
      try { items = SR.parseOverpass(await overpass(SR.buildOverpassQuery(lat, lon, radius)), { lat, lon }); }
      catch { status('Os servidores do OpenStreetMap estão ocupados. Tente de novo em alguns minutos.'); return; }
    }
    current = {
      dataBuilt: built,
      name: $('placeName').value.trim() || 'Local',
      address: addr.status === 'fulfilled' ? addr.value : null,
      lat, lon, radius, ts: Date.now(),
      items: trim(items),
      elevation: el.status === 'fulfilled' ? el.value : null,
      counts: Object.fromEntries(Object.entries(items).map(([k, v]) => [k, v.length])),
    };
    rescore();
    status('');
  }

  function trim(items) {
    const o = {};
    for (const [k, v] of Object.entries(items)) o[k] = v.slice(0, 6);
    return o;
  }

  function rescore() {
    current.profile = readProfile();
    current.evaluation = SR.evaluate(current);
    current.actions = SR.recommend(current, current.evaluation);
    render(current);
  }

  // Ponto analisado: círculo de raio em linha fina e rótulo no estilo HUD.
  function drawOrigin(lat, lon, radius, name, sub) {
    L.circle([lat, lon], { radius, color: '#eeeeee', weight: 1, opacity: 0.5, dashArray: '2 6', fillOpacity: 0 }).addTo(layer);
    L.marker([lat, lon], {
      interactive: false,
      icon: L.divIcon({ className: 'callout', iconSize: [0, 0], html: `<span class="dot"></span><span class="ln"></span><span class="lb">${esc(name)}<small>${esc(sub)}</small></span>` }),
    }).addTo(layer);
  }

  // ---------- render ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nw = (s) => String(s == null ? '' : s).replace(/ ([^ ]{1,18})$/, '\u00a0$1');
  const gmaps = (o, d, mode) => `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}&travelmode=${mode}`;
  const waze = (d) => `https://waze.com/ul?ll=${d.lat},${d.lon}&navigate=yes`;

  function render(m) {
    layer.clearLayers();
    drawOrigin(m.lat, m.lon, m.radius, m.name, `${m.lat.toFixed(4)}, ${m.lon.toFixed(4)}`);
    let scan = 0;
    for (const [k, list] of Object.entries(m.items)) {
      const c = SR.CATEGORIES[k];
      const n = c.group === 'service' ? 3 : 1;
      scan += list.length;
      for (const x of list.slice(0, n)) {
        L.circleMarker([x.lat, x.lon], { radius: c.group === 'infra' ? 6 : 5, color: c.group === 'infra' ? c.color : '#000', weight: c.group === 'infra' ? 1.5 : 1, fillColor: c.group === 'infra' ? '#000' : c.color, fillOpacity: 0.95 })
          .addTo(layer)
          .bindPopup(`<b>${esc(x.name)}</b><br>${esc(c.label)} · ${SR.fmtDist(x.dist)}<br><a href="${gmaps(m, x, 'driving')}" target="_blank" rel="noopener">Rota</a>`);
      }
    }

    $('hudScan').textContent = scan;
    $('hudRadius').textContent = SR.fmtDist(m.radius);
    $('hudElev').textContent = m.elevation && Number.isFinite(m.elevation.point) ? Math.round(m.elevation.point) + 'M' : '—';
    $('hudRisk').textContent = m.evaluation.overall.toUpperCase();
    $('hudRisk').style.color = `var(--${m.evaluation.overall})`;

    $('report').hidden = false;
    $('repTitle').textContent = m.name;
    $('repAddress').textContent = (m.address || `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`) + ' · ' + new Date(m.ts).toLocaleString('pt-BR');
    const ov = m.evaluation.overall;
    $('overall').className = 'overall lv-' + ov;
    $('overall').innerHTML = `Exposição geral: <b>${ov.toUpperCase()}</b>`;

    $('risks').innerHTML = m.evaluation.findings.map((x) =>
      `<li class="lv-${x.level}"><span class="tag">${x.level}</span><div><b>${esc(nw(x.title))}</b><br><span class="muted">${esc(nw(x.detail))}</span></div></li>`).join('');

    $('actionsList').innerHTML = m.actions.map((a) => `<li>${esc(nw(a))}</li>`).join('');

    const block = (group, n) => Object.entries(SR.CATEGORIES).filter(([, c]) => c.group === group).map(([k, c]) => {
      const list = (m.items[k] || []).slice(0, n);
      if (!list.length) return group === 'service' ? `<div class="cat"><h3><i style="background:${c.color}"></i>${c.label}</h3><p class="muted small">Nada encontrado no raio. Pode ser lacuna de dados.</p></div>` : '';
      return `<div class="cat"><h3><i style="background:${c.color}"></i>${c.label}</h3><ul>${list.map((x) => `
        <li><div><b>${esc(x.name)}</b> <span class="muted">· ${SR.fmtDist(x.dist)}</span>
        ${x.address ? `<br><span class="muted small">${esc(x.address)}</span>` : ''}
        ${x.phone ? `<br><span class="small">${esc(x.phone)}</span>` : ''}</div>
        <div class="links"><a href="${gmaps(m, x, 'driving')}" target="_blank" rel="noopener">Carro</a>
        <a href="${gmaps(m, x, 'walking')}" target="_blank" rel="noopener">A pé</a>
        <a href="${waze(x)}" target="_blank" rel="noopener">Waze</a></div></li>`).join('')}</ul></div>`;
    }).join('');
    $('services').innerHTML = block('service', 3);
    const infra = block('infra', 2);
    $('infra').innerHTML = infra || '<p class="muted small">Nenhuma infraestrutura crítica mapeada no entorno pesquisado.</p>';

    const q = [];
    const svc = ['hospital', 'emergency', 'fire', 'police'].reduce((s, k) => s + (m.counts[k] || 0), 0);
    q.push(`${svc} serviços de emergência mapeados no raio de ${SR.fmtDist(m.radius)}.`);
    q.push(m.dataBuilt ? `Base nacional OpenStreetMap atualizada em ${new Date(m.dataBuilt).toLocaleDateString('pt-BR')}.` : 'Dados consultados ao vivo no OpenStreetMap.');
    if (svc < 3) q.push('Poucos serviços mapeados: a cobertura do OpenStreetMap nesta região pode ser fraca. Confirme localmente.');
    q.push(m.elevation ? 'Relevo: dados de altitude obtidos (Open-Meteo, ~90 m de resolução).' : 'Relevo: altitude indisponível nesta consulta.');
    q.push('Hospitais: o mapa não informa se há pronto-socorro 24 h nem especialidade pediátrica. Confirme por telefone.');
    q.push('Áreas de risco oficiais (alagamento e deslizamento) ainda não integradas: consulte a Defesa Civil do município.');
    $('quality').innerHTML = q.map((x) => `<li>${esc(nw(x))}</li>`).join('');
    $('actionMsg').textContent = '';
  }

  // ---------- ações ----------
  function msg(t) { $('actionMsg').textContent = t; }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
  }
  $('copyBtn').onclick = async () => msg((await copy(SR.reportText(current))) ? 'Relatório copiado.' : 'Não foi possível copiar.');
  $('aiBtn').onclick = async () => msg((await copy(SR.aiBriefing(current))) ? 'Briefing copiado. Cole numa conversa com o Claude para gerar o plano personalizado.' : 'Não foi possível copiar.');
  $('dlBtn').onclick = () => {
    const blob = new Blob([SR.reportText(current)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `survival-radar-${(current.name || 'local').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.txt`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('printBtn').onclick = () => window.print();
  $('saveBtn').onclick = () => {
    const list = store.get(STORE_KEY, []);
    const id = current.id || String(Date.now());
    current.id = id;
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list[i] = current; else list.unshift(current);
    msg(store.set(STORE_KEY, list.slice(0, 20)) ? 'Salvo neste aparelho.' : 'Não foi possível salvar (armazenamento indisponível).');
    renderSaved();
  };

  function renderSaved() {
    const list = store.get(STORE_KEY, []);
    const ul = $('savedList');
    if (!list.length) { ul.innerHTML = '<li class="muted small">Nenhum local salvo ainda.</li>'; return; }
    ul.innerHTML = '';
    for (const m of list) {
      const li = document.createElement('li');
      li.innerHTML = `<button type="button" class="link">${esc(m.name)} <span class="muted small">· ${esc(m.evaluation.overall)} · ${new Date(m.ts).toLocaleDateString('pt-BR')}</span></button><button type="button" class="del" aria-label="Apagar">×</button>`;
      li.firstChild.onclick = () => { current = m; $('placeName').value = m.name; render(m); map.setView([m.lat, m.lon], 13); window.scrollTo({ top: $('report').offsetTop - 10, behavior: 'smooth' }); };
      li.lastChild.onclick = () => { store.set(STORE_KEY, store.get(STORE_KEY, []).filter((x) => x.id !== m.id)); renderSaved(); };
      ul.appendChild(li);
    }
  }

  // Texto fixo da página: junta as duas últimas palavras de cada parágrafo (sem viúvas).
  document.querySelectorAll('main p, main li, main label').forEach((el) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let last = null, n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) last = n;
    if (last) last.nodeValue = last.nodeValue.replace(/ ([^ ]{1,18})(\s*)$/, '\u00a0$1$2');
  });
  renderSaved();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
