/* Survival Radar — interface do Plano da Casa. Tudo fica no aparelho (localStorage + IndexedDB). */
(function () {
  'use strict';
  const PLAN = window.PLAN;
  const $ = (id) => document.getElementById(id);
  const KEY = 'sr_house_v1';
  const BOUGHT = 'sr_bought_v1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const DEFAULT = {
    horizon: 14,
    scenarios: ['apagao', 'chuva', 'invasao'], scenarioOther: '',
    people: [{ name: 'Adulto 1', sex: '', birth: '' }, { name: 'Adulto 2', sex: '', birth: '' }],
    pets: [],
    vehicle: { has: false, armored: false, tank: '', kmPerL: '' },
    residence: { type: 'apto', floor: '', area: '', bedrooms: 2, waterTank: '', gas: 'encanado', elevator: false, concierge: false, lock: 'comum', door: 'macica', solar: false, utilities: { gas: '', water: '', power: '' }, exit1: '', exit2: '', meet: '', refuge: '' },
    money: { monthly: '' },
  };
  const load = () => { try { return Object.assign(structuredClone(DEFAULT), JSON.parse(localStorage.getItem(KEY)) || {}); } catch { return structuredClone(DEFAULT); } };
  let H = load();
  (function migrate() {
    if (Array.isArray(H.meds) && H.meds.length) {
      for (const m of H.meds) {
        const p = H.people.find((x) => x.name && x.name === m.who) || H.people[0];
        if (!p) continue;
        p.usesMeds = true; (p.meds = p.meds || []).push({ name: m.name, perDay: m.perDay, stock: m.stock, unit: m.unit, controlled: m.controlled });
      }
    }
    delete H.meds;
  })();
  let bought = (() => { try { return JSON.parse(localStorage.getItem(BOUGHT)) || {}; } catch { return {}; } })();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(H)); } catch {} window.dispatchEvent(new CustomEvent('sr-house-changed')); };

  // Perfil resumido usado pela aba Local
  window.SR_HOUSE_PROFILE = function () {
    const ps = H.people.map((p) => ({ ...p, mo: PLAN.ageMonths(p.birth) }));
    const st = (p) => PLAN.stage(p.mo);
    return {
      adults: ps.filter((p) => ['adulto', 'adolescente'].includes(st(p))).length,
      infants: ps.filter((p) => ['lactente', 'bebe'].includes(st(p))).length,
      kids: ps.filter((p) => st(p) === 'crianca').length,
      elderly: ps.filter((p) => st(p) === 'idoso').length,
      mobility: ps.some((p) => p.mobility), meds: ps.some((p) => p.usesMeds && (p.meds || []).some((m) => m.name)),
      car: !!H.vehicle.has, pets: H.pets.length > 0, armored: !!H.vehicle.armored,
    };
  };

  // ---------- campos ----------
  const inp = (path, value, attrs = '') => `<input data-p="${path}" value="${esc(value)}" ${attrs}>`;
  const chk = (path, value, label) => `<label class="check"><input type="checkbox" data-p="${path}" ${value ? 'checked' : ''}> ${label}</label>`;
  const sel = (path, value, opts) => `<select data-p="${path}">${opts.map(([v, l]) => `<option value="${v}" ${String(value) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const lab = (text, html) => `<label>${text}${html}</label>`;

  function personCard(p, i) {
    const mo = PLAN.ageMonths(p.birth);
    const infant = mo != null && mo < 12;
    return `<div class="card"><div class="cardhead"><b>${esc(p.name || 'Pessoa')}</b><span class="muted small" data-age="${i}">${PLAN.fmtAge(mo)}</span><button type="button" class="del" data-del="people.${i}" aria-label="Remover">×</button></div>
      <div class="grid3">
        ${lab('Nome ou papel', inp(`people.${i}.name`, p.name, 'maxlength="30"'))}
        ${lab('Data de nascimento', inp(`people.${i}.birth`, p.birth, 'type="date" min="1900-01-01" max="' + new Date().toISOString().slice(0, 10) + '"'))}
        ${lab('Sexo', sel(`people.${i}.sex`, p.sex || '', [['', '—'], ['f', 'Feminino'], ['m', 'Masculino']]))}
        ${lab('Tipo sanguíneo', sel(`people.${i}.blood`, p.blood || '', [['', 'Não sei'], ['A+', 'A+'], ['A-', 'A−'], ['B+', 'B+'], ['B-', 'B−'], ['AB+', 'AB+'], ['AB-', 'AB−'], ['O+', 'O+'], ['O-', 'O−']]))}
        ${lab('Peso (kg, opcional)', inp(`people.${i}.weight`, p.weight, 'type="number" min="0" step="0.1"'))}
        ${infant ? lab('Alimentação', sel(`people.${i}.feeding`, p.feeding || 'peito', [['peito', 'Só leite materno'], ['misto', 'Misto'], ['formula', 'Fórmula']])) : ''}
      </div>
      <div class="row wrap">
        ${!infant ? chk(`people.${i}.pregnant`, p.pregnant, 'Gestante') + chk(`people.${i}.lactating`, p.lactating, 'Amamentando') : ''}
        ${chk(`people.${i}.mobility`, p.mobility, 'Mobilidade reduzida')}
      </div>
      ${lab('Condições de saúde ou alergias (fica só neste aparelho)', inp(`people.${i}.conditions`, p.conditions, 'maxlength="160"'))}
      ${medsBlock(`people.${i}`, p)}
    </div>`;
  }

  function medCard(base, m, j) {
    const p = `${base}.meds.${j}`;
    return `<div class="subcard"><div class="cardhead"><b>${esc(m.name || 'Medicamento')}</b>${m.controlled ? '<span class="tag tag-ctl">controlado</span>' : ''}<button type="button" class="del" data-delmed="${base}.${j}" aria-label="Remover medicamento">×</button></div>
      <div class="grid3">
        ${lab('Nome', inp(`${p}.name`, m.name, 'maxlength="40"'))}
        ${lab('Doses por dia', inp(`${p}.perDay`, m.perDay, 'type="number" min="0" step="0.5"'))}
        ${lab('Estoque atual (unidades)', inp(`${p}.stock`, m.stock, 'type="number" min="0"'))}
        ${lab('Unidade', inp(`${p}.unit`, m.unit, 'placeholder="comprimidos, ml…"'))}
      </div>
      ${chk(`${p}.controlled`, m.controlled, 'Controlado (receita retida)')}
    </div>`;
  }
  function medsBlock(base, o) {
    return `${chk(`${base}.usesMeds`, o.usesMeds, 'Faz uso de medicação contínua')}
      ${o.usesMeds ? `<div class="meds">${(o.meds || []).map((m, j) => medCard(base, m, j)).join('')}<button type="button" data-addmed="${base}">+ Medicamento</button></div>` : ''}`;
  }

  function petCard(p, i) {
    return `<div class="card"><div class="cardhead"><b>${esc(p.name || 'Animal')}</b><button type="button" class="del" data-del="pets.${i}" aria-label="Remover">×</button></div>
      <div class="grid3">
        ${lab('Espécie', sel(`pets.${i}.species`, p.species || 'cao', PLAN.PET_SPECIES))}
        ${p.species === 'outro' ? lab('Qual animal?', inp(`pets.${i}.other`, p.other, 'maxlength="30" placeholder="Ex.: tartaruga, furão"')) : ''}
        ${lab('Nome', inp(`pets.${i}.name`, p.name, 'maxlength="20"'))}
        ${lab('Peso (kg)', inp(`pets.${i}.weight`, p.weight, 'type="number" min="0" step="0.1"'))}
        ${lab('Ração por dia (g, se souber)', inp(`pets.${i}.foodPerDay`, p.foodPerDay, 'type="number" min="0"'))}
      </div>
      ${medsBlock(`pets.${i}`, p)}
    </div>`;
  }

  function renderForm() {
    const r = H.residence, v = H.vehicle, u = r.utilities || (r.utilities = {});
    $('planForm').innerHTML = `
      <div class="panel"><h2>Horizonte do estoque</h2>
        <div class="grid3">
          ${lab('Período', sel('horizonMode', [3, 14, 30, 90].includes(+H.horizon) && !H.horizonCustom ? String(H.horizon) : 'custom', [['3', '3 dias (mínimo)'], ['14', '14 dias (recomendado)'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Personalizado']]))}
          ${[3, 14, 30, 90].includes(+H.horizon) && !H.horizonCustom ? '' : lab('Número de dias', inp('horizon', H.horizon, 'type="number" min="1" max="365"'))}
        </div>
      </div>
      <div class="panel"><h2>Cenários a simular</h2>
        <p class="muted small">Marque todos que se aplicam. O plano junta os itens de todos, sem repetir.</p>
        <div class="grid2">${PLAN.SCENARIOS.map((x) => `<label class="check"><input type="checkbox" data-scn="${x.id}" ${(H.scenarios || []).includes(x.id) ? 'checked' : ''}> ${esc(x.label)}${x.horizon ? ` <span class="muted small">· ${x.horizon} dias</span>` : ''}</label>`).join('')}
          <label class="check"><input type="checkbox" data-scn="outro" ${(H.scenarios || []).includes('outro') ? 'checked' : ''}> Outro</label>
        </div>
        ${(H.scenarios || []).includes('outro') ? lab('Qual cenário?', inp('scenarioOther', H.scenarioOther, 'maxlength="120" placeholder="Descreva a situação"')) : ''}
      </div>
      <div class="panel"><h2>Pessoas</h2>${H.people.map(personCard).join('')}
        <button type="button" data-add="people">+ Pessoa</button></div>
      <div class="panel"><h2>Animais</h2>${H.pets.map(petCard).join('')}<button type="button" data-add="pets">+ Animal</button></div>
      <div class="panel"><h2>Veículo</h2>
        <div class="row wrap">${chk('vehicle.has', v.has, 'Família tem carro')}${chk('vehicle.armored', v.armored, 'Blindado')}</div>
        <div class="grid3">${lab('Tanque (L)', inp('vehicle.tank', v.tank, 'type="number" min="0"'))}${lab('Consumo (km/L)', inp('vehicle.kmPerL', v.kmPerL, 'type="number" min="0" step="0.1"'))}</div>
      </div>
      <div class="panel"><h2>Residência</h2>
        <div class="grid3">
          ${lab('Tipo', sel('residence.type', r.type, [['apto', 'Apartamento'], ['casa', 'Casa térrea'], ['sobrado', 'Sobrado'], ['casa_cond', 'Casa em condomínio']]))}
          ${lab('Andar', inp('residence.floor', r.floor, 'type="number" min="0"'))}
          ${lab('Área (m²)', inp('residence.area', r.area, 'type="number" min="0"'))}
          ${lab('Quartos', inp('residence.bedrooms', r.bedrooms, 'type="number" min="1"'))}
          ${lab('Caixa d\'água própria (L)', inp('residence.waterTank', r.waterTank, 'type="number" min="0"'))}
          ${lab('Gás', sel('residence.gas', r.gas, [['encanado', 'Encanado'], ['botijao', 'Botijão']]))}
          ${lab('Fechadura da porta principal', sel('residence.lock', r.lock, [['comum', 'Comum'], ['tetra', 'Chave tetra'], ['alta', 'Alta segurança / multiponto'], ['digital', 'Digital']]))}
          ${lab('Porta principal', sel('residence.door', r.door, [['madeira_oca', 'Madeira oca'], ['macica', 'Madeira maciça'], ['aco', 'Aço'], ['blindada', 'Blindada']]))}
        </div>
        <div class="row wrap">${chk('residence.elevator', r.elevator, 'Elevador')}${chk('residence.concierge', r.concierge, 'Portaria 24 h')}${chk('residence.solar', r.solar, 'Varanda ou laje com sol (painel solar)')}</div>
        <h3>Onde fica (escreva de um jeito que qualquer um da família encontre)</h3>
        <div class="grid3">
          ${lab('Registro de gás', inp('residence.utilities.gas', u.gas))}
          ${lab('Registro de água', inp('residence.utilities.water', u.water))}
          ${lab('Quadro de energia', inp('residence.utilities.power', u.power))}
          ${lab('Rota de saída principal', inp('residence.exit1', r.exit1))}
          ${lab('Rota de saída alternativa', inp('residence.exit2', r.exit2))}
          ${lab('Ponto de encontro fora de casa', inp('residence.meet', r.meet))}
          ${lab('Cômodo de refúgio', inp('residence.refuge', r.refuge))}
        </div>
        <h3>Planta da casa</h3>
        <input type="file" id="planFile" accept="image/*">
        <img id="planImg" alt="Planta da residência" hidden>
        <p class="muted small">A imagem fica só neste aparelho. Marque nela, antes de enviar, as saídas e os registros.</p>
      </div>
      <div class="panel"><h2>Dinheiro</h2>
        ${lab('Gasto mensal essencial da família (mercado, farmácia, transporte), em R$', inp('money.monthly', H.money.monthly, 'type="number" min="0" step="100"'))}
      </div>`;
    loadPlanImage();
  }

  // ---------- leitura/escrita por caminho ----------
  function setPath(path, val) {
    const ks = path.split('.');
    let o = H;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]] = o[ks[i]] || {};
    o[ks[ks.length - 1]] = val;
  }
  $('planForm').addEventListener('input', (e) => {
    const el = e.target;
    const p = el.dataset.p;
    if (!p) return;
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (p === 'horizonMode') {
      if (v === 'custom') { H.horizonCustom = true; } else { H.horizonCustom = false; H.horizon = +v; }
      save(); rerender(); return;
    }
    setPath(p, p === 'horizon' ? Math.max(1, Math.min(365, +v || 1)) : v);
    if (/\.birth$/.test(p)) {
      const i = p.split('.')[1];
      const span = document.querySelector(`[data-age="${i}"]`);
      if (span) span.textContent = PLAN.fmtAge(PLAN.ageMonths(v));
    }
    save(); renderOutput();
  });
  // Redesenha só quando o campo perde o foco (não interrompe a digitação).
  $('planForm').addEventListener('focusout', (e) => {
    const p = e.target.dataset.p || '';
    if (/(\.birth|\.name)$/.test(p)) rerender();
  });
  $('planForm').addEventListener('change', (e) => {
    const scn = e.target.dataset.scn;
    if (scn) {
      const set = new Set(H.scenarios || []);
      e.target.checked ? set.add(scn) : set.delete(scn);
      H.scenarios = [...set]; save(); if (scn === 'outro') rerender(); else renderOutput();
      return;
    }
    const p = e.target.dataset.p || '';
    if (/(controlled|species|usesMeds)$/.test(p)) rerender();
  });
  function rerender() { const y = scrollY; const a = document.activeElement && document.activeElement.dataset.p; renderForm(); renderOutput(); scrollTo(0, y); if (a) { const el = document.querySelector(`[data-p="${a}"]`); if (el && el.type !== 'date') el.focus(); } }
  $('planForm').addEventListener('click', (e) => {
    const add = e.target.dataset.add, del = e.target.dataset.del, addmed = e.target.dataset.addmed, delmed = e.target.dataset.delmed;
    if (addmed) { const [k, i] = addmed.split('.'); (H[k][+i].meds = H[k][+i].meds || []).push({ name: '', perDay: 1, stock: '', unit: k === 'pets' ? 'doses' : 'comprimidos', controlled: false }); }
    else if (delmed) { const [k, i, j] = delmed.split('.'); H[k][+i].meds.splice(+j, 1); }
    else if (add) { H[add].push(add === 'people' ? { name: '', sex: '', birth: '' } : { species: 'cao', name: '', weight: '' }); }
    else if (del) { const [k, i] = del.split('.'); H[k].splice(+i, 1); }
    else return;
    save(); const y = scrollY; renderForm(); renderOutput(); scrollTo(0, y);
  });

  // ---------- planta (IndexedDB) ----------
  function idb() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('sr', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('files');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function loadPlanImage() {
    try {
      const db = await idb();
      const blob = await new Promise((res) => { const g = db.transaction('files').objectStore('files').get('planta'); g.onsuccess = () => res(g.result); g.onerror = () => res(null); });
      if (blob) { $('planImg').src = URL.createObjectURL(blob); $('planImg').hidden = false; }
    } catch {}
    $('planFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { const db = await idb(); db.transaction('files', 'readwrite').objectStore('files').put(f, 'planta'); } catch {}
      $('planImg').src = URL.createObjectURL(f); $('planImg').hidden = false;
    };
  }

  // ---------- resultado ----------
  function renderOutput() {
    const out = PLAN.compute(H);
    $('planAlerts').innerHTML = out.alerts.length
      ? out.alerts.map((a) => `<li class="lv-${a.level}"><span class="tag">${a.level}</span><div>${esc(a.text)}</div></li>`).join('')
      : '<li class="lv-baixo"><span class="tag">ok</span><div>Nenhum alerta crítico com os dados informados.</div></li>';
    $('planSections').innerHTML = out.sections.map((s) => `<div class="panel"><h2>${esc(s.title)}</h2><p>${esc(s.lead)}</p>
      <table class="tbl"><tbody>${s.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table></div>`).join('');
    const groups = {};
    out.shopping.forEach((x) => (groups[x.cat] = groups[x.cat] || []).push(x));
    $('planShopping').innerHTML = Object.entries(groups).map(([cat, list]) => `<h3>${esc(cat)}</h3><ul class="shop">${list.map((x) => {
      const id = cat + '|' + x.item;
      return `<li><label class="check"><input type="checkbox" data-buy="${esc(id)}" ${bought[id] ? 'checked' : ''}><span><b>${esc(x.item)}</b> · ${esc(x.qty)}<br><span class="muted small">${esc(x.where)}${x.note ? ' · ' + esc(x.note) : ''}</span></span></label></li>`;
    }).join('')}</ul>`).join('');
    const total = out.shopping.length, done = out.shopping.filter((x) => bought[x.cat + '|' + x.item]).length;
    $('planProgress').textContent = `${done} de ${total} itens prontos`;
    window.__planOut = out;
  }
  $('planShopping').addEventListener('change', (e) => {
    const id = e.target.dataset.buy; if (!id) return;
    bought[id] = e.target.checked;
    try { localStorage.setItem(BOUGHT, JSON.stringify(bought)); } catch {}
    renderOutput();
  });

  function planText() {
    const out = window.__planOut;
    const L = [`PLANO DA CASA — ${out.days} dias`, out.scenarios && out.scenarios.length ? 'Cenários: ' + out.scenarios.join('; ') : '', ''];
    if (out.alerts.length) { L.push('ALERTAS'); out.alerts.forEach((a) => L.push(`- [${a.level}] ${a.text}`)); L.push(''); }
    out.sections.forEach((s) => { L.push(s.title.toUpperCase(), s.lead); s.rows.forEach(([a, b]) => L.push(`- ${a}: ${b}`)); L.push(''); });
    L.push('LISTA DE COMPRAS');
    out.shopping.forEach((x) => L.push(`[${bought[x.cat + '|' + x.item] ? 'x' : ' '}] ${x.item} — ${x.qty} (${x.where})`));
    return L.join('\n');
  }
  const msg = (t) => { $('planMsg').textContent = t; };
  $('planCopy').onclick = async () => { try { await navigator.clipboard.writeText(planText()); msg('Plano copiado.'); } catch { msg('Não foi possível copiar.'); } };
  $('planPrint').onclick = () => { document.body.classList.add('print-plan'); window.print(); setTimeout(() => document.body.classList.remove('print-plan'), 500); };
  $('planExport').onclick = () => {
    const blob = new Blob([JSON.stringify({ v: 1, house: H, bought }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'survival-radar-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    msg('Backup baixado. Guarde com cuidado: contém dados sensíveis da família.');
  };
  $('planImport').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); H = Object.assign(structuredClone(DEFAULT), j.house || {}); bought = j.bought || {}; save(); try { localStorage.setItem(BOUGHT, JSON.stringify(bought)); } catch {} renderForm(); renderOutput(); msg('Backup restaurado.'); }
    catch { msg('Arquivo inválido.'); }
  };

  // ---------- abas ----------
  function show(tab) {
    document.querySelectorAll('[data-view]').forEach((el) => { el.hidden = el.dataset.view !== tab; });
    document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    if (tab === 'local' && window.__srMap) setTimeout(() => window.__srMap.invalidateSize(), 50);
  }
  document.querySelectorAll('.tabs button').forEach((b) => (b.onclick = () => { show(b.dataset.tab); history.replaceState(null, '', '#' + b.dataset.tab); }));
  show(location.hash === '#plano' ? 'plano' : 'local');

  renderForm();
  renderOutput();
})();
