const P = require('../plan.js');
const h = { horizon: 14,
  people: [{name:'Pai',sex:'m',birth:'1988-01'},{name:'Mãe',sex:'f',birth:'1990-01',lactating:true},{name:'Filha',birth:'2026-09',feeding:'peito'},{name:'Filho',birth:'2025-07'}],
  pets: [{species:'cao',name:'Cão',weight:15}],
  meds: [{name:'Remédio X',controlled:true,perDay:1,stock:10,unit:'comprimidos'},{name:'Vitamina',perDay:1,stock:5}],
  vehicle: {has:true,armored:true,tank:60,kmPerL:7},
  residence: {type:'apto',bedrooms:3,waterTank:1000,gas:'encanado',lock:'comum'},
  money: {monthly: 4500} };
const out = P.compute(h, new Date(2026,10,15));
for (const s of out.sections) { console.log('##', s.title, '—', s.lead); s.rows.forEach(r=>console.log('  ', r[0], '|', r[1])); }
console.log('ALERTS', out.alerts.map(a=>a.level+': '+a.text.slice(0,80)));
console.log('SHOPPING', out.shopping.length);
if (out.people[2].mo !== 2 || out.people[3].mo !== 16) throw new Error('age calc');
