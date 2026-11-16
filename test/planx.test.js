const PLAN = require('../plan.js'); global.PLAN = PLAN;
const X = require('../planx.js');
const today = new Date(2026,10,16);
const h = { horizon:14, scenarios:['apagao','chuva','invasao','barragem'], alertLevel:'laranja',
  people:[{name:'Gustavo',sex:'m',birth:'1988-06-15'},{name:'Mãe',sex:'f',birth:'1990-03-02',lactating:true},{name:'Filha',birth:'2026-09-03',feeding:'peito'},{name:'Filho',birth:'2025-07-20'}],
  pets:[{species:'cao',name:'Rex',weight:15}], hasVehicle:true, vehicles:[{type:'suv',model:'SW4',fuel:'diesel',armored:'sim',drive:'4x4',tank:80,kmPerL:9}],
  properties:[{name:'Apto',type:'apto',use:'principal',analysis:{findings:[{level:'moderado',title:'Barragem a 5,3 km'},{level:'moderado',title:'Indústria química a 2,1 km'}]}},{name:'Sítio',type:'sitio',use:'secundaria'}],
  comms:{bridgeName:'Tio',bridgePhone:'11 9999',meetLocal:'Praça',meetFar:''}, roles:{criancas:'Mãe',veiculo:'Gustavo'},
  reviews:{mensal:'2026-10-01'}, inventory:[{name:'Atum',qty:10,expiry:'2026-11-01'},{name:'Arroz',qty:5,expiry:'2026-12-01'},{name:'Pilhas',qty:20}], money:{monthly:7000} };
const out = PLAN.compute(h, today); const x = X.extend(h, out, today);
console.log('current', x.current.label, x.current.actions[0]);
console.log('sections', x.sections.map(s=>s.title));
console.log('timeline rows', x.timeline.rows.length, x.timeline.rows.slice(0,3));
console.log('reviews', x.reviews.map(r=>r.text.slice(0,30)+' | '+r.status));
console.log('inventory', x.inventory.map(i=>i.name+' '+i.status));
console.log('suggested', x.suggested);
console.log('totals', x.totals.byPri.map(x.totals.brl), x.totals.brl(x.totals.all));
console.log('alerts', out.alerts.map(a=>a.level+': '+a.text.slice(0,70)));
const noPrice = out.shopping.filter(s=>!s.pri); if (noPrice.length) throw new Error('no pri '+noPrice.map(s=>s.item));
if (!x.suggested.includes('quimico') || x.suggested.includes('barragem')) throw new Error('suggest');
if (!/Sítio/.test(x.current.actions.join(' ') + JSON.stringify(x.sections.find(s=>s.title==='Níveis de alerta').rows))) throw new Error('dest');
