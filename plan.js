/* Survival Radar — motor do Plano da Casa (cálculos determinísticos, sem rede). */
(function (root) {
  'use strict';

  const ceil = Math.ceil;
  const r1 = (x) => Math.round(x * 10) / 10;
  const br = (x) => String(r1(x)).replace('.', ',');

  function ageMonths(birth, today) {
    if (!birth) return null;
    const [y, m, d] = String(birth).split('-').map(Number);
    const t = today || new Date();
    if (!y || !m || y < 1900 || y > t.getFullYear()) return null;
    let mo = (t.getFullYear() - y) * 12 + (t.getMonth() + 1 - m);
    if (d && t.getDate() < d) mo -= 1;
    return mo < 0 ? null : mo;
  }

  function stage(mo) {
    if (mo == null) return 'adulto';
    if (mo < 12) return 'lactente';
    if (mo < 36) return 'bebe';
    if (mo < 13 * 12) return 'crianca';
    if (mo < 18 * 12) return 'adolescente';
    if (mo < 65 * 12) return 'adulto';
    return 'idoso';
  }

  const fmtAge = (mo) => mo == null ? 'idade não informada' : mo < 24 ? `${mo} ${mo === 1 ? 'mês' : 'meses'}` : `${Math.floor(mo / 12)} anos`;

  // ---------- água ----------
  function waterPerDay(p, mo) {
    const s = stage(mo);
    let pot;
    if (s === 'lactente') pot = p.feeding === 'formula' ? 1.0 : p.feeding === 'misto' ? 0.6 : 0;
    else if (s === 'bebe') pot = 1.5;
    else if (s === 'crianca') pot = 2.5;
    else pot = 4;
    if (mo != null && mo >= 6 && mo < 12) pot += 0.3;
    if (p.lactating) pot += 1;
    if (p.pregnant) pot += 0.5;
    const hygiene = 11 + (s === 'lactente' && p.feeding !== 'peito' ? 2 : 0);
    return { pot, hygiene };
  }

  // ---------- calorias ----------
  function kcalPerDay(p, mo) {
    const s = stage(mo);
    if (s === 'lactente') return mo >= 6 ? 300 : 0;
    if (s === 'bebe') return mo < 24 ? 950 : 1100;
    if (s === 'crianca') return mo < 6 * 12 ? 1300 : mo < 10 * 12 ? 1700 : 2000;
    let k = s === 'adolescente' ? 2400 : p.sex === 'm' ? 2500 : p.sex === 'f' ? 2000 : 2200;
    if (s === 'idoso') k -= 200;
    if (p.pregnant) k += 350;
    if (p.lactating) k += 500;
    return k;
  }

  // Cesta de estoque: fração das calorias e densidade (kcal por kg ou por litro).
  const FOOD = [
    { item: 'Arroz', share: 0.25, kcal: 3600, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Pacotes de 5 kg; validade longa.' },
    { item: 'Feijão, lentilha ou grão-de-bico', share: 0.13, kcal: 3300, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Inclua uma parte em lata (já cozido, economiza gás e água).' },
    { item: 'Macarrão', share: 0.12, kcal: 3700, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Cozimento rápido.' },
    { item: 'Proteína enlatada (atum, sardinha, frango, carne)', share: 0.12, kcal: 1800, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Pronta para comer, sem geladeira.' },
    { item: 'Aveia, cereais e biscoitos', share: 0.10, kcal: 4000, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Café da manhã sem cozinhar.' },
    { item: 'Óleo ou azeite', share: 0.08, kcal: 8840, unit: 'L', where: 'Atacarejo ou supermercado', note: '' },
    { item: 'Leite em pó integral', share: 0.07, kcal: 5000, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Para crianças maiores de 1 ano, só com orientação do pediatra.' },
    { item: 'Pasta de amendoim, castanhas, amendoim', share: 0.05, kcal: 6000, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Alta caloria em pouco espaço.' },
    { item: 'Açúcar, mel ou achocolatado', share: 0.05, kcal: 3870, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Mel: nunca para menores de 1 ano.' },
    { item: 'Frutas e legumes em lata ou desidratados', share: 0.03, kcal: 700, unit: 'kg', where: 'Atacarejo ou supermercado', note: 'Vitaminas e fibras.' },
  ];

  // ---------- fraldas ----------
  function diapersPerDay(mo) {
    if (mo == null || mo >= 36) return 0;
    if (mo < 1) return 10;
    if (mo < 6) return 8;
    if (mo < 12) return 7;
    if (mo < 24) return 5;
    return 4;
  }
  function diaperSize(mo, kg) {
    const sizes = ['RN', 'P', 'M', 'G', 'XG', 'XXG'];
    let i;
    if (kg) i = kg < 4.5 ? 0 : kg < 6 ? 1 : kg < 9.5 ? 2 : kg < 12.5 ? 3 : kg < 15 ? 4 : 5;
    else i = mo < 1 ? 0 : mo < 4 ? 1 : mo < 9 ? 2 : mo < 18 ? 3 : mo < 30 ? 4 : 5;
    return { now: sizes[i], next: sizes[Math.min(i + 1, sizes.length - 1)] };
  }

  // ---------- pets ----------
  const PET_SPECIES = [['cao', 'Cão'], ['gato', 'Gato'], ['ave', 'Ave'], ['coelho', 'Coelho'], ['roedor', 'Roedor (hamster, porquinho-da-índia, chinchila)'], ['peixe', 'Peixe'], ['reptil', 'Réptil'], ['outro', 'Outro']];
  const DRINKS = ['cao', 'gato', 'coelho', 'roedor'];
  const petName = (pet) => pet.name || (pet.species === 'outro' && pet.other) || (PET_SPECIES.find((x) => x[0] === pet.species) || [0, 'Animal'])[1];
  const petWaterDay = (pet) => DRINKS.includes(pet.species || 'cao') ? 0.06 * Math.max(0.1, +pet.weight || 0) : 0;

  function petFood(pet) {
    const kg = Math.max(0.5, +pet.weight || 0);
    if (pet.foodPerDay) return { g: +pet.foodPerDay, estimated: false };
    const rer = 70 * Math.pow(kg, 0.75);
    if (pet.species === 'gato') return { g: Math.round((1.2 * rer) / 3.8), estimated: true };
    if (pet.species === 'cao') return { g: Math.round((1.6 * rer) / 3.6), estimated: true };
    return { g: null, estimated: true };
  }

  // ---------- dinheiro ----------
  const NOTES = [
    { v: 50, share: 0.40 }, { v: 20, share: 0.30 }, { v: 10, share: 0.20 }, { v: 5, share: 0.07 }, { v: 2, share: 0.03 },
  ];
  function cash(monthly, days) {
    const target = Math.max(1000, Math.ceil(((+monthly || 0) / 30) * days / 100) * 100);
    const notes = NOTES.map((n) => ({ note: n.v, count: ceil((target * n.share) / n.v) }));
    const total = notes.reduce((s, n) => s + n.note * n.count, 0);
    return { target, total, notes };
  }

  // ---------- plano completo ----------
  function compute(h, today) {
    const days = Math.max(3, +h.horizon || 14);
    const people = (h.people || []).map((p) => ({ ...p, mo: ageMonths(p.birth, today) }));
    const adults = people.filter((p) => ['adulto', 'idoso', 'adolescente'].includes(stage(p.mo)));
    const out = { days, sections: [], shopping: [], alerts: [], people };
    const buy = (cat, item, qty, where, note) => out.shopping.push({ cat, item, qty, where, note: note || '' });

    // Água
    let pot = 0, hyg = 0;
    for (const p of people) { const w = waterPerDay(p, p.mo); pot += w.pot; hyg += w.hygiene; }
    let petWater = 0;
    for (const pet of h.pets || []) petWater += petWaterDay(pet);
    const potTotal = ceil((pot + petWater) * days);
    const hygTotal = ceil(hyg * days);
    const tank = +((h.residence || {}).waterTank) || 0;
    buy('Água', 'Água potável em galões de 20 L', `${ceil(potTotal / 20)} galões (${potTotal} L)`, 'Distribuidora de água (entrega) ou supermercado', 'Gire o estoque: use um galão por vez e reponha.');
    buy('Água', 'Hipoclorito de sódio 2,5% (água sanitária sem perfume para tratar água)', '1 frasco de 1 L', 'Supermercado ou farmácia', '2 gotas por litro, 30 min antes de beber.');
    buy('Água', 'Filtro de barro ou cerâmico por gravidade', '1', 'Loja de utilidades domésticas', 'Funciona sem energia.');
    out.sections.push({
      title: 'Água', lead: `${potTotal} L de água potável para ${days} dias, mais ${hygTotal} L para higiene.`,
      rows: [
        ['Potável (beber e cozinhar)', `${br(pot + petWater)} L/dia · ${potTotal} L no total`],
        ['Higiene (referência humanitária Sphere: 15 L/pessoa/dia)', `${br(hyg)} L/dia · ${hygTotal} L no total`],
        ['Caixa d\'água informada', tank ? `${tank} L: ${tank >= hygTotal ? 'cobre a higiene do período' : `cobre cerca de ${Math.floor(tank / Math.max(1, hyg))} dias de higiene`}` : 'não informada'],
      ],
    });

    // Comida
    const kcalDay = people.reduce((s, p) => s + kcalPerDay(p, p.mo), 0);
    const kcalTotal = kcalDay * days;
    const foodRows = [];
    for (const f of FOOD) {
      const q = (kcalTotal * f.share) / f.kcal;
      const qty = `${r1(Math.max(q, 0.5)).toString().replace('.', ',')} ${f.unit}`;
      foodRows.push([f.item, qty]);
      buy('Comida', f.item, qty, f.where, f.note);
    }
    buy('Comida', 'Sal, temperos, café ou chá', 'consumo normal do período', 'Supermercado', '');
    const gas = (h.residence || {}).gas;
    if (gas === 'botijao') buy('Comida', 'Botijão de gás reserva (P13)', '1 cheio', 'Revendedora de gás', 'Guarde em área ventilada, nunca em ambiente fechado.');
    else buy('Comida', 'Fogareiro portátil a cartucho + cartuchos de gás', `1 fogareiro + ${ceil(days / 2)} cartuchos`, 'Loja de camping ou de utilidades', 'Use só em área ventilada (risco de monóxido de carbono).');
    out.sections.push({
      title: 'Comida', lead: `${Math.round(kcalDay).toLocaleString('pt-BR')} kcal/dia para a família; ${days} dias somam ${Math.round(kcalTotal).toLocaleString('pt-BR')} kcal. Quantidades aproximadas.`,
      rows: foodRows,
    });

    // Bebês e crianças
    const babyRows = [];
    for (const p of people) {
      const d = diapersPerDay(p.mo);
      if (!d) continue;
      const sz = diaperSize(p.mo, +p.weight || null);
      const total = d * days;
      const label = p.name || fmtAge(p.mo);
      babyRows.push([`${label}: fraldas`, `${total} (≈ ${ceil(total * 0.7)} tamanho ${sz.now} + ${total - ceil(total * 0.7)} tamanho ${sz.next})`]);
      babyRows.push([`${label}: lenços umedecidos`, `${ceil(days / 4)} pacotes`]);
      buy('Bebês', `Fraldas ${sz.now} e ${sz.next} (${label})`, `${total} unidades`, 'Atacarejo ou farmácia', 'Compre o tamanho seguinte também: o bebê troca de tamanho rápido.');
      buy('Bebês', `Lenços umedecidos (${label})`, `${ceil(days / 4)} pacotes`, 'Atacarejo ou farmácia', '');
      if (stage(p.mo) === 'lactente' && p.feeding !== 'peito') {
        babyRows.push([`${label}: fórmula infantil`, 'quantidade pela tabela da lata, conferida com o pediatra']);
        buy('Bebês', `Fórmula infantil (${label})`, 'latas para o período pela tabela da embalagem', 'Farmácia ou supermercado', 'Água para o preparo já está contada acima. Prepare conforme o pediatra.');
      }
      if (stage(p.mo) === 'bebe') buy('Bebês', `Alimentos adequados à idade (${label})`, `${days} dias`, 'Supermercado', 'O que a criança já come hoje, em versões que não precisam de geladeira.');
    }
    if (babyRows.length) out.sections.push({ title: 'Bebês e crianças pequenas', lead: 'Fraldas acabam antes da comida. Este é o item que mais falta em crise.', rows: babyRows });

    // Pets
    const petRows = [];
    for (const pet of h.pets || []) {
      const f = petFood(pet);
      const name = petName(pet);
      if (f.g) {
        const kg = r1((f.g * days * 1.1) / 1000);
        petRows.push([`${name} (${pet.weight || '?'} kg): ração`, `${f.g} g/dia${f.estimated ? ' (estimativa)' : ''} · ${String(kg).replace('.', ',')} kg no período`]);
        buy('Pets', `Ração (${name})`, `${String(kg).replace('.', ',')} kg`, 'Pet shop ou atacarejo', 'Confira a tabela da embalagem; a estimativa vale para animal adulto e castrado.');
      } else petRows.push([`${name}: alimento`, 'informe a quantidade diária em gramas para calcular o estoque']);
      if (petWaterDay(pet)) petRows.push([`${name}: água`, `${br(petWaterDay(pet))} L/dia (já somada à água potável)`]);
      else if (pet.species === 'peixe') petRows.push([`${name}: aquário`, 'sem energia, o filtro e o aquecedor param: tenha bomba de ar a pilha']);
      else if (pet.species === 'reptil') petRows.push([`${name}: aquecimento`, 'sem energia, a lâmpada de aquecimento para: planeje fonte de calor alternativa']);
      else if (pet.species === 'ave') petRows.push([`${name}: água`, 'bebedouro sempre cheio; reserve 1 L por semana']);
      if (pet.species === 'gato') buy('Pets', `Areia higiênica (${name})`, `${ceil(days / 14)} pacotes de 4 kg`, 'Pet shop', '');
      buy('Pets', `Caixa de transporte, guia e documentos de vacina (${name})`, '1', 'Pet shop', 'Necessário se precisar sair de casa.');
    }
    if (petRows.length) out.sections.push({ title: 'Animais', lead: 'Ração e água do animal entram no estoque, com 10% de margem.', rows: petRows });

    // Medicação
    const medRows = [];
    const target = Math.max(days, 30);
    for (const m of h.meds || []) {
      if (!m.name) continue;
      const perDay = Math.max(0.01, +m.perDay || 1);
      const have = +m.stock || 0;
      const lasts = Math.floor(have / perDay);
      const need = Math.max(0, ceil(target * perDay - have));
      medRows.push([`${m.name}${m.controlled ? ' (controlado)' : ''}${m.who ? ' · ' + m.who : ''}`, `dura ${lasts} dias${need ? ` · faltam ${need} ${m.unit || 'unidades'} para ${target} dias` : ' · ok'}`]);
      if (need) {
        if (m.controlled) out.alerts.push({ level: 'alto', text: `${m.name}: estoque para ${lasts} dias. Medicamento controlado só se compra com receita retida; peça ao médico uma receita que cubra a margem de ${target} dias.` });
        else buy('Medicação', m.name, `${need} ${m.unit || 'unidades'}`, 'Farmácia', 'Mantenha 30 dias de margem.');
      }
    }
    if (medRows.length) out.sections.push({ title: 'Medicação', lead: `Meta: ${target} dias de margem. Guarde cópia das receitas junto com os documentos.`, rows: medRows });

    // Ficha de emergência
    const med = people.map((p) => [p.name || 'Pessoa', [
      `idade: ${fmtAge(p.mo)}`, p.blood ? `sangue: ${p.blood}` : 'sangue: não informado',
      p.weight ? `peso: ${p.weight} kg` : '', p.conditions ? `condições/alergias: ${p.conditions}` : '',
      (h.meds || []).filter((m) => m.name && m.who === p.name).map((m) => m.name + (m.controlled ? ' (controlado)' : '')).join(', ') ? 'medicação: ' + (h.meds || []).filter((m) => m.name && m.who === p.name).map((m) => m.name).join(', ') : '',
    ].filter(Boolean).join(' · ')]);
    if (med.length) out.sections.push({ title: 'Ficha de emergência da família', lead: 'Imprima e deixe na bolsa de saída e na carteira de cada adulto. É o que o socorrista precisa saber.', rows: med });
    if (people.some((p) => !p.blood)) out.alerts.push({ level: 'moderado', text: 'Tipo sanguíneo não informado para todos: confira na carteira de doador, no exame de pré-natal ou no teste do pezinho.' });

    // Dinheiro
    const c = cash((h.money || {}).monthly, days);
    out.sections.push({
      title: 'Dinheiro em espécie', lead: `R$ ${c.target.toLocaleString('pt-BR')} para ${days} dias de despesas essenciais, em notas pequenas.`,
      rows: c.notes.map((n) => [`Notas de R$ ${n.note}`, `${n.count} notas (R$ ${(n.count * n.note).toLocaleString('pt-BR')})`]).concat([['Evite', 'notas de R$ 100 e R$ 200: em crise, ninguém tem troco']]),
    });
    buy('Dinheiro', 'Dinheiro em espécie, notas pequenas', `R$ ${c.total.toLocaleString('pt-BR')}`, 'Caixa eletrônico ou agência', 'Guarde em dois lugares diferentes da casa.');

    // Iluminação e energia
    const res = h.residence || {};
    const beds = Math.max(1, +res.bedrooms || 2);
    const nAd = Math.max(1, adults.length);
    const stairs = res.type === 'sobrado' || res.type === 'casa_cond' ? 1 : 0;
    const head = nAd + 1, hand = nAd, area = beds + 2, auto = beds + 1 + stairs;
    const batteries = (head + hand) * 3 * 3;
    out.sections.push({
      title: 'Iluminação e energia', lead: `${head + hand + area + auto} pontos de luz: um por adulto nas mãos, um por cômodo usado e luz automática na circulação.`,
      rows: [
        ['Lanterna de cabeça LED', `${head} (uma por adulto + 1 reserva). Deixa as mãos livres para cuidar dos bebês.`],
        ['Lanterna de mão LED', `${hand}`],
        ['Luminária LED de ambiente recarregável (lampião)', `${area} (um por quarto + sala + cozinha)`],
        ['Luz de emergência automática de tomada', `${auto} (acende sozinha quando falta energia: corredor, quartos${stairs ? ', escada' : ''})`],
        ['Pilhas AA (padronize tudo em AA)', `${batteries} unidades, ou recarregáveis + carregador`],
        ['Estação de energia portátil', res.solar ? '1 a 2 kWh + painel solar de 400 W' : '2 kWh ou mais (sem espaço para painel, precisa durar 3 dias sem recarga)'],
        ['Velas', 'não: risco de incêndio com crianças pequenas'],
      ],
    });
    buy('Iluminação', 'Lanterna de cabeça LED', `${head}`, 'Loja de camping ou de material de construção', '');
    buy('Iluminação', 'Lanterna de mão LED', `${hand}`, 'Loja de camping ou de material de construção', '');
    buy('Iluminação', 'Luminária LED recarregável de ambiente', `${area}`, 'Loja de material de construção ou elétrica', '');
    buy('Iluminação', 'Luz de emergência automática de tomada', `${auto}`, 'Loja de material elétrico', 'Escolha modelo com bateria de pelo menos 3 h.');
    buy('Iluminação', 'Pilhas AA', `${batteries}`, 'Atacarejo', 'Guarde fora dos aparelhos.');
    buy('Energia', 'Estação de energia portátil', res.solar ? '1–2 kWh + painel 400 W' : '≥ 2 kWh', 'Loja de eletrônicos', 'Mantenha carregada a 80% e teste a cada 3 meses.');
    buy('Energia', 'Rádio AM/FM a pilha ou manivela', '1', 'Loja de eletrônicos', 'Informação quando internet e celular caem.');

    // Veículo
    const v = h.vehicle || {};
    if (v.has) {
      const range = (+v.tank || 0) * (+v.kmPerL || 0);
      const vr = [
        ['Autonomia com tanque cheio', range ? `${Math.round(range)} km` : 'informe tanque e consumo'],
        ['Regra', 'tanque sempre acima da metade'],
        ['Combustível estocado em casa', 'não: risco de incêndio e proibido em condomínio'],
      ];
      if (v.armored) {
        vr.push(['Blindagem: ponto forte', 'protege em distúrbio civil e criminalidade; é o meio de saída preferencial']);
        vr.push(['Blindagem: ponto cego', 'vidro blindado não quebra por dentro. Nunca entre em via alagada: em submersão não há rota de fuga pela janela']);
        vr.push(['Blindagem: manutenção', 'confira pneus run-flat, borrachas e fechaduras na revisão; o peso aumenta consumo e frenagem']);
      }
      out.sections.push({ title: 'Veículo', lead: v.armored ? 'Carro blindado: ótimo contra violência, inútil contra água.' : 'O carro é o plano de saída.', rows: vr });
      buy('Veículo', 'Kit no porta-malas: água, manta, carregador, lanterna, kit de primeiros socorros', '1', 'Supermercado e farmácia', '');
    }

    // Segurança da residência
    const sec = [];
    const isHouse = ['casa', 'sobrado', 'casa_cond'].includes(res.type);
    if (res.lock === 'comum' || !res.lock) sec.push(['Fechadura da porta principal', 'PRIORIDADE: trocar por fechadura de alta segurança (cilindro anti-arrombamento e anti-mixa) + uma trava auxiliar + chapa de reforço no batente. A chave "tetra" sozinha não é o que dá segurança: o que conta é cilindro certificado e batente reforçado']);
    else if (res.lock === 'tetra') sec.push(['Fechadura da porta principal', 'aceitável; o ganho seguinte é cilindro certificado anti-arrombamento + trava auxiliar + chapa no batente']);
    else if (res.lock === 'digital') sec.push(['Fechadura da porta principal', 'confira se tem chave mecânica de emergência e bateria reserva; sem energia, ela precisa abrir']);
    else sec.push(['Fechadura da porta principal', 'adequada; confira se o batente tem chapa de reforço']);
    if (res.door === 'madeira_oca') sec.push(['Porta principal', 'porta oca cede com chute: troque por porta maciça ou de aço']);
    sec.push(['Visão da porta', 'olho mágico digital ou câmera antes de abrir']);
    if (isHouse) {
      sec.push(['Perímetro (casa)', 'iluminação externa com sensor, portas dos fundos com o mesmo padrão da frente, grades nas janelas térreas, alarme monitorado']);
    } else {
      sec.push(['Prédio', res.concierge ? 'portaria é a primeira camada: combine o protocolo para visitantes e entregas' : 'sem portaria: a porta do apartamento é a única barreira, reforce-a']);
    }
    sec.push(['Cômodo de refúgio', 'escolha um cômodo interno com porta sólida e fechadura, celular carregado e água; é para onde a família vai numa invasão']);
    out.sections.push({ title: 'Segurança da residência', lead: 'Porta, luz e alarme resolvem a maior parte do risco doméstico.', rows: sec });
    if (res.lock === 'comum' || !res.lock) {
      buy('Segurança', 'Fechadura de alta segurança + trava auxiliar + chapa de reforço do batente', '1 conjunto', 'Chaveiro especializado ou loja de material de construção', 'Instalação por chaveiro.');
      out.alerts.push({ level: 'moderado', text: 'Fechadura comum na porta principal: é o reforço de segurança mais barato e de maior efeito.' });
    }
    buy('Segurança', 'Extintor ABC 4 kg', '1', 'Loja de material de construção', 'Revise a validade anualmente.');
    buy('Segurança', 'Detector de fumaça e de monóxido de carbono', '1 de cada', 'Loja de material elétrico', '');

    // Residência informada
    const u = res.utilities || {};
    const missing = [];
    if (!u.gas) missing.push('registro de gás');
    if (!u.water) missing.push('registro de água');
    if (!u.power) missing.push('quadro de energia');
    if (!res.exit1) missing.push('rota de saída principal');
    if (!res.meet) missing.push('ponto de encontro fora de casa');
    if (missing.length) out.alerts.push({ level: 'moderado', text: `Falta registrar: ${missing.join(', ')}. Em emergência, ninguém lembra onde fica.` });

    // Pessoas
    for (const p of people) {
      if (p.mobility) out.alerts.push({ level: 'moderado', text: `${p.name || 'Uma pessoa'} tem mobilidade reduzida: defina quem ajuda na saída e com qual equipamento.` });
    }
    if (people.some((p) => stage(p.mo) === 'lactente' && p.mo < 3)) out.alerts.push({ level: 'alto', text: 'Bebê com menos de 3 meses: febre de 38 °C ou mais é motivo de atendimento imediato. Tenha o pronto-socorro pediátrico definido.' });

    return out;
  }

  const api = { PET_SPECIES, compute, ageMonths, stage, fmtAge, waterPerDay, kcalPerDay, diapersPerDay, diaperSize, petFood, cash, FOOD };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PLAN = api;
})(typeof self !== 'undefined' ? self : this);
