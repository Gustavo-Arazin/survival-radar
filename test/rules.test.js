const SR = require('../rules.js');
const o = {lat:-23.5614, lon:-46.6559};
const j = {elements:[
 {type:'node',id:1,lat:-23.5570,lon:-46.6620,tags:{amenity:'hospital',name:'Hospital A'}},
 {type:'way',id:2,center:{lat:-23.5500,lon:-46.6400},tags:{amenity:'clinic',name:'UPA Centro'}},
 {type:'node',id:3,lat:-23.5700,lon:-46.6500,tags:{amenity:'fire_station',name:'1º GB'}},
 {type:'node',id:4,lat:-23.5620,lon:-46.6550,tags:{amenity:'clinic',name:'Clínica Dermato'}},
 {type:'way',id:5,center:{lat:-23.58,lon:-46.66},tags:{industrial:'chemical',name:'Química X'}},
 {type:'way',id:6,geometry:[{lat:-23.5620,lon:-46.6600},{lat:-23.5620,lon:-46.6500}],tags:{man_made:'pipeline',substance:'gas',name:'Gasoduto'}},
 {type:'node',id:7,lat:-23.6266,lon:-46.6556,tags:{aeroway:'aerodrome',name:'Congonhas'}},
 {type:'way',id:8,center:{lat:-23.40,lon:-46.70},tags:{waterway:'dam',name:'Barragem Y'}},
 {type:'node',id:9,lat:-23.5570,lon:-46.6620,tags:{amenity:'hospital',name:'Hospital A'}},
]};
const items = SR.parseOverpass(j,o);
console.log(Object.fromEntries(Object.entries(items).map(([k,v])=>[k,v.map(x=>x.name+' '+SR.fmtDist(x.dist))])));
const ctx={items,radius:10000,elevation:{point:740,ring:[752,755,749,760,758,751,750,753]},profile:{adults:2,infants:1,kids:1,car:true}};
const ev=SR.evaluate(ctx); console.log(ev.overall); ev.findings.forEach(f=>console.log(f.level,'|',f.title));
const m={...ctx,name:'Casa',address:'Av. Paulista',lat:o.lat,lon:o.lon,ts:Date.now(),evaluation:ev,actions:SR.recommend(ctx,ev)};
console.log(SR.reportText(m).slice(0,900));
console.log('query len', SR.buildOverpassQuery(o.lat,o.lon,10000).length);
console.log('ring pt', SR.point(o.lat,o.lon,600,90), SR.fmtDist(SR.haversine(o,SR.point(o.lat,o.lon,600,90))));
// CNES e SGB
const o2 = { lat: -23.5614, lon: -46.6559 };
const cn = SR.fromCnes([[-23.557,-46.662,'Hospital Infantil X','11 1','Rua A',5,1|8|16,'111'],[-23.55,-46.64,'Upa Centro','','',73,1,'222'],[-23.2,-46.2,'Longe','','',5,0,'333'],[-23.56,-46.65,'Clínica','','',2,0,'444']], o2, 10000, {5:'Hospital geral',73:'Pronto atendimento'});
if (cn.hospital.length !== 1 || cn.emergency.length !== 1 || !cn.hospital[0].ped || !cn.hospital[0].h24) throw new Error('cnes');
const sq = [[-23.562,-46.657],[-23.562,-46.655],[-23.560,-46.655],[-23.560,-46.657],[-23.562,-46.657]];
const gr = SR.geoRiskFrom([['Muito alto','Deslizamento','Rua B','São Paulo-SP','SP_1',[sq]]], o2);
if (!gr.inside || gr.inside.grau !== 'Muito alto') throw new Error('sgb inside');
const gr2 = SR.geoRiskFrom([['Alto','Inundação','Rua C','SP','SP_2',[sq.map(([a,b])=>[a-0.003,b])]]], o2);
if (gr2.inside || !(gr2.nearest.dist > 100 && gr2.nearest.dist < 400)) throw new Error('sgb near ' + JSON.stringify(gr2.nearest && gr2.nearest.dist));
const ev2 = SR.evaluate({ items: { ...cn }, radius: 10000, geoRisk: gr, profile: { infants: 1, car: true } });
if (!ev2.findings.some(f => /setor de risco geológico/.test(f.title) && f.level === 'alto')) throw new Error('eval sgb');
if (!ev2.findings.some(f => /pediátrico/.test(f.title))) throw new Error('eval ped');
console.log('CNES/SGB OK', ev2.findings.map(f=>f.level+' '+f.title));
