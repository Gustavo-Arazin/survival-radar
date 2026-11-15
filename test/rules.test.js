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
