(function(){
'use strict';
const $=id=>document.getElementById(id);
const status=$('status'), list=$('list'), details=$('details'), nearby=$('nearby'), stats=$('stats');
let map, allLayer, selectedLayer, importedLayer, attrLayer, planLayer, meMarker;
let routes=[], features=[], attractions=[], currentPos=null, selectedFeature=null;
let baseRoutes=[], baseFeatures=[];
function msg(t){ if(status) status.textContent=t; }
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function hav(a,b){const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180; const la1=a[0]*Math.PI/180, la2=b[0]*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(x));}
function distCoords(coords){let d=0; for(let i=1;i<coords.length;i++) d+=hav([coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]); return d;}
function mapyLink(lat,lon,z=14){return `https://mapy.cz/turisticka?x=${lon}&y=${lat}&z=${z}`;}
function sampleWaypoints(coords, max=15){
 const inner=coords.slice(1,-1); if(inner.length<=max) return inner;
 const out=[]; for(let i=1;i<=max;i++){ out.push(inner[Math.floor(i*(inner.length-1)/(max+1))]); }
 return out;
}
function mapyRouteLinkFromCoords(coords, navigate=false){
 if(!coords || coords.length<2) return 'https://mapy.cz/';
 const start=coords[0], end=coords[coords.length-1];
 const wp=sampleWaypoints(coords,15).map(c=>`${c[0]},${c[1]}`).join(';');
 const u=new URL('https://mapy.com/fnc/v1/route');
 u.searchParams.set('mapset','outdoor');
 u.searchParams.set('start', `${start[0]},${start[1]}`);
 u.searchParams.set('end', `${end[0]},${end[1]}`);
 u.searchParams.set('routeType','bike_road');
 if(wp) u.searchParams.set('waypoints', wp);
 if(navigate) u.searchParams.set('navigate','true');
 return u.toString();
}
function waypointsText(coords){ return sampleWaypoints(coords,15).map((c,i)=>`${i+1}. ${c[1].toFixed(6)}, ${c[0].toFixed(6)}`).join('\n'); }
function fitFeature(f){try{const latlngs=f.geometry.coordinates.map(c=>[c[1],c[0]]); map.fitBounds(L.latLngBounds(latlngs),{padding:[25,25]});}catch(e){}}
function featureById(id){return features.find(f=>String(f.properties.id)===String(id));}
function routeMeta(f){let p=f.properties||{}; return routes.find(r=>String(r.id)===String(p.id)) || {id:p.id,name:p.name,distance_km:p.distance_km,points_count:p.points_count,type:p.type};}
function initMap(){
 map=L.map('map',{zoomControl:true}).setView([51.96,20.14],8);
 L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
 allLayer=L.geoJSON(null,{style:{color:'#3b8fe3',weight:3,opacity:.55}}).addTo(map);
 selectedLayer=L.geoJSON(null,{style:{color:'#d84a4a',weight:6,opacity:.95}}).addTo(map);
 importedLayer=L.geoJSON(null,{style:{color:'#7b3fe4',weight:4,opacity:.8}}).addTo(map);
 attrLayer=L.layerGroup().addTo(map);
 planLayer=L.layerGroup().addTo(map);
 const legend=L.control({position:'bottomright'}); legend.onAdd=()=>{const d=L.DomUtil.create('div','legend'); d.innerHTML='<div><i class="all"></i>wszystkie trasy</div><div><i class="sel"></i>wybrana</div><div><i class="att"></i>atrakcje</div>'; return d}; legend.addTo(map);
}
async function load(){
 initMap();
 try{
  const [cat,geo,att]=await Promise.all([fetch('routes_catalog.json?v=47').then(r=>r.json()),fetch('routes.geojson?v=47').then(r=>r.json()),fetch('attractions.json?v=47').then(r=>r.json())]);
  routes=cat; features=geo.features||[]; attractions=att||[]; baseRoutes=JSON.parse(JSON.stringify(routes)); baseFeatures=JSON.parse(JSON.stringify(features));
  loadImported();
  allLayer.addData({type:'FeatureCollection',features});
  showAttractions();
  render(); renderStats();
  if(features.length){map.fitBounds(allLayer.getBounds(),{padding:[10,10]});}
  msg(`Wczytano ${routes.length} tras. V4.7: planowanie rysuje trasę na mapie i wytycza w Mapy.cz.`);
 }catch(e){ console.error(e); msg('Błąd ładowania danych tras. Odśwież stronę lub wgraj ZIP ponownie.'); }
}
function getImported(){try{return JSON.parse(localStorage.getItem('adam_imported_routes_v4')||'[]')}catch(e){return []}}
function setImported(arr){try{localStorage.setItem('adam_imported_routes_v4',JSON.stringify(arr));}catch(e){alert('Pamięć telefonu pełna. Trasa nie została zapisana.');}}
function loadImported(){
 const arr=getImported();
 for(const f of arr){ if(!features.some(x=>String(x.properties.id)===String(f.properties.id))){features.push(f); routes.push({id:f.properties.id,name:f.properties.name,distance_km:f.properties.distance_km,points_count:f.properties.points_count,type:f.properties.type||'import'});} }
 if(importedLayer) importedLayer.clearLayers().addData({type:'FeatureCollection',features:arr});
}
function fmtMonth(key){
 if(!key || key==='brak daty') return 'Brak daty';
 const [y,m]=String(key).split('-');
 const names=['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
 const mi=Number(m)-1; return (names[mi]||m)+' '+y;
}
function renderStats(){
 const total=routes.reduce((s,r)=>s+(Number(r.distance_km)||0),0);
 const imp=getImported().length;
 const krótkie=routes.filter(r=>(r.distance_km||0)<50).length, sred=routes.filter(r=>(r.distance_km||0)>=50&&(r.distance_km||0)<100).length, dl=routes.filter(r=>(r.distance_km||0)>=100).length;
 const months={};
 routes.forEach(r=>{
   const key=r.month || (r.date?String(r.date).slice(0,7):'brak daty');
   if(!months[key]) months[key]={count:0,km:0,longest:null};
   months[key].count++;
   months[key].km += Number(r.distance_km)||0;
   if(!months[key].longest || (Number(r.distance_km)||0)>(Number(months[key].longest.distance_km)||0)) months[key].longest=r;
 });
 const rows=Object.entries(months).sort((a,b)=> b[0].localeCompare(a[0]));
 const maxKm=Math.max(1,...rows.map(([k,v])=>v.km));
 const best=rows.reduce((a,b)=>!a||b[1].km>a[1].km?b:a,null);
 stats.innerHTML=`
 <div class="row">
  <div class="stats-box"><div class="stats-title">${routes.length}</div><span class="mini">tras razem</span></div>
  <div class="stats-box"><div class="stats-title">${Math.round(total)} km</div><span class="mini">suma katalogu</span></div>
  <div class="stats-box"><div class="stats-title">${rows.length}</div><span class="mini">miesięcy jazdy</span></div>
  <div class="stats-box"><div class="stats-title">${imp}</div><span class="mini">import GPX</span></div>
 </div>
 <p class="mini">Krótkie: ${krótkie}, średnie: ${sred}, długie: ${dl}.${best?` Najwięcej km: <b>${fmtMonth(best[0])}</b> (${Math.round(best[1].km)} km).`:''}</p>
 <h3>Statystyki miesięczne</h3>
 <table class="month-table"><thead><tr><th>Miesiąc</th><th>Trasy</th><th>Km</th><th>Najdłuższa</th></tr></thead><tbody>
 ${rows.map(([key,v])=>`<tr><td>${fmtMonth(key)}<br><span class="bar" style="width:${Math.max(8,Math.round(v.km/maxKm*120))}px"></span></td><td>${v.count}</td><td><b>${Math.round(v.km)}</b></td><td>${v.longest?`${Math.round(v.longest.distance_km||0)} km<br><span class="mini">${esc(v.longest.name)}</span>`:''}</td></tr>`).join('')}
 </tbody></table>`;
}

function routeLink(r){
 const f=featureById(r.id);
 const coords=f?.geometry?.coordinates||[];
 return coords.length>=2 ? mapyRouteLinkFromCoords(coords) : startLink(r);
}

function render(){
 const q=($('search').value||'').toLowerCase().trim(); const f=$('filter').value;
 let arr=routes.filter(r=>(!f||r.type===f) && (!q || String(r.name).toLowerCase().includes(q)));
 list.innerHTML=`<p class="status">Wczytano <b>${routes.length}</b> tras. Pokazuję <b>${arr.length}</b>.</p>`+arr.map((r,i)=>`<div class="route"><h3>${i+1}. ${esc(r.name)}</h3><span class="tag">${Math.round(r.distance_km||0)} km</span><span class="tag">${esc(r.type||'trasa')}</span><p class="mini">Punkty GPS: ${r.points_count||0}</p><button data-show="${esc(r.id)}">Pokaż na mapie</button><button class="secondary" data-details="${esc(r.id)}">Szczegóły trasy</button><a class="btn" href="${routeLink(r)}" target="_blank" rel="noopener">Wytycz w Mapy.cz</a></div>`).join('');
}
function startLink(r){ const s=r.start; if(Array.isArray(s)) return mapyLink(s[0],s[1]); const ft=featureById(r.id); if(ft?.geometry?.coordinates?.[0]){let c=ft.geometry.coordinates[0]; return mapyLink(c[1],c[0]);} return 'https://mapy.cz/'; }
function selectRoute(id){
 const f=featureById(id); if(!f){msg('Nie znaleziono śladu trasy.'); return;}
 selectedFeature=f; selectedLayer.clearLayers().addData(f); fitFeature(f);
 const r=routeMeta(f); const coords=f.geometry.coordinates||[]; const start=coords[0], end=coords[coords.length-1];
 details.classList.remove('hidden');
 details.innerHTML=`<h2>🚴 ${esc(r.name)}</h2><p><span class="tag">${Math.round(r.distance_km||distCoords(coords))} km</span><span class="tag">${esc(r.type||'trasa')}</span><span class="tag">${coords.length} punktów</span></p><div class="grid"><a class="btn" target="_blank" href="${start?mapyLink(start[1],start[0]):'#'}">Start w Mapy.cz</a><a class="btn" target="_blank" href="${end?mapyLink(end[1],end[0]):'#'}">Meta w Mapy.cz</a><a class="btn primary" target="_blank" href="${mapyRouteLinkFromCoords(coords)}">Wytycz trasę w Mapy.cz</a><button id="btnCopyWp">Kopiuj punkty pośrednie</button><button id="btnExportGpx">Pobierz GPX</button></div><p class="mini">Wybrana trasa jest podświetlona na czerwono.</p>`;
 setTimeout(()=>{let b=$('btnExportGpx'); if(b) b.onclick=()=>downloadGPX(f); let cw=$('btnCopyWp'); if(cw) cw.onclick=()=>navigator.clipboard?.writeText(waypointsText(coords)).then(()=>alert('Skopiowano punkty pośrednie do Mapy.cz.')).catch(()=>alert(waypointsText(coords))); },0);
 msg('Pokazano wybraną trasę na mapie.');
 details.scrollIntoView({behavior:'smooth',block:'start'});
}
function showAttractions(){
 attrLayer.clearLayers(); attractions.forEach(a=>{ const m=L.circleMarker([a.lat,a.lon],{radius:8,color:'#28724f',fillColor:'#28724f',fillOpacity:.85}).bindPopup(`<b>${esc(a.name)}</b><br>${esc(a.type||'atrakcja')}<br>${esc(a.note||'')}`); attrLayer.addLayer(m); });
}
function showNearby(km){
 if(!currentPos){ alert('Najpierw kliknij „Gdzie jestem?” i pozwól na lokalizację.'); return; }
 const arr=attractions.map(a=>({...a,dist:hav(currentPos,[a.lat,a.lon])})).filter(a=>a.dist<=km).sort((a,b)=>a.dist-b.dist);
 nearby.classList.remove('hidden'); nearby.innerHTML=`<h2>📍 Atrakcje do ${km} km</h2>`+(arr.length?arr.map(a=>`<div class="route"><h3>${esc(a.name)}</h3><span class="tag">${a.dist.toFixed(1)} km</span><span class="tag">${esc(a.type||'atrakcja')}</span><p>${esc(a.note||'')}</p><a class="btn" target="_blank" href="${mapyLink(a.lat,a.lon)}">Otwórz w Mapy.cz</a></div>`).join(''):'<p>Brak atrakcji w tej odległości w obecnej bazie.</p>');
 nearby.scrollIntoView({behavior:'smooth'});
}
function locate(){
 if(!navigator.geolocation){alert('Telefon/przeglądarka nie obsługuje lokalizacji.');return;}
 msg('Pobieram lokalizację...');
 navigator.geolocation.getCurrentPosition(pos=>{currentPos=[pos.coords.latitude,pos.coords.longitude]; if(meMarker) map.removeLayer(meMarker); meMarker=L.marker(currentPos).addTo(map).bindPopup('Tu jesteś').openPopup(); map.setView(currentPos,13); msg('Lokalizacja ustawiona. Możesz sprawdzić atrakcje 5/10/20 km.');},err=>{alert('Nie udało się pobrać lokalizacji. Sprawdź zgodę w Chrome.'); msg('Brak zgody na lokalizację.');},{enableHighAccuracy:true,timeout:12000});
}

function normName(s){return String(s||'').toLowerCase().replace(/\.gpx$/,'').replace(/\s+/g,' ').trim();}
function trackFingerprint(f){
 const coords=f?.geometry?.coordinates||[]; if(coords.length<2) return '';
 const pick=[coords[0],coords[Math.floor(coords.length/2)],coords[coords.length-1]].filter(Boolean);
 const pts=pick.map(c=>`${Number(c[0]).toFixed(3)},${Number(c[1]).toFixed(3)}`).join('|');
 const d=Number(f?.properties?.distance_km)||distCoords(coords);
 return `${Math.round(d)}|${pts}`;
}
function buildDuplicateIndex(){
 const byName=new Map(), byTrack=new Map();
 for(const r of routes){ const nm=normName(r.name); if(nm) byName.set(nm,r); }
 for(const f of features){ const fp=trackFingerprint(f); if(fp) byTrack.set(fp,f); }
 return {byName,byTrack};
}
function findDuplicateFeature(f){
 const idx=buildDuplicateIndex();
 const nm=normName(f?.properties?.name); const fp=trackFingerprint(f);
 if(nm && idx.byName.has(nm)) return {kind:'nazwa', existing:idx.byName.get(nm)};
 if(fp && idx.byTrack.has(fp)) return {kind:'ślad', existing:routeMeta(idx.byTrack.get(fp))};
 return null;
}
function checkDuplicatesReport(){
 const seenNames=new Map(), seenTracks=new Map(), found=[];
 for(const f of features){
   const r=routeMeta(f), nm=normName(r.name), fp=trackFingerprint(f);
   if(nm && seenNames.has(nm)) found.push({name:r.name, reason:'taka sama nazwa jak: '+seenNames.get(nm).name}); else if(nm) seenNames.set(nm,r);
   if(fp && seenTracks.has(fp)) found.push({name:r.name, reason:'bardzo podobny ślad jak: '+seenTracks.get(fp).name}); else if(fp) seenTracks.set(fp,r);
 }
 const box=$('dups'); if(!box) return;
 box.classList.remove('hidden');
 box.innerHTML = found.length ? `<h3>⚠️ Podejrzane duplikaty</h3><p>Nic nie zostało usunięte automatycznie. To tylko raport.</p>${found.slice(0,50).map(x=>`<div class="route"><b>${esc(x.name)}</b><br><span class="mini">${esc(x.reason)}</span></div>`).join('')}${found.length>50?'<p>Pokazuję pierwsze 50.</p>':''}` : '<p class="status">Nie znaleziono duplikatów w obecnie widocznej liście.</p>';
 box.scrollIntoView({behavior:'smooth',block:'start'});
}
function restoreDefaults(){
 if(!confirm('Przywrócić domyślne 135 tras i usunąć tylko importy GPX zapisane w telefonie?')) return;
 localStorage.removeItem('adam_imported_routes_v4');
 routes=JSON.parse(JSON.stringify(baseRoutes));
 features=JSON.parse(JSON.stringify(baseFeatures));
 allLayer.clearLayers().addData({type:'FeatureCollection',features});
 selectedLayer.clearLayers(); if(importedLayer) importedLayer.clearLayers();
 details.classList.add('hidden'); nearby.classList.add('hidden');
 render(); renderStats(); if(allLayer.getBounds().isValid()) map.fitBounds(allLayer.getBounds(),{padding:[10,10]});
 msg('Przywrócono domyślne 135 tras. Importy GPX z telefonu zostały wyczyszczone.');
}

function parseGpx(text,name){
 const doc=new DOMParser().parseFromString(text,'application/xml'); let pts=[...doc.querySelectorAll('trkpt')].map(p=>[parseFloat(p.getAttribute('lon')),parseFloat(p.getAttribute('lat'))]).filter(c=>isFinite(c[0])&&isFinite(c[1]));
 if(pts.length<2) pts=[...doc.querySelectorAll('rtept,wpt')].map(p=>[parseFloat(p.getAttribute('lon')),parseFloat(p.getAttribute('lat'))]).filter(c=>isFinite(c[0])&&isFinite(c[1]));
 if(pts.length<2) throw new Error('Brak punktów GPX');
 const step=Math.max(1,Math.ceil(pts.length/1200)); const simp=pts.filter((_,i)=>i%step===0); if(JSON.stringify(simp[simp.length-1])!==JSON.stringify(pts[pts.length-1])) simp.push(pts[pts.length-1]);
 const id='imp_'+Date.now()+'_'+Math.random().toString(36).slice(2,6); const d=distCoords(simp); let type=d<50?'krótka':d<100?'średnia':'długa';
 return {type:'Feature',properties:{id,name:name.replace(/\.gpx$/i,'')||'Import GPX',distance_km:+d.toFixed(1),points_count:pts.length,type,imported:true,date:new Date().toISOString().slice(0,10),month:new Date().toISOString().slice(0,7)},geometry:{type:'LineString',coordinates:simp}};
}
async function importFiles(){
 const files=[...$('gpxFile').files]; if(!files.length){alert('Najpierw wybierz plik GPX.');return;}
 let arr=getImported(), ok=0, skipped=[];
 for(const file of files){
   try{
     const txt=await file.text();
     if(file.name.toLowerCase().endsWith('.json')){
       const data=JSON.parse(txt);
       if(Array.isArray(data.imported)){ setImported(data.imported); loadImported(); ok+=data.imported.length; continue; }
       if(Array.isArray(data.features)){ for(const bf of data.features){ if(!findDuplicateFeature(bf)){ features.push(bf); routes.push(routeMeta(bf)); ok++; } } continue; }
     }
     const f=parseGpx(txt,file.name);
     const dup=findDuplicateFeature(f);
     if(dup){ skipped.push(`${file.name} — duplikat (${dup.kind}), już jest: ${dup.existing?.name||'istniejąca trasa'}`); continue; }
     arr.push(f); features.push(f); routes.push({id:f.properties.id,name:f.properties.name,distance_km:f.properties.distance_km,points_count:f.properties.points_count,type:f.properties.type,date:f.properties.date,month:f.properties.month}); ok++;
   }catch(e){alert(`Nie udało się wczytać ${file.name}: ${e.message}`);}
 }
 setImported(arr);
 if(importedLayer) importedLayer.clearLayers().addData({type:'FeatureCollection',features:arr});
 allLayer.clearLayers().addData({type:'FeatureCollection',features});
 render(); renderStats();
 msg(`Dodano ${ok} nowych tras GPX. Pominięto ${skipped.length} duplikatów.`);
 if(skipped.length) alert('Pominięto duplikaty GPX:\n\n'+skipped.join('\n'));
}
function downloadGPX(f){
 const name=(f.properties.name||'trasa').replace(/[<>:"/\\|?*]+/g,'_');
 const pts=f.geometry.coordinates.map(c=>`<trkpt lat="${c[1]}" lon="${c[0]}"></trkpt>`).join('\n');
 const gpx=`<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Rowerowe Trasy Adama"><trk><name>${esc(name)}</name><trkseg>${pts}</trkseg></trk></gpx>`;
 const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([gpx],{type:'application/gpx+xml'})); a.download=name+'.gpx'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

const placeBook = [
 ['bogusławice 107b',51.6819,19.9339], ['boguslawice 107b',51.6819,19.9339], ['bogusławice',51.6819,19.9339], ['boguslawice',51.6819,19.9339],
 ['skierniewice konarskiego 1',51.9549,20.1580], ['konarskiego 1',51.9549,20.1580], ['skierniewice',51.9543,20.1583],
 ['jeżów',51.8136,19.9687], ['jezow',51.8136,19.9687], ['gzów',51.8970,20.0410], ['gzow',51.8970,20.0410],
 ['byczki',51.9320,20.0880], ['os. zadębie',51.9425,20.1260], ['zadębie',51.9425,20.1260], ['zadebie',51.9425,20.1260],
 ['wolbórz',51.5010,19.8308], ['wolborz',51.5010,19.8308], ['żelechlinek',51.7136,20.0324], ['zelechlinek',51.7136,20.0324],
 ['rogów',51.8175,19.8864], ['rogow',51.8175,19.8864], ['głuchów',51.7793,20.0766], ['gluchow',51.7793,20.0766],
 ['łyszkowice',51.9850,19.9107], ['lyszkowice',51.9850,19.9107], ['maków',51.9467,20.0523], ['makow',51.9467,20.0523],
 ['bolimów',52.0769,20.1630], ['bolimow',52.0769,20.1630], ['nieborów',52.0772,20.0683], ['nieborow',52.0772,20.0683],
 ['arkadia',52.0744,20.0088], ['puszcza mariańska',51.9798,20.3500], ['puszcza marianska',51.9798,20.3500]
];
function normalizePlace(s){return String(s||'').toLowerCase().replace(/[.,]/g,' ').replace(/\s+/g,' ').trim();}
function findPlaceCoord(name){
 const n=normalizePlace(name);
 if(!n) return null;
 let hit=placeBook.find(p=>n===p[0] || n.includes(p[0]) || p[0].includes(n));
 return hit ? [hit[2],hit[1],hit[0]] : null; // lon, lat, label
}
function planFeatureFromNames(names){
 const coords=[], missing=[];
 names.forEach(name=>{ const c=findPlaceCoord(name); if(c) coords.push([c[0],c[1]]); else missing.push(name); });
 if(coords.length<2) return {feature:null, missing};
 return {feature:{type:'Feature',properties:{id:'planned_'+Date.now(),name:'Planowana trasa',distance_km:+distCoords(coords).toFixed(1),type:'plan'},geometry:{type:'LineString',coordinates:coords}}, missing};
}

function makePlan(){
 const start=$('planStart').value.trim(), end=$('planEnd').value.trim(), dist=$('planDist').value, via=$('planVia').value.trim();
 const stops=via?via.split(/→|,|;/).map(x=>x.trim()).filter(Boolean):['Jeżów','Gzów','Byczki','Os. Zadębie'];
 const names=[start,...stops,end];
 const text=names.join(' → ');
 const planned=planFeatureFromNames(names);
 let routeUrl='https://mapy.cz/';
 let mapMsg='Nie udało się narysować trasy, bo nie rozpoznano co najmniej dwóch miejsc. Dopisz miejscowości w prostszej formie, np. Jeżów, Gzów, Byczki.';
 if(planned.feature){
   if(planLayer) planLayer.clearLayers();
   planLayer.addLayer(L.geoJSON(planned.feature,{style:{color:'#ff7a00',weight:7,opacity:.95,dashArray:'8 6'}}));
   const b=L.geoJSON(planned.feature).getBounds(); if(b.isValid()) map.fitBounds(b,{padding:[35,35]});
   selectedLayer.clearLayers().addData(planned.feature);
   routeUrl=mapyRouteLinkFromCoords(planned.feature.geometry.coordinates);
   mapMsg=`Planowana trasa została narysowana na mapie. Szacunkowo po punktach: ${planned.feature.properties.distance_km} km.`;
   selectedFeature=planned.feature;
 }
 $('planOut').classList.remove('hidden'); $('planOut').innerHTML=`<h3>Szkic trasy ${esc(dist)}</h3><p><b>Kolejność:</b></p><p>${esc(text)}</p><p class="status">${esc(mapMsg)}</p>${planned.missing.length?`<p class="mini">Nie rozpoznano miejsc: ${esc(planned.missing.join(', '))}. Te punkty nie zostały narysowane na mapie.</p>`:''}<div class="grid"><button id="copyPlan">Kopiuj kolejność</button><a class="btn primary" target="_blank" href="${routeUrl}">Wytycz w Mapy.cz</a>${planned.feature?'<button id="downloadPlanGpx">Pobierz GPX planu</button>':''}</div><p class="mini">To jest szkic po punktach pośrednich. W Mapy.cz sprawdź dokładny przebieg dróg przed jazdą.</p>`;
 setTimeout(()=>{
   $('copyPlan').onclick=()=>navigator.clipboard?.writeText(text).then(()=>alert('Skopiowano punkty trasy.')).catch(()=>alert(text));
   const d=$('downloadPlanGpx'); if(d && planned.feature) d.onclick=()=>downloadGPX(planned.feature);
 },0);
 msg(planned.feature ? 'Narysowano plan trasy na mapie.' : 'Nie udało się narysować planu — wpisz znane miejscowości.');
}

function downloadBackup(){
 const data={version:'4.7',created:new Date().toISOString(),routes,features,imported:getImported()};
 const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); a.download='kopia_tras_adama_'+new Date().toISOString().slice(0,10)+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 msg('Pobrano kopię zapasową tras JSON.');
}

function bind(){
 $('btnLoc').onclick=locate; $('btnAll').onclick=()=>{selectedLayer.clearLayers(); if(allLayer.getBounds().isValid()) map.fitBounds(allLayer.getBounds(),{padding:[10,10]});}; $('btnClear').onclick=()=>{selectedLayer.clearLayers(); details.classList.add('hidden'); nearby.classList.add('hidden'); msg('Wyczyszczono wybór.');}; if($('btnRestore')) $('btnRestore').onclick=restoreDefaults; if($('btnBackup')) $('btnBackup').onclick=downloadBackup; if($('btnCheckDup')) $('btnCheckDup').onclick=checkDuplicatesReport;
 $('search').oninput=render; $('filter').onchange=render; $('btnImport').onclick=importFiles; $('btnPlan').onclick=makePlan;
 document.addEventListener('click',e=>{ const show=e.target.closest('[data-show]'); if(show) selectRoute(show.dataset.show); const det=e.target.closest('[data-details]'); if(det) selectRoute(det.dataset.details); const near=e.target.closest('[data-near]'); if(near) showNearby(Number(near.dataset.near)); });
 if('serviceWorker' in navigator) navigator.serviceWorker.register('sw-v47.js?v=47').catch(()=>{});
}
window.addEventListener('DOMContentLoaded',()=>{bind(); load();});
})();
