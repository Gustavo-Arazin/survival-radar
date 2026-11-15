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
  const map = L.map('map', { zoomControl: true }).setView([-15.78, -47.93], 4);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; colaboradores do OpenStreetMap',
  }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  map.on('click', (e) => analyze(e.latlng.lat, e.latlng.lng, null));

  // ---------- perfil ----------
  const profileFields = ['pAdults', 'pInfants', 'pKids', 'pElderly', 'pMobility', 'pMeds', 'pCar', 'pPets'];
  function readProfile() {
    const n = (id) => Math.max(0, parseInt($(id).value, 10) || 0);
    return {
      adults: n('pAdults'), infants: n('pInfants'), kids: n('pKids'), elderly: n('pElderly'),
      mobility: $('pMobility').checked, meds: $('pMeds').checked, car: $('pCar').checked, pets: $('pPets').checked,
    };
  }
  function loadProfile() {
    const p = store.get(PROFILE_KEY, null);
    if (!p) return;
    $('pAdults').value = p.adults; $('pInfants').value = p.infants; $('pKids').value = p.kids; $('pElderly').value = p.elderly;
    $('pMobility').checked = !!p.mobility; $('pMeds').checked = !!p.meds; $('pCar').checked = !!p.car; $('pPets').checked = !!p.pets;
  }
  profileFields.forEach((id) => $(id).addEventListener('change', () => {
    store.set(PROFILE_KEY, readProfile());
    if (current) { rescore(); }
  }));

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
    L.circle([lat, lon], { radius, color: '#7c8cff', weight: 1, fillOpacity: 0.04 }).addTo(layer);
    L.marker([lat, lon]).addTo(layer);
    status('Consultando serviços, infraestrutura e relevo (pode levar até 1 minuto)…');
    $('report').hidden = true;

    const [ov, el, addr] = await Promise.allSettled([
      overpass(SR.buildOverpassQuery(lat, lon, radius)),
      elevation(lat, lon),
      address ? Promise.resolve(address) : reverse(lat, lon),
    ]);
    if (ov.status !== 'fulfilled') {
      status('Os servidores do OpenStreetMap estão ocupados. Tente de novo em alguns minutos.');
      return;
    }
    const items = SR.parseOverpass(ov.value, { lat, lon });
    current = {
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

  // ---------- render ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const gmaps = (o, d, mode) => `https://www.google.com/maps/dir/?api=1&origin=${o.lat},${o.lon}&destination=${d.lat},${d.lon}&travelmode=${mode}`;
  const waze = (d) => `https://waze.com/ul?ll=${d.lat},${d.lon}&navigate=yes`;

  function render(m) {
    layer.clearLayers();
    L.circle([m.lat, m.lon], { radius: m.radius, color: '#7c8cff', weight: 1, fillOpacity: 0.04 }).addTo(layer);
    L.marker([m.lat, m.lon]).addTo(layer).bindPopup(esc(m.name));
    for (const [k, list] of Object.entries(m.items)) {
      const c = SR.CATEGORIES[k];
      const n = c.group === 'service' ? 3 : 1;
      for (const x of list.slice(0, n)) {
        L.circleMarker([x.lat, x.lon], { radius: 7, color: '#111', weight: 1, fillColor: c.color, fillOpacity: 0.95 })
          .addTo(layer)
          .bindPopup(`<b>${esc(x.name)}</b><br>${esc(c.label)} · ${SR.fmtDist(x.dist)}<br><a href="${gmaps(m, x, 'driving')}" target="_blank" rel="noopener">Rota</a>`);
      }
    }

    $('report').hidden = false;
    $('repTitle').textContent = m.name;
    $('repAddress').textContent = (m.address || `${m.lat.toFixed(5)}, ${m.lon.toFixed(5)}`) + ' · ' + new Date(m.ts).toLocaleString('pt-BR');
    const ov = m.evaluation.overall;
    $('overall').className = 'overall lv-' + ov;
    $('overall').innerHTML = `Exposição geral: <b>${ov.toUpperCase()}</b>`;

    $('risks').innerHTML = m.evaluation.findings.map((x) =>
      `<li class="lv-${x.level}"><span class="tag">${x.level}</span><div><b>${esc(x.title)}</b><br><span class="muted">${esc(x.detail)}</span></div></li>`).join('');

    $('actionsList').innerHTML = m.actions.map((a) => `<li>${esc(a)}</li>`).join('');

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
    if (svc < 3) q.push('Poucos serviços mapeados: a cobertura do OpenStreetMap nesta região pode ser fraca. Confirme localmente.');
    q.push(m.elevation ? 'Relevo: dados de altitude obtidos (Open-Meteo, ~90 m de resolução).' : 'Relevo: altitude indisponível nesta consulta.');
    q.push('Hospitais: o mapa não informa se há pronto-socorro 24 h nem especialidade pediátrica. Confirme por telefone.');
    q.push('Áreas de risco oficiais (alagamento e deslizamento) ainda não integradas: consulte a Defesa Civil do município.');
    $('quality').innerHTML = q.map((x) => `<li>${esc(x)}</li>`).join('');
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

  loadProfile();
  renderSaved();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
