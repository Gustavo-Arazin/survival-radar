/* Survival Radar — extensões do plano: níveis de alerta, comunicação, bolsa de saída,
 * checklists, revisões, papéis, estoque, simulação, priorização e custo, cenários sugeridos.
 * Determinístico e sem rede. Depende de plan.js (PLAN). */
(function (root) {
  'use strict';
  const PLAN = root.PLAN || (typeof require !== 'undefined' ? require('./plan.js') : null);
  const DAY = 86400000;
  const iso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const parse = (s) => { if (!s) return null; const [y, m, d] = s.split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : null; };
  const brl = (v) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

  // ---------- papéis ----------
  const ROLES = [
    ['criancas', 'Pegar e levar as crianças'],
    ['utilidades', 'Fechar gás, água e desligar a energia'],
    ['bolsas', 'Bolsas de saída e documentos'],
    ['medicacao', 'Medicação e ficha de emergência'],
    ['animais', 'Animais'],
    ['veiculo', 'Veículo, combustível e rota'],
    ['comunicacao', 'Avisar o contato-ponte e a família'],
  ];

  // ---------- modo de cada cenário (para a linha do tempo) ----------
  const MODE = { apagao: 'ficar', agua: 'ficar', chuva: 'sair', abastecimento: 'ficar', epidemia: 'ficar', quimico: 'abrigo', barragem: 'sair', incendio: 'imediato', invasao: 'imediato', disturbio: 'ficar', conflito: 'sair', digital: 'ficar', calor: 'ficar' };

  // ---------- preço estimado (R$, aproximado) e prioridade por item ----------
  // [regex do item, preço unitário, unidade de cálculo ('un'|'kg'|'L'|'fixo'), prioridade]
  const PRICE = [
    [/^Água potável/i, 13, 'galao', 1], [/^Hipoclorito/i, 8, 'fixo', 1], [/^Filtro/i, 160, 'fixo', 2],
    [/^Arroz/i, 6, 'kg', 2], [/^Feijão/i, 8, 'kg', 2], [/^Macarrão/i, 9, 'kg', 2], [/^Proteína enlatada/i, 40, 'kg', 2],
    [/^Aveia/i, 20, 'kg', 2], [/^Óleo/i, 9, 'L', 2], [/^Leite em pó/i, 45, 'kg', 2], [/^Pasta de amendoim/i, 40, 'kg', 2],
    [/^Açúcar/i, 6, 'kg', 2], [/^Frutas e legumes/i, 25, 'kg', 2], [/^Sal, temperos/i, 40, 'fixo', 3],
    [/^Botijão/i, 320, 'fixo', 2], [/^Fogareiro/i, 220, 'fixo', 2],
    [/^Fraldas/i, 1.3, 'un', 1], [/^Lenços umedecidos/i, 10, 'un', 1], [/^Fórmula infantil/i, 0, 'fixo', 1], [/^Alimentos adequados/i, 150, 'fixo', 1],
    [/^Ração/i, 25, 'kg', 1], [/^Areia/i, 30, 'un', 2], [/^Caixa de transporte/i, 180, 'fixo', 2],
    [/^Dinheiro em espécie/i, 0, 'fixo', 1],
    [/^Lanterna de cabeça/i, 60, 'un', 1], [/^Lanterna de mão/i, 40, 'un', 2], [/^Luminária/i, 70, 'un', 2], [/^Luz de emergência/i, 55, 'un', 2], [/^Pilhas/i, 4, 'un', 1],
    [/^Estação de energia/i, 7000, 'fixo', 3], [/^Rádio/i, 120, 'fixo', 2],
    [/^Kit no porta-malas/i, 200, 'un', 2], [/^Fechadura/i, 900, 'fixo', 1], [/^Extintor/i, 180, 'fixo', 1], [/^Detector/i, 250, 'fixo', 1],
    [/^Mochila/i, 180, 'un', 1], [/^Kit de primeiros socorros/i, 250, 'fixo', 1],
  ];
  const num = (s) => { const m = String(s).match(/[\d.,]+/); return m ? parseFloat(m[0].replace(/\./g, '').replace(',', '.')) : 1; };

  function priceOf(x) {
    if (x.cat === 'Medicação') return { pri: 1, cost: 0 };
    if (x.cat.startsWith('Cenário')) return { pri: 3, cost: 0 };
    for (const [re, price, unit, pri] of PRICE) {
      if (!re.test(x.item)) continue;
      let q = 1;
      if (unit === 'galao') q = num(x.qty);
      else if (unit !== 'fixo') q = num(x.qty);
      return { pri, cost: price * q };
    }
    return { pri: 3, cost: 0 };
  }

  // ---------- bolsa de saída por pessoa ----------
  function bagFor(p) {
    const s = PLAN.stage(p.mo);
    const base = ['Cópia dos documentos (RG/CPF/certidão, plano de saúde) em saco plástico', '1 muda de roupa e agasalho', 'Água 1 L e lanche'];
    if (s === 'lactente') return ['Certidão, cartão do SUS e carteira de vacina (cópias)', 'Fraldas para 24 h (8 a 10) e lenços', 'Pomada, trocador descartável e 2 mudas de roupa', 'Manta e touca', 'Mamadeira, fórmula e água, se não for só peito'];
    if (s === 'bebe') return ['Certidão, cartão do SUS e carteira de vacina (cópias)', 'Fraldas para 24 h (5 a 6) e lenços', 'Lanche que a criança já come e copo com tampa', '2 mudas de roupa e agasalho', 'Brinquedo ou objeto de conforto'];
    if (s === 'crianca') return base.concat(['Brinquedo ou livro', 'Cartão com nome dos pais e telefone do contato-ponte']);
    const adult = base.concat(['Carregador e power bank', 'Lanterna de cabeça', 'Dinheiro em notas pequenas', 'Medicação de uso contínuo para 7 dias e cópia da receita']);
    if (s === 'idoso' || p.mobility) adult.push('Óculos, aparelho auditivo e itens de mobilidade');
    return adult;
  }

  // ---------- revisões ----------
  const ROUTINES = [
    ['mensal', 'Mensal: girar água e comida, conferir fraldas, recarregar baterias', 30],
    ['trimestral', 'Trimestral: revisar o plano, testar rádio e estação de energia', 91],
    ['semestral', 'Semestral: exercício de 24 h sem energia e sem água da rua', 182],
    ['anual', 'Anual: seguros, reserva, testamento, destinos e uma rota dirigida', 365],
  ];

  // ---------- extensões ----------
  function extend(h, out, today) {
    const t = today || new Date();
    const people = out.people;
    const adults = people.filter((p) => ['adulto', 'idoso', 'adolescente'].includes(PLAN.stage(p.mo)));
    const kids = people.filter((p) => ['lactente', 'bebe', 'crianca'].includes(PLAN.stage(p.mo)));
    const props = (h.properties && h.properties.length) ? h.properties : [];
    const main = props.find((p) => (p.use || 'principal') === 'principal') || props[0] || {};
    const refuge = props.find((p) => p !== main && (p.use === 'secundaria' || ['sitio', 'chacara', 'fazenda'].includes(p.type)));
    const dest = (h.comms && h.comms.destination) || (refuge && (refuge.name || 'imóvel secundário')) || '';
    const roles = h.roles || {};
    const who = (id) => roles[id] ? ` (responsável: ${roles[id]})` : '';
    const ext = { sections: [], checklist: [], reviews: [], timeline: null, inventory: [], current: null, totals: null, suggested: [] };

    // 1. Níveis de alerta
    const LEVELS = [
      ['verde', 'Verde — normalidade', 'Rotina; nada fora do comum.', ['Estoque girando e revisões em dia.']],
      ['amarelo', 'Amarelo — atenção', 'Alerta severo de chuva ou vento; anúncio de rodízio de água; paralisação de estradas em vários estados; boatos de greve policial.', ['Tanque acima de 3/4 e baterias carregadas.', 'Saque o dinheiro em espécie.', 'Complete o estoque de 72 h e a medicação.']],
      ['laranja', 'Laranja — preparação', 'Apagão acima de 12 h; mercados esvaziando; ordem de restrição de circulação; alerta extremo da Defesa Civil.', ['Todos em casa; trabalho e creche suspensos.', 'Opere com o estoque de 14 dias; água potável primeiro para os bebês.', `Confirme o contato-ponte${who('comunicacao')}.`, 'Bolsas de saída prontas na porta.']],
      ['vermelho', 'Vermelho — ação', 'Ameaça direta à casa: água subindo, incêndio, vazamento de gás, sirene de barragem, ordem oficial de evacuação.', [`Sair em até 30 minutos${dest ? ' para ' + dest : ''}${who('veiculo')}.`, `Crianças no carro primeiro${who('criancas')}.`, `Feche gás e água e desligue o disjuntor geral${who('utilidades')}.`, 'Avise o contato-ponte só depois de estar em movimento.']],
    ];
    const level = h.alertLevel || 'verde';
    const L = LEVELS.find((x) => x[0] === level) || LEVELS[0];
    ext.current = { level, label: L[1], actions: L[3] };
    const lr = [];
    for (const [, name, trig, acts] of LEVELS) { lr.push([name, 'Quando: ' + trig]); acts.forEach((a) => lr.push(['', a])); }
    ext.sections.push({ title: 'Níveis de alerta', lead: `Nível atual: ${L[1]}. Cada nível tem um gatilho observável e ações já decididas.`, rows: lr });

    // 2. Comunicação e reencontro
    const c = h.comms || {};
    const cr = [
      ['Primária', 'Celular e WhatsApp (grupo da família e da rede de apoio)'],
      ['Alternativa', 'SMS: passa quando a rede de dados está congestionada'],
      ['Contingência', 'Rádios de uso livre homologados pela Anatel (curto alcance)'],
      ['Emergência', `Ponto de reencontro: ${c.meetLocal || 'não definido (bairro)'} · ${c.meetFar || 'não definido (fora do bairro)'}`],
      ['Contato-ponte', c.bridgeName ? `${c.bridgeName}${c.bridgePhone ? ' · ' + c.bridgePhone : ''}${c.bridgeCity ? ' · ' + c.bridgeCity : ''}` : 'não definido'],
    ];
    (c.contacts || []).filter((x) => x.name).forEach((x) => cr.push([x.rel || 'Contato', `${x.name}${x.phone ? ' · ' + x.phone : ''}`]));
    if (kids.length) cr.push(['Quem pode buscar as crianças', c.pickup || 'não definido']);
    cr.push(['Emergência pública', 'SAMU 192 · Bombeiros 193 · Polícia 190 · Defesa Civil 199']);
    ext.sections.push({ title: 'Comunicação e reencontro', lead: 'Quatro camadas (P.A.C.E.) e um contato fora da cidade que centraliza quem está onde.', rows: cr });
    if (!c.bridgeName) out.alerts.push({ level: 'moderado', text: 'Contato-ponte não definido: escolha um parente fora da cidade que todos avisam numa emergência.' });
    if (!c.meetLocal || !c.meetFar) out.alerts.push({ level: 'moderado', text: 'Ponto de reencontro incompleto: defina um no bairro e outro fora dele.' });

    // 3. Bolsa de saída
    const br = [];
    people.forEach((p) => bagFor(p).forEach((it, i) => br.push([i === 0 ? (p.name || 'Pessoa') : '', it])));
    (h.pets || []).forEach((pet) => { const n = pet.name || 'Animal'; ['Ração e água para 3 dias', 'Guia, coleira com telefone e caixa de transporte', 'Carteira de vacina (cópia)'].forEach((it, i) => br.push([i === 0 ? n : '', it])); });
    br.push(['Família', 'Kit de primeiros socorros, rádio a pilha, lista impressa de contatos, mapa em papel da região, apito']);
    ext.sections.push({ title: 'Bolsa de saída', lead: `Uma mochila por adulto, pronta perto da porta. ${kids.length ? 'Os itens das crianças vão nas mochilas dos adultos.' : ''}`.trim(), rows: br });
    out.shopping.push({ cat: 'Bolsa de saída', item: 'Mochila de emergência', qty: `${Math.max(1, adults.length)}`, where: 'Loja de camping ou de malas', note: 'Uma por adulto; leve, com alças acolchoadas.' });
    out.shopping.push({ cat: 'Bolsa de saída', item: 'Kit de primeiros socorros completo', qty: '1', where: 'Farmácia', note: 'Gaze, atadura, esparadrapo, soro fisiológico, luvas, tesoura, termômetro, antisséptico.' });

    // 4. Checklists (saúde, finanças, casa)
    const add = (group, id, text) => ext.checklist.push({ group, id, text });
    add('Saúde', 'curso', `Curso de primeiros socorros${kids.length ? ' pediátricos (desengasgo e RCP)' : ''} para os adultos`);
    if (kids.length) add('Saúde', 'ps-ped', 'Pronto-socorro pediátrico 24 h definido, coberto pelo plano, com duas rotas');
    add('Saúde', 'alarme', 'Sinais de alarme escritos e validados pelo médico ou pediatra');
    if (people.some((p) => p.mo != null && p.mo < 12)) add('Saúde', 'plano-bebe', 'Bebê inscrito como beneficiário do plano de saúde');
    add('Saúde', 'vacinas', 'Vacinas em dia para todos; cadernetas em foto');
    add('Saúde', 'farmacia', 'Farmácia doméstica com doses por peso escritas');
    if (kids.some((p) => PLAN.stage(p.mo) !== 'lactente')) add('Saúde', 'casa-crianca', 'Casa segura para criança: tomadas, quinas, janelas, produtos fora do alcance');
    add('Finanças', 'reserva', 'Reserva financeira de 6 a 12 meses em liquidez diária');
    add('Finanças', 'seguro', 'Seguro de vida e invalidez do provedor de renda');
    if (kids.length) add('Finanças', 'tutor', 'Testamento e indicação de tutor das crianças');
    add('Finanças', 'bancos', 'Contas em dois bancos, com cartão físico de cada');
    add('Finanças', 'golpes', 'Autenticação em dois fatores fora do SMS e limite de Pix noturno');
    add('Finanças', 'cofre', 'Cofre de documentos físico (bolsa anti-fogo) e digital (criptografado)');
    add('Casa', 'cep', 'CEP de cada imóvel cadastrado na Defesa Civil (SMS 40199)');
    add('Casa', 'utilidades', 'Todos os adultos sabem fechar gás e água e desligar o disjuntor geral');
    add('Casa', 'exercicio', 'Exercício de saída feito com as crianças (tempo cronometrado)');

    // 5. Revisões e marcos das crianças
    const rv = h.reviews || {};
    for (const [id, text, every] of ROUTINES) {
      const last = parse(rv[id]);
      const next = last ? new Date(last.getTime() + every * DAY) : null;
      const status = !last ? 'nunca feita' : next < t ? 'atrasada' : `próxima em ${fmtDate(iso(next))}`;
      ext.reviews.push({ id, text, last: rv[id] || '', status, late: !last || next < t });
    }
    for (const p of people) {
      if (p.mo == null || p.mo >= 36 || !p.birth) continue;
      const b = parse(p.birth);
      const m = [3, 6, 12, 24, 36].find((x) => x > p.mo);
      if (!m || !b) continue;
      const d = new Date(b.getFullYear(), b.getMonth() + m, b.getDate());
      ext.reviews.push({ id: null, text: `${p.name || 'Criança'} faz ${m < 24 ? m + ' meses' : m / 12 + ' anos'}: recalcular alimentação, fraldas e doses`, last: '', status: `em ${fmtDate(iso(d))}`, late: false });
    }
    const late = ext.reviews.filter((r) => r.id && r.late).length;
    if (late) out.alerts.push({ level: 'moderado', text: `${late} rotina(s) de revisão atrasada(s) ou nunca feita(s).` });

    // 6. Papéis
    const rr = ROLES.map(([id, label]) => [label, roles[id] || 'não definido']);
    ext.sections.push({ title: 'Papéis da família', lead: 'Cada tarefa crítica tem um dono. Em emergência, ninguém decide nada na hora.', rows: rr });
    const missingRoles = ROLES.filter(([id]) => !roles[id] && !(id === 'animais' && !(h.pets || []).length) && !(id === 'criancas' && !kids.length));
    if (missingRoles.length) out.alerts.push({ level: 'moderado', text: `${missingRoles.length} papel(is) sem responsável: ${missingRoles.map((r) => r[1].toLowerCase()).join('; ')}.` });

    // 7. Simulação: linha do tempo por cenário
    const sel = PLAN.SCENARIOS.filter((x) => (h.scenarios || []).includes(x.id));
    if (sel.length) {
      const T = [];
      for (const sc of sel) {
        const mode = MODE[sc.id] || 'ficar';
        let steps;
        if (mode === 'sair') steps = [
          ['Alerta', `${sc.acts[0]}`],
          ['Primeira hora', `Decisão de sair: bolsas, documentos, medicação, crianças e animais no carro${who('bolsas')}. Siga para ${dest || 'o destino definido'}.`],
          ['Até 24 h', `No destino: confirme todos e avise o contato-ponte${who('comunicacao')}.`],
          ['Até 72 h', 'Use o estoque do destino; decida permanência ou retorno só com informação oficial.'],
        ];
        else if (mode === 'abrigo') steps = [
          ['Alerta', sc.acts[0]],
          ['Primeira hora', `Todos no cômodo vedado, com água, rádio e medicação${who('medicacao')}.`],
          ['Até 24 h', 'Saia do abrigo só com liberação oficial; ventile a casa ao sair.'],
          ['Até 72 h', 'Acompanhe orientação sobre água e alimentos expostos.'],
        ];
        else if (mode === 'imediato') steps = [
          ['Primeiros minutos', sc.acts[0]],
          ['Em seguida', sc.acts[1] || 'Siga a rota de saída e o ponto de encontro.'],
          ['Depois', `${sc.acts[2] || ''} Avise o contato-ponte e registre o ocorrido.`.trim()],
        ];
        else steps = [
          ['Alerta', `Confirme em fonte oficial (rádio, Defesa Civil). ${sc.acts[0]}`],
          ['Primeira hora', `Encha recipientes de água, carregue baterias e confira medicação e fraldas${who('medicacao')}.`],
          ['Até 24 h', 'Racione pelo plano: água potável primeiro para os bebês; registre o consumo.'],
          ['Até 72 h', 'Se não melhorar, suba para o nível seguinte e prepare a saída.'],
        ];
        steps.forEach(([when, what], i) => T.push([i === 0 ? sc.label : '', `${when}: ${what}`]));
      }
      ext.timeline = { title: 'Simulação: linha do tempo', lead: 'O que acontece em cada fase de cada cenário. Faça o exercício e marque a revisão semestral.', rows: T };
    }

    // 8. Estoque com validades
    const inv = (h.inventory || []).filter((x) => x.name);
    for (const x of inv) {
      const e = parse(x.expiry);
      const days = e ? Math.round((e - t) / DAY) : null;
      const status = days == null ? 'sem validade' : days < 0 ? `vencido há ${-days} dias` : days <= 30 ? `vence em ${days} dias` : `vence em ${fmtDate(x.expiry)}`;
      ext.inventory.push({ ...x, days, status });
    }
    ext.inventory.sort((a, b) => (a.days ?? 1e9) - (b.days ?? 1e9));
    const expired = ext.inventory.filter((x) => x.days != null && x.days < 0).length;
    const soon = ext.inventory.filter((x) => x.days != null && x.days >= 0 && x.days <= 30).length;
    if (expired) out.alerts.unshift({ level: 'alto', text: `${expired} item(ns) do estoque vencido(s): substitua.` });
    if (soon) out.alerts.push({ level: 'moderado', text: `${soon} item(ns) vencem em até 30 dias: consuma primeiro e reponha.` });

    // 9. Cenários sugeridos pelos endereços analisados
    const map = [[/Barragem/i, 'barragem'], [/Refinaria|química|Depósito de combustível|Duto|nuclear/i, 'quimico'], [/Ponto baixo/i, 'chuva'], [/Subestação|Usina de energia/i, 'apagao']];
    const sugg = new Set();
    for (const p of props) for (const f of (p.analysis && p.analysis.findings) || []) {
      if (!['alto', 'moderado', 'info'].includes(f.level)) continue;
      for (const [re, id] of map) if (re.test(f.title)) sugg.add(id);
    }
    ext.suggested = [...sugg].filter((id) => !(h.scenarios || []).includes(id));
    if (ext.suggested.length) out.alerts.unshift({ level: 'moderado', text: `Pelos riscos do endereço, inclua estes cenários: ${ext.suggested.map((id) => (PLAN.SCENARIOS.find((s) => s.id === id) || {}).label).join('; ')}.` });
    const analyzed = props.filter((p) => p.analysis);
    if (props.length && !analyzed.length) out.alerts.push({ level: 'info', text: 'Nenhum imóvel com endereço analisado: use "Analisar endereço" no cartão do imóvel.' });

    // 10. Prioridade e custo estimado
    for (const x of out.shopping) Object.assign(x, priceOf(x));
    const tot = [1, 2, 3].map((p) => out.shopping.filter((x) => x.pri === p).reduce((s, x) => s + x.cost, 0));
    ext.totals = { byPri: tot, all: tot.reduce((a, b) => a + b, 0), brl };

    return ext;
  }

  const api = { extend, ROLES, MODE, ROUTINES, priceOf, bagFor, fmtDate, iso };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PLANX = api;
})(typeof self !== 'undefined' ? self : this);
