const P = require('../plan.js');
const h = { horizon: 14,
  people: [{name:'Pai',sex:'m',birth:'1988-01-10',usesMeds:true,meds:[{name:'Remédio X',controlled:true,perDay:1,stock:10,unit:'comprimidos'}]},
           {name:'Mãe',sex:'f',birth:'1990-01-10',lactating:true,usesMeds:false,meds:[{name:'Ignorado',perDay:1,stock:0}]},
           {name:'Filha',birth:'2026-09-03',feeding:'peito'},{name:'Filho',birth:'2025-07-20'}],
  pets: [{species:'cao',name:'Rex',weight:15,usesMeds:true,meds:[{name:'Antipulgas',perDay:0.04,stock:0,unit:'doses'}]}],
  vehicle: {has:true,armored:true,tank:60,kmPerL:7},
  residence: {type:'apto',bedrooms:3,waterTank:1000,gas:'encanado',lock:'comum'},
  money: {monthly: 4500} };
const out = P.compute(h, new Date(2026,10,16));
const med = out.sections.find(s=>s.title==='Medicação');
console.log(med.rows);
console.log(out.shopping.filter(x=>x.cat==='Medicação'));
console.log(out.alerts.filter(a=>/Remédio/.test(a.text)).length, out.sections.find(s=>s.title.startsWith('Ficha')).rows[0]);
if (med.rows.some(r=>/Ignorado/.test(r[0]))) throw new Error('flag off should hide meds');
if (out.people[2].mo !== 2 || out.people[3].mo !== 15) throw new Error('age calc ' + out.people[2].mo + ' ' + out.people[3].mo);
