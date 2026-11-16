/* Survival Radar — interface do Plano da Casa. Tudo fica no aparelho (localStorage + IndexedDB). */
(function () {
  'use strict';
  const PLAN = window.PLAN;
  const $ = (id) => document.getElementById(id);
  const KEY = 'sr_house_v1';
  const BOUGHT = 'sr_bought_v1';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nw = (s) => String(s == null ? '' : s).replace(/ ([^ ]{1,18})$/, '\u00a0$1');

  const DEFAULT = {
    horizon: 14,
    scenarios: ['apagao', 'chuva', 'invasao'], scenarioOther: '',
    people: [{ name: 'Adulto 1', sex: '', birth: '' }, { name: 'Adulto 2', sex: '', birth: '' }],
    pets: [],
    hasVehicle: false, vehicles: [],
    alertLevel: 'verde', comms: { bridgeName: '', bridgePhone: '', bridgeCity: '', meetLocal: '', meetFar: '', destination: '', pickup: '', contacts: [] },
    roles: {}, reviews: {}, checks: {}, inventory: [],
    properties: [newProperty('Residência principal')],
    money: { monthly: '' },
  };
  function newProperty(name) {
    return { name: name || '', type: 'apto', tenure: '', use: 'principal', housingCost: '', condo: '', families: '', floor: '', area: '', bedrooms: 2, waterTank: '', gas: 'encanado', elevator: false, concierge: false, lock: 'comum', door: 'macica', solar: false, utilities: { gas: '', water: '', power: '' }, exit1: '', exit2: '', meet: '', refuge: '' };
  }
  const newVehicle = () => ({ type: 'carro', model: '', year: '', fuel: 'flex', armored: 'nao', drive: '4x2', tank: '', kmPerL: '', range: '', notes: '' });
  // Converte dados do formato anterior (um imóvel e um veículo) para listas.
  function migrateRaw(raw) {
    if (!raw) return raw;
    if (raw.residence && !raw.properties) { raw.properties = [{ ...newProperty('Residência principal'), ...raw.residence }]; }
    delete raw.residence;
    if (raw.vehicle && !raw.vehicles) {
      raw.hasVehicle = !!raw.vehicle.has;
      raw.vehicles = raw.vehicle.has ? [{ ...newVehicle(), armored: raw.vehicle.armored ? 'sim' : 'nao', tank: raw.vehicle.tank || '', kmPerL: raw.vehicle.kmPerL || '' }] : [];
    }
    delete raw.vehicle;
    return raw;
  }
  const load = () => { try { return Object.assign(structuredClone(DEFAULT), migrateRaw(JSON.parse(localStorage.getItem(KEY))) || {}); } catch { return structuredClone(DEFAULT); } };
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
      car: !!H.hasVehicle && H.vehicles.length > 0, pets: H.pets.length > 0, armored: H.hasVehicle && H.vehicles.some((v) => v.armored === 'sim'),
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

  function vehicleCard(v, i) {
    const b = `vehicles.${i}`, ev = v.fuel === 'eletrico';
    return `<div class="card"><div class="cardhead"><b>Veículo ${i + 1}</b><span class="muted small">${esc([v.model, v.year].filter(Boolean).join(' · '))}</span></div>
      <div class="grid3">
        ${lab('Tipo', sel(`${b}.type`, v.type, PLAN.VEH_TYPES))}
        ${lab('Marca e modelo', inp(`${b}.model`, v.model, 'maxlength="40" placeholder="Ex.: Toyota SW4"'))}
        ${lab('Ano', inp(`${b}.year`, v.year, 'type="number" min="1950" max="2030"'))}
        ${lab('Combustível', sel(`${b}.fuel`, v.fuel, PLAN.FUELS))}
        ${lab('Blindado', sel(`${b}.armored`, v.armored, [['nao', 'Não'], ['sim', 'Sim']]))}
        ${lab('Tração', sel(`${b}.drive`, v.drive, PLAN.DRIVE))}
        ${ev ? lab('Autonomia com bateria cheia (km)', inp(`${b}.range`, v.range, 'type="number" min="0"')) : lab('Tanque (L)', inp(`${b}.tank`, v.tank, 'type="number" min="0"')) + lab('Consumo (km/L)', inp(`${b}.kmPerL`, v.kmPerL, 'type="number" min="0" step="0.1"'))}
      </div>
      ${lab('Observação', inp(`${b}.notes`, v.notes, 'maxlength="160" placeholder="Algo específico deste veículo"'))}
    </div>`;
  }

  function propertyCard(r, i) {
    const b = `properties.${i}`, u = r.utilities || (r.utilities = {});
    const paysHousing = ['alugado', 'financiado'].includes(r.tenure);
    return `<div class="card"><div class="cardhead"><b>${esc(r.name || 'Imóvel ' + (i + 1))}</b>${(() => { const u = (PLAN.USE.find((x) => x[0] === (r.use || 'principal')) || [0, ''])[1]; return u && u !== r.name ? `<span class="muted small">${esc(u)}</span>` : ''; })()}</div>
      <div class="addr">
        ${lab('Endereço (fica só neste aparelho)', inp(`${b}.address`, r.address, 'maxlength="140" placeholder="Rua, número, cidade"'))}
        <button type="button" data-analyze="${i}">Analisar endereço</button>
      </div>
      ${r.analysis ? `<p class="small muted">Análise de ${esc(r.analysis.date)}: exposição <b class="lv-txt-${r.analysis.overall}">${esc(r.analysis.overall)}</b> · ${r.analysis.findings.filter((f) => f.level === 'alto' || f.level === 'moderado').map((f) => esc(f.title)).join(' · ') || 'sem riscos relevantes'}</p>` : ''}
      <div class="grid3">
        ${lab('Nome', inp(`${b}.name`, r.name, 'maxlength="30" placeholder="Ex.: Casa, Sítio"'))}
        ${lab('Tipo', sel(`${b}.type`, r.type, PLAN.PROP_TYPES))}
        ${lab('Ocupação', sel(`${b}.tenure`, r.tenure || '', PLAN.TENURE))}
        ${lab('Uso', sel(`${b}.use`, r.use || 'principal', PLAN.USE))}
        ${paysHousing ? lab(r.tenure === 'alugado' ? 'Aluguel mensal (R$)' : 'Parcela mensal do financiamento (R$)', inp(`${b}.housingCost`, r.housingCost, 'type="number" min="0" step="50"')) : ''}
        ${lab('Condomínio + IPTU por mês (R$)', inp(`${b}.condo`, r.condo, 'type="number" min="0" step="50"'))}
        ${r.type === 'compartilhado' ? lab('Famílias no mesmo terreno', inp(`${b}.families`, r.families, 'type="number" min="2" max="20"')) : ''}
        ${r.type === 'apto' ? lab('Andar', inp(`${b}.floor`, r.floor, 'type="number" min="0"')) : ''}
        ${lab('Área (m²)', inp(`${b}.area`, r.area, 'type="number" min="0"'))}
        ${lab('Quartos', inp(`${b}.bedrooms`, r.bedrooms, 'type="number" min="1"'))}
        ${lab('Caixa d\'água própria (L)', inp(`${b}.waterTank`, r.waterTank, 'type="number" min="0"'))}
        ${lab('Gás', sel(`${b}.gas`, r.gas, [['encanado', 'Encanado'], ['botijao', 'Botijão']]))}
        ${lab('Fechadura da porta principal', sel(`${b}.lock`, r.lock, [['comum', 'Comum'], ['tetra', 'Chave tetra'], ['alta', 'Alta segurança / multiponto'], ['digital', 'Digital']]))}
        ${lab('Porta principal', sel(`${b}.door`, r.door, [['madeira_oca', 'Madeira oca'], ['macica', 'Madeira maciça'], ['aco', 'Aço'], ['blindada', 'Blindada']]))}
      </div>
      <div class="row wrap">${r.type === 'apto' ? chk(`${b}.elevator`, r.elevator, 'Elevador') : ''}${chk(`${b}.concierge`, r.concierge, 'Portaria ou vigilância 24 h')}${chk(`${b}.solar`, r.solar, 'Espaço com sol para painel solar')}</div>
      <h3>Onde fica (escreva de um jeito que qualquer um da família encontre)</h3>
      <div class="grid3">
        ${lab('Registro de gás', inp(`${b}.utilities.gas`, u.gas))}
        ${lab('Registro de água', inp(`${b}.utilities.water`, u.water))}
        ${lab('Quadro de energia', inp(`${b}.utilities.power`, u.power))}
        ${lab('Rota de saída principal', inp(`${b}.exit1`, r.exit1))}
        ${lab('Rota de saída alternativa', inp(`${b}.exit2`, r.exit2))}
        ${lab('Ponto de encontro fora de casa', inp(`${b}.meet`, r.meet))}
        ${lab('Cômodo de refúgio', inp(`${b}.refuge`, r.refuge))}
      </div>
      <h3>Planta</h3>
      <input type="file" data-plan="${i}" accept="image/*">
      <img data-planimg="${i}" class="planimg" alt="Planta do imóvel" hidden>
    </div>`;
  }

  function renderForm() {
    $('planForm').innerHTML = `
      <div class="panel"><h2>Horizonte do estoque</h2>
        <div class="grid3">
          ${lab('Período', sel('horizonMode', [3, 14, 30, 90].includes(+H.horizon) && !H.horizonCustom ? String(H.horizon) : 'custom', [['3', '3 dias (mínimo)'], ['14', '14 dias (recomendado)'], ['30', '30 dias'], ['90', '90 dias'], ['custom', 'Personalizado']]))}
          ${[3, 14, 30, 90].includes(+H.horizon) && !H.horizonCustom ? '' : lab('Número de dias', inp('horizon', H.horizon, 'type="number" min="1" max="365"'))}
        </div>
      </div>
      <div class="panel"><h2>Cenários a simular</h2>
        <p class="muted small">Marque todos que se aplicam. O plano junta os itens de todos, sem repetir.</p>
        <div class="scn-grid">${PLAN.SCENARIOS.concat([{ id: 'outro', label: 'Outro', horizon: null }]).map((x) => {
          const on = (H.scenarios || []).includes(x.id);
          const days = x.horizon == null ? '—' : x.horizon === 0 ? 'Imediato' : `${x.horizon}&nbsp;dias`;
          return `<label class="scn${on ? ' on' : ''}"><input type="checkbox" data-scn="${x.id}" ${on ? 'checked' : ''}><span class="scn-name">${esc(nw(x.label))}</span><span class="scn-days">${days}</span></label>`;
        }).join('')}
        </div>
        ${(H.scenarios || []).includes('outro') ? lab('Qual cenário?', inp('scenarioOther', H.scenarioOther, 'maxlength="120" placeholder="Descreva a situação"')) : ''}
      </div>
      <div class="panel"><h2>Nível de alerta atual</h2>
        <p class="muted small">Mude o nível quando um gatilho acontecer. As ações do nível aparecem no topo do resultado.</p>
        <div class="lvl-grid">${[['verde', 'Verde', 'Normalidade'], ['amarelo', 'Amarelo', 'Atenção'], ['laranja', 'Laranja', 'Preparação'], ['vermelho', 'Vermelho', 'Ação']].map(([id, name, sub]) => `<label class="lvl lvl-${id}${H.alertLevel === id ? ' on' : ''}"><input type="radio" name="lvl" data-level="${id}" ${H.alertLevel === id ? 'checked' : ''}><b>${name}</b><span>${sub}</span></label>`).join('')}</div>
      </div>
      <div class="panel"><h2>Pessoas</h2>${H.people.map(personCard).join('')}
        <button type="button" data-add="people">+ Pessoa</button></div>
      <div class="panel"><h2>Animais</h2>${H.pets.map(petCard).join('')}<button type="button" data-add="pets">+ Animal</button></div>
      <div class="panel"><h2>Veículos</h2>
        <div class="row wrap">${chk('hasVehicle', H.hasVehicle, 'Possui veículo')}
          ${H.hasVehicle ? `<label class="inline">Quantos? <input type="number" min="1" max="10" data-count="vehicles" value="${H.vehicles.length || 1}"></label>` : ''}</div>
        ${H.hasVehicle ? H.vehicles.map(vehicleCard).join('') : ''}
      </div>
      <div class="panel"><h2>Imóveis</h2>
        <div class="row wrap"><label class="inline">Quantidade de imóveis <input type="number" min="1" max="10" data-count="properties" value="${H.properties.length || 1}"></label></div>
        ${H.properties.map(propertyCard).join('')}
        <p class="muted small">A planta fica só neste aparelho. O estoque e a segurança são calculados para a residência principal.</p>
      </div>
      <div class="panel"><h2>Comunicação e reencontro</h2>
        <div class="grid3">
          ${lab('Contato-ponte (parente fora da cidade)', inp('comms.bridgeName', H.comms.bridgeName, 'maxlength="40"'))}
          ${lab('Telefone do contato-ponte', inp('comms.bridgePhone', H.comms.bridgePhone, 'type="tel" maxlength="20"'))}
          ${lab('Cidade do contato-ponte', inp('comms.bridgeCity', H.comms.bridgeCity, 'maxlength="40"'))}
          ${lab('Ponto de reencontro no bairro', inp('comms.meetLocal', H.comms.meetLocal, 'maxlength="80"'))}
          ${lab('Ponto de reencontro fora do bairro', inp('comms.meetFar', H.comms.meetFar, 'maxlength="80"'))}
          ${lab('Destino de saída (casa de parente, sítio…)', inp('comms.destination', H.comms.destination, 'maxlength="80"'))}
          ${lab('Quem pode buscar as crianças na creche ou escola', inp('comms.pickup', H.comms.pickup, 'maxlength="80"'))}
        </div>
        <h3>Contatos de emergência</h3>
        ${(H.comms.contacts || []).map((c, j) => `<div class="grid3 contact">${lab('Nome', inp(`comms.contacts.${j}.name`, c.name, 'maxlength="40"'))}${lab('Relação', inp(`comms.contacts.${j}.rel`, c.rel, 'maxlength="30" placeholder="Vizinho, pediatra…"'))}${lab('Telefone', inp(`comms.contacts.${j}.phone`, c.phone, 'type="tel" maxlength="20"'))}<button type="button" class="del" data-delcontact="${j}" aria-label="Remover contato">×</button></div>`).join('')}
        <button type="button" data-addcontact="1">+ Contato</button>
      </div>
      <div class="panel"><h2>Papéis da família</h2>
        <p class="muted small">Quem faz cada tarefa numa emergência.</p>
        <div class="grid3">${PLANX.ROLES.map(([id, label]) => lab(label, sel(`roles.${id}`, (H.roles || {})[id] || '', [['', '—']].concat(H.people.filter((p) => p.name).map((p) => [p.name, p.name]))))).join('')}</div>
      </div>
      <div class="panel"><h2>Estoque atual</h2>
        <p class="muted small">Registre o que já tem e a validade. O app avisa o que vence primeiro.</p>
        ${(H.inventory || []).map((x, j) => `<div class="grid3 inv">${lab('Item', inp(`inventory.${j}.name`, x.name, 'maxlength="40"'))}${lab('Quantidade', inp(`inventory.${j}.qty`, x.qty, 'type="number" min="0" step="0.1"'))}${lab('Unidade', inp(`inventory.${j}.unit`, x.unit, 'maxlength="15" placeholder="kg, un, L"'))}${lab('Validade', inp(`inventory.${j}.expiry`, x.expiry, 'type="date"'))}${lab('Onde está guardado', inp(`inventory.${j}.location`, x.location, 'maxlength="40"'))}<button type="button" class="del" data-delinv="${j}" aria-label="Remover item">×</button></div>`).join('')}
        <button type="button" data-addinv="1">+ Item</button>
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
    if (e.target.dataset.level) {
      H.alertLevel = e.target.dataset.level; save();
      document.querySelectorAll('.lvl').forEach((l) => l.classList.toggle('on', l.querySelector('input').checked));
      renderOutput(); return;
    }
    const scn = e.target.dataset.scn;
    if (scn) {
      const set = new Set(H.scenarios || []);
      e.target.checked ? set.add(scn) : set.delete(scn);
      H.scenarios = [...set]; save();
      e.target.closest('.scn').classList.toggle('on', e.target.checked);
      if (scn === 'outro') rerender(); else renderOutput();
      return;
    }
    const cnt = e.target.dataset.count;
    if (cnt) {
      const n = Math.max(1, Math.min(10, parseInt(e.target.value, 10) || 1));
      const arr = H[cnt];
      while (arr.length < n) arr.push(cnt === 'vehicles' ? newVehicle() : newProperty(arr.length ? '' : 'Residência principal'));
      if (arr.length > n) arr.length = n;
      save(); rerender(); return;
    }
    const p = e.target.dataset.p || '';
    if (p === 'hasVehicle' && H.hasVehicle && !H.vehicles.length) H.vehicles.push(newVehicle());
    if (/(controlled|species|usesMeds|hasVehicle|\.type|\.tenure|\.fuel|\.use)$/.test(p)) { save(); rerender(); }
  });
  function rerender() { const y = scrollY; const a = document.activeElement && document.activeElement.dataset.p; renderForm(); renderOutput(); scrollTo(0, y); if (a) { const el = document.querySelector(`[data-p="${a}"]`); if (el && el.type !== 'date') el.focus(); } }
  $('planForm').addEventListener('click', (e) => {
    const d = e.target.dataset;
    if (d.analyze != null) { analyzeProperty(+d.analyze); return; }
    if (d.addcontact) { (H.comms.contacts = H.comms.contacts || []).push({ name: '', rel: '', phone: '' }); save(); rerender(); return; }
    if (d.delcontact != null) { H.comms.contacts.splice(+d.delcontact, 1); save(); rerender(); return; }
    if (d.addinv) { (H.inventory = H.inventory || []).push({ name: '', qty: '', unit: '', expiry: '', location: '' }); save(); rerender(); return; }
    if (d.delinv != null) { H.inventory.splice(+d.delinv, 1); save(); rerender(); return; }
    const add = e.target.dataset.add, del = e.target.dataset.del, addmed = e.target.dataset.addmed, delmed = e.target.dataset.delmed;
    if (addmed) { const [k, i] = addmed.split('.'); (H[k][+i].meds = H[k][+i].meds || []).push({ name: '', perDay: 1, stock: '', unit: k === 'pets' ? 'doses' : 'comprimidos', controlled: false }); }
    else if (delmed) { const [k, i, j] = delmed.split('.'); H[k][+i].meds.splice(+j, 1); }
    else if (add) { H[add].push(add === 'people' ? { name: '', sex: '', birth: '' } : { species: 'cao', name: '', weight: '' }); }
    else if (del) { const [k, i] = del.split('.'); H[k].splice(+i, 1); }
    else return;
    save(); const y = scrollY; renderForm(); renderOutput(); scrollTo(0, y);
  });

  // ---------- analisar endereço de um imóvel (usa a aba Local) ----------
  let pendingProp = null;
  function analyzeProperty(i) {
    const p = H.properties[i];
    if (!p.address) { alertMsg('Preencha o endereço do imóvel antes de analisar.'); return; }
    pendingProp = i;
    document.querySelector('[data-tab="local"]').click();
    $('placeName').value = p.name || `Imóvel ${i + 1}`;
    $('q').value = p.address;
    $('searchForm').requestSubmit();
  }
  function alertMsg(t) { const m = $('planMsg'); if (m) { m.textContent = t; m.scrollIntoView({ block: 'center' }); } }
  window.addEventListener('sr-analyzed', (e) => {
    if (pendingProp == null || !H.properties[pendingProp]) return;
    const m = e.detail;
    H.properties[pendingProp].analysis = {
      date: new Date().toLocaleDateString('pt-BR'), overall: m.evaluation.overall, lat: m.lat, lon: m.lon,
      findings: m.evaluation.findings.map((f) => ({ level: f.level, title: f.title })),
    };
    pendingProp = null;
    save(); renderForm(); renderOutput();
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
    let db = null;
    try { db = await idb(); } catch {}
    document.querySelectorAll('[data-plan]').forEach(async (input) => {
      const i = input.dataset.plan, key = i === '0' ? 'planta' : `planta-${i}`;
      const img = document.querySelector(`[data-planimg="${i}"]`);
      if (db) {
        const blob = await new Promise((res) => { const g = db.transaction('files').objectStore('files').get(key); g.onsuccess = () => res(g.result); g.onerror = () => res(null); });
        if (blob) { img.src = URL.createObjectURL(blob); img.hidden = false; }
      }
      input.onchange = (e) => {
        const f = e.target.files[0]; if (!f) return;
        try { db && db.transaction('files', 'readwrite').objectStore('files').put(f, key); } catch {}
        img.src = URL.createObjectURL(f); img.hidden = false;
      };
    });
  }

  // Tabela com mesclagem: linhas cuja 1ª coluna vem vazia pertencem ao grupo de cima
  // (como "mesclar e centralizar" do Excel). Grupos alternam o tom de fundo.
  function table(rows) {
    const html = [];
    let g = -1;
    rows.forEach(([a, b], i) => {
      if (a !== '' || i === 0) {
        g++;
        let span = 1;
        while (i + span < rows.length && rows[i + span][0] === '') span++;
        const head = span > 1 ? `<td class="merged" rowspan="${span}">${esc(nw(a))}</td>` : `<td>${esc(nw(a))}</td>`;
        html.push(`<tr class="g${g % 2}${span > 1 ? ' gstart' : ''}">${head}<td>${esc(nw(b))}</td></tr>`);
      } else {
        html.push(`<tr class="g${g % 2} gcont"><td>${esc(nw(b))}</td></tr>`);
      }
    });
    return `<table class="tbl"><tbody>${html.join('')}</tbody></table>`;
  }

  // ---------- resultado ----------
  const LV = { alto: 3, moderado: 2, baixo: 1, info: 0 };
  const PRI = { 1: 'Prioridade 1 — comprar já', 2: 'Prioridade 2 — este mês', 3: 'Prioridade 3 — quando possível' };
  const section = (s) => `<div class="panel"><h2>${esc(s.title)}</h2><p>${esc(nw(s.lead))}</p>${table(s.rows)}</div>`;

  function renderOutput() {
    const out = PLAN.compute(H);
    const x = PLANX.extend(H, out);
    out.alerts.sort((a, b) => LV[b.level] - LV[a.level]);
    // nível atual
    $('planLevel').className = 'panel lvl-banner lvl-' + x.current.level;
    $('planLevel').innerHTML = `<p class="eyebrow">Nível de alerta atual</p><h2>${esc(x.current.label)}</h2><ol>${x.current.actions.map((a) => `<li>${esc(nw(a))}</li>`).join('')}</ol>`;
    $('planAlerts').innerHTML = out.alerts.length
      ? out.alerts.map((a) => `<li class="lv-${a.level}"><span class="tag">${a.level}</span><div>${esc(nw(a.text))}</div></li>`).join('')
      : '<li class="lv-baixo"><span class="tag">ok</span><div>Nenhum alerta crítico com os dados informados.</div></li>';
    const byTitle = (t) => out.sections.find((z) => z.title === t);
    const first = ['Cenários simulados'].map(byTitle).filter(Boolean);
    const rest = out.sections.filter((z) => !first.includes(z));
    const xs = Object.fromEntries(x.sections.map((z) => [z.title, z]));
    const ordered = [...first, x.timeline, xs['Níveis de alerta'], ...rest, xs['Comunicação e reencontro'], xs['Bolsa de saída'], xs['Papéis da família']].filter(Boolean);
    let html = ordered.map(section).join('');
    // checklist
    const groups = {};
    x.checklist.forEach((c) => (groups[c.group] = groups[c.group] || []).push(c));
    const doneN = x.checklist.filter((c) => (H.checks || {})[c.id]).length;
    html += `<div class="panel"><h2>Checklist de preparação</h2><p>${doneN} de ${x.checklist.length} concluídos.</p>${Object.entries(groups).map(([g, list]) => `<h3>${esc(g)}</h3><ul class="shop">${list.map((c) => `<li><label class="check"><input type="checkbox" data-check="${c.id}" ${(H.checks || {})[c.id] ? 'checked' : ''}><span>${esc(nw(c.text))}</span></label></li>`).join('')}</ul>`).join('')}</div>`;
    // revisões
    html += `<div class="panel"><h2>Rotina de revisão</h2><p>${esc(nw('Um plano com crianças pequenas vence em semanas. Marque cada revisão quando fizer.'))}</p><ul class="shop">${x.reviews.map((r) => `<li class="rev${r.late ? ' late' : ''}"><div><b>${esc(nw(r.text))}</b><br><span class="muted small">${r.last ? 'Última: ' + PLANX.fmtDate(r.last) + ' · ' : ''}${esc(r.status)}</span></div>${r.id ? `<button type="button" data-review="${r.id}">Feito hoje</button>` : ''}</li>`).join('')}</ul></div>`;
    // estoque
    if (x.inventory.length) html += `<div class="panel"><h2>Estoque atual</h2><p>${esc(nw('Ordenado pela validade: consuma de cima para baixo e reponha.'))}</p><table class="tbl"><tbody>${x.inventory.map((i) => `<tr class="${i.days != null && i.days < 0 ? 'inv-bad' : i.days != null && i.days <= 30 ? 'inv-warn' : ''}"><td>${esc(nw(i.name))}${i.location ? `<br><span class="small">${esc(i.location)}</span>` : ''}</td><td>${esc(i.qty || '')} ${esc(i.unit || '')}</td><td>${esc(i.status)}</td></tr>`).join('')}</tbody></table></div>`;
    $('planSections').innerHTML = html;

    // compras por prioridade, com custo estimado
    const t = x.totals;
    $('planShopping').innerHTML = `<div class="totals">${[1, 2, 3].map((p) => `<div><span class="eyebrow">${PRI[p].split(' — ')[0]}</span><b>${t.brl(t.byPri[p - 1])}</b><span class="small muted">${PRI[p].split(' — ')[1]}</span></div>`).join('')}<div><span class="eyebrow">Total estimado</span><b>${t.brl(t.all)}</b><span class="small muted">preços aproximados</span></div></div>` +
      [1, 2, 3].map((p) => {
        const list = out.shopping.filter((z) => z.pri === p);
        if (!list.length) return '';
        return `<h3>${esc(PRI[p])}</h3><ul class="shop">${list.map((z) => {
          const id = z.cat + '|' + z.item;
          return `<li><label class="check"><input type="checkbox" data-buy="${esc(id)}" ${bought[id] ? 'checked' : ''}><span><b>${esc(nw(z.item))}</b> · ${esc(z.qty)}${z.cost ? ` · <span class="cost">≈&nbsp;${t.brl(z.cost)}</span>` : ''}<br><span class="muted small"><span class="cat-tag">${esc(z.cat)}</span> ${esc(nw(z.where + (z.note ? ' · ' + z.note : '')))}</span></span></label></li>`;
        }).join('')}</ul>`;
      }).join('');
    const total = out.shopping.length, done = out.shopping.filter((z) => bought[z.cat + '|' + z.item]).length;
    $('planProgress').textContent = `${done} de ${total} itens prontos. Custos são estimativas aproximadas e servem para priorizar, não para orçar.`;
    window.__planOut = out; window.__planX = x;
  }
  $('planSections').addEventListener('change', (e) => {
    const id = e.target.dataset.check; if (!id) return;
    H.checks = H.checks || {}; H.checks[id] = e.target.checked; save(); renderOutput();
  });
  $('planSections').addEventListener('click', (e) => {
    const id = e.target.dataset.review; if (!id) return;
    H.reviews = H.reviews || {}; H.reviews[id] = PLANX.iso(new Date()); save(); renderOutput();
  });
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
    const x = window.__planX;
    L.unshift(`NÍVEL ATUAL: ${x.current.label}`, ...x.current.actions.map((a) => '- ' + a), '');
    [...out.sections, ...(x.timeline ? [x.timeline] : []), ...x.sections].forEach((s) => { L.push(s.title.toUpperCase(), s.lead); let g = ''; s.rows.forEach(([a, b]) => { if (a) g = a; L.push(`- ${a || g}: ${b}`); }); L.push(''); });
    L.push('CHECKLIST'); x.checklist.forEach((c) => L.push(`[${(H.checks || {})[c.id] ? 'x' : ' '}] ${c.text}`)); L.push('');
    L.push('LISTA DE COMPRAS');
    out.shopping.slice().sort((a, b) => a.pri - b.pri).forEach((z) => L.push(`[${bought[z.cat + '|' + z.item] ? 'x' : ' '}] P${z.pri} ${z.item} — ${z.qty} (${z.where})`));
    return L.join('\n');
  }
  const msg = (t) => { $('planMsg').textContent = t; };
  $('planCopy').onclick = async () => { try { await navigator.clipboard.writeText(planText()); msg('Plano copiado.'); } catch { msg('Não foi possível copiar.'); } };
  $('planPrint').onclick = () => { document.body.classList.add('print-plan'); window.print(); setTimeout(() => document.body.classList.remove('print-plan'), 500); };
  // Backup: com senha, o arquivo é cifrado (AES-GCM, chave derivada por PBKDF2).
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function keyFrom(pass, salt) {
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  $('planExport').onclick = async () => {
    const plain = JSON.stringify({ v: 1, house: H, bought });
    const pass = $('planPass').value;
    let body = plain, name = 'survival-radar-backup.json';
    if (pass) {
      const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
      const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyFrom(pass, salt), new TextEncoder().encode(plain));
      body = JSON.stringify({ v: 2, enc: 'AES-GCM/PBKDF2-SHA256-250k', salt: b64(salt), iv: b64(iv), data: b64(data) });
      name = 'survival-radar-backup-cifrado.json';
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    msg(pass ? 'Backup cifrado baixado. Sem a senha, ninguém abre, nem você.' : 'Backup baixado SEM senha: contém dados sensíveis. Prefira preencher a senha.');
  };
  $('planImport').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      let j = JSON.parse(await f.text());
      if (j.enc) {
        const pass = $('planPass').value;
        if (!pass) { msg('Backup cifrado: digite a senha no campo e selecione o arquivo de novo.'); e.target.value = ''; return; }
        try {
          const data = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, await keyFrom(pass, unb64(j.salt)), unb64(j.data));
          j = JSON.parse(new TextDecoder().decode(data));
        } catch { msg('Senha incorreta.'); e.target.value = ''; return; }
      }
      H = Object.assign(structuredClone(DEFAULT), migrateRaw(j.house) || {}); bought = j.bought || {};
      save(); try { localStorage.setItem(BOUGHT, JSON.stringify(bought)); } catch {}
      renderForm(); renderOutput(); msg('Backup restaurado.');
    } catch { msg('Arquivo inválido.'); }
    e.target.value = '';
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
