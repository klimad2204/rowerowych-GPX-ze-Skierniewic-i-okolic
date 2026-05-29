(function(){
'use strict';
const $=id=>document.getElementById(id);
const status=$('status'), list=$('list'), details=$('details'), nearby=$('nearby'), stats=$('stats');
let map, allLayer, selectedLayer, importedLayer, attrLayer, planLayer, planMarkers, meMarker;
let routes=[], features=[], attractions=[], currentPos=null, selectedFeature=null;
let baseRoutes=[], baseFeatures=[];
function msg(t){ if(status) status.textContent=t; }
function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function hav(a,b){const R=6371, dLat=(b[0]-a[0])*Math.PI/180, dLon=(b[1]-a[1])*Math.PI/180; const la1=a[0]*Math.PI/180, la2=b[0]*Math.PI/180; const x=Math.sin(dLat/2)**2+Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2; return 2*R*Math.asin(Math.sqrt(x));}
function distCoords(coords){let d=0; for(let i=1;i<coords.length;i++) d+=hav([coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]); return d;}
function distPointToSegmentKm(p, a, b){
 // p/a/b jako [lat, lon]; szybkie przybliżenie wystarcza do listy atrakcji przy trasie
 const lat0=p[0]*Math.PI/180;
 const kx=111.320*Math.cos(lat0), ky=110.574;
 const px=p[1]*kx, py=p[0]*ky, ax=a[1]*kx, ay=a[0]*ky, bx=b[1]*kx, by=b[0]*ky;
 const dx=bx-ax, dy=by-ay;
 const t=(dx*dx+dy*dy) ? Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/(dx*dx+dy*dy))) : 0;
 const x=ax+t*dx, y=ay+t*dy;
 return Math.hypot(px-x, py-y);
}
function distToRouteKm(pointLatLon, coords){
 if(!coords || !coords.length) return Infinity;
 let best=Infinity;
 for(let i=1;i<coords.length;i++) best=Math.min(best, distPointToSegmentKm(pointLatLon,[coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]));
 return best;
}
function categoryIcon(type){
 const t=String(type||'').toLowerCase();
 if(t.includes('cmentarz')||t.includes('wojen')) return '🪖';
 if(t.includes('pomnik')||t.includes('mogi')) return '🗿';
 if(t.includes('pałac')||t.includes('dwór')||t.includes('zabytek')||t.includes('arch')) return '🏛️';
 if(t.includes('przyrod')||t.includes('park')||t.includes('zalew')||t.includes('rezerwat')) return '🌳';
 if(t.includes('kolej')) return '🚂';
 return '📍';
}
function routeAttractions(coords, radiusKm=4){
 return attractions.map(a=>({...a,distRoute:distToRouteKm([a.lat,a.lon],coords)})).filter(a=>a.distRoute<=radiusKm).sort((a,b)=>a.distRoute-b.distRoute || String(a.type).localeCompare(String(b.type)));
}
function renderRouteAttractions(coords, title='Ciekawostki i atrakcje przy trasie'){
 const box=document.getElementById('planAttractions') || nearby;
 if(!box || !coords || coords.length<2) return;
 let arr=routeAttractions(coords,10);
 if(!arr.length){ arr=attractions.map(a=>({...a,distRoute:distToRouteKm([a.lat,a.lon],coords)})).sort((a,b)=>a.distRoute-b.distRoute).slice(0,8); }
 box.classList.remove('hidden');
 if(!arr.length){ box.innerHTML=`<h2>🧭 ${esc(title)}</h2><p>W bazie nie ma jeszcze atrakcji przy tej trasie. Dodamy kolejne punkty do bazy albo wpisz trasę przez większe miejscowości.</p>`; return; }
 const groups={}; arr.forEach(a=>{const k=a.type||'inne'; (groups[k] ||= []).push(a);});
 box.innerHTML=`<h2>🧭 ${esc(title)}</h2><p class="hint">Pokazuję miejsca najbliżej wytyczonego śladu — zwykle do ok. 10 km, a gdy baza jest pusta w tym promieniu, najbliższe dostępne punkty. GPS traktuj jako punkt do sprawdzenia przed jazdą.</p>`+
 Object.entries(groups).map(([typ,items])=>`<h3>${categoryIcon(typ)} ${esc(typ)}</h3>`+items.map(a=>`<div class="route attraction-card"><h3>${categoryIcon(a.type)} ${esc(a.name)}</h3><span class="tag">${a.distRoute.toFixed(1)} km od trasy</span><span class="tag">${esc(a.type||'atrakcja')}</span><p>${esc(a.note||'')}</p>${a.orientation?`<p class="mini"><b>Punkt orientacyjny:</b> ${esc(a.orientation)}</p>`:''}<div class="grid"><a class="btn" target="_blank" href="${mapyLink(a.lat,a.lon)}">Pokaż w Mapy.cz</a><button data-copy-poi="${esc(a.name+' '+a.lat.toFixed(6)+','+a.lon.toFixed(6))}">Kopiuj GPS</button></div></div>`).join('')).join('');
}

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
 planMarkers=L.layerGroup().addTo(map);
 const legend=L.control({position:'bottomright'}); legend.onAdd=()=>{const d=L.DomUtil.create('div','legend'); d.innerHTML='<div><i class="all"></i>wszystkie trasy</div><div><i class="sel"></i>wybrana</div><div><i class="att"></i>atrakcje</div>'; return d}; legend.addTo(map);
}
async function load(){
 initMap();
 try{
  const [cat,geo,att]=await Promise.all([fetch('routes_catalog.json?v=61').then(r=>r.json()),fetch('routes.geojson?v=61').then(r=>r.json()),fetch('attractions.json?v=61').then(r=>r.json())]);
  routes=cat; features=geo.features||[]; attractions=att||[]; baseRoutes=JSON.parse(JSON.stringify(routes)); baseFeatures=JSON.parse(JSON.stringify(features));
  loadImported();
  allLayer.addData({type:'FeatureCollection',features});
  showAttractions();
  render(); renderStats();
  if(features.length){map.fitBounds(allLayer.getBounds(),{padding:[10,10]});}
  msg(`Wczytano ${routes.length} tras. V6.1: naprawiono rysowanie planu; atrakcje są dodawane jako punkty pośrednie trasy z możliwością usunięcia.`);
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
 renderRouteAttractions(coords,'Atrakcje przy wybranej trasie');
 msg('Pokazano wybraną trasę na mapie i wyszukano atrakcje przy trasie.');
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
 ['arkadia',52.0744,20.0088], ['puszcza mariańska',51.9798,20.3500], ['puszcza marianska',51.9798,20.3500],
 ['bartniki',52.0122,20.3432], ['radziwiłłów',52.0269,20.3520], ['radziwillow',52.0269,20.3520], ['miedniewice',52.0552,20.2097]
];
function normalizePlace(s){return String(s||'').toLowerCase().replace(/[.,]/g,' ').replace(/ł/g,'l').replace(/ó/g,'o').replace(/ą/g,'a').replace(/ę/g,'e').replace(/ś/g,'s').replace(/ć/g,'c').replace(/ń/g,'n').replace(/ż/g,'z').replace(/ź/g,'z').replace(/\s+/g,' ').trim();}
function findPlaceCoord(name){
 const n=normalizePlace(name);
 if(!n) return null;
 let hit=placeBook.find(p=>normalizePlace(p[0])===n || n.includes(normalizePlace(p[0])) || normalizePlace(p[0]).includes(n));
 return hit ? [hit[2],hit[1],hit[0]] : null; // lon, lat, label
}
function getViaValues(){ return [...document.querySelectorAll('.via-input')].map(i=>i.value.trim()).filter(Boolean); }
function getPlanNames(){ return [$('planStart').value.trim(), ...getViaValues(), $('planEnd').value.trim()].filter(Boolean); }
function renderViaRows(values){
 const box=$('viaList'); if(!box) return;
 box.innerHTML='';
 (values.length?values:['']).forEach((val,idx)=>{
   const row=document.createElement('div'); row.className='via-row';
   row.innerHTML=`<input class="via-input" placeholder="np. Puszcza Mariańska" value="${esc(val)}"><button type="button" data-up="${idx}">▲</button><button type="button" data-down="${idx}">▼</button><button type="button" data-del="${idx}" class="warn">Usuń</button>`;
   box.appendChild(row);
 });
 updatePlanOrder();
}
function updatePlanOrder(){
 const names=getPlanNames(); const out=$('planOrder'); if(!out) return;
 const lines=names.map((n,i)=>`${i+1}. ${n}`).join('\n');
 const coords=names.map(findPlaceCoord).filter(Boolean).map(c=>[c[0],c[1]]);
 let extra='';
 if(coords.length>=2) extra=`\n\nSzacowany dystans po punktach: ${distCoords(coords).toFixed(1)} km`;
 out.textContent=lines+extra;
}
function planFeatureFromNames(names){
 const coords=[], missing=[];
 names.forEach(name=>{ const c=findPlaceCoord(name); if(c) coords.push([c[0],c[1]]); else missing.push(name); });
 if(coords.length<2) return {feature:null, missing};
 return {feature:{type:'Feature',properties:{id:'planned_'+Date.now(),name:'Planowana trasa',distance_km:+distCoords(coords).toFixed(1),type:'plan'},geometry:{type:'LineString',coordinates:coords}}, missing};
}

function drawPlanMarkers(names, coords){
 if(!planMarkers) return;
 planMarkers.clearLayers();
 coords.forEach((c,i)=>{
   const label = i===0 ? 'START' : (i===coords.length-1 ? 'META' : 'PRZEZ '+i);
   const icon = i===0 ? '🟢' : (i===coords.length-1 ? '🔴' : '🟠');
   L.marker([c[1],c[0]]).addTo(planMarkers).bindPopup('<b>'+label+'</b><br>'+esc(names[i]||'punkt')+'<br>'+c[1].toFixed(6)+', '+c[0].toFixed(6));
 });
}
function openMapyRoute(coords, nav=false){
 const url=mapyRouteLinkFromCoords(coords, nav);
 window.open(url,'_blank');
}

function logicWarnings(names, coords){
 const warnings=[];
 const norm=names.map(normalizePlace);
 const seen=new Set(); norm.forEach(n=>{ if(n && seen.has(n)) warnings.push('Ten sam punkt występuje więcej niż raz: '+n); seen.add(n); });
 for(let i=2;i<coords.length;i++){
   const back=hav([coords[i-2][1],coords[i-2][0]],[coords[i][1],coords[i][0]]);
   const detour=hav([coords[i-2][1],coords[i-2][0]],[coords[i-1][1],coords[i-1][0]])+hav([coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]);
   if(detour>back*2.6 && detour-back>15) warnings.push(`Możliwe nielogiczne zawracanie przy punkcie ${names[i-1]}.`);
 }
 return [...new Set(warnings)];
}

function attractionId(a){ return normalizePlace((a.name||'')+'_'+Number(a.lat).toFixed(5)+'_'+Number(a.lon).toFixed(5)); }
function bestSegmentForPoi(poi, coords){
 let best={idx:1, d:Infinity, fromStart:0};
 for(let i=1;i<coords.length;i++){
   const d=distPointToSegmentKm([poi.lat,poi.lon],[coords[i-1][1],coords[i-1][0]],[coords[i][1],coords[i][0]]);
   const fs=hav([coords[i-1][1],coords[i-1][0]],[poi.lat,poi.lon]);
   if(d<best.d) best={idx:i,d,fromStart:fs};
 }
 return best;
}
function getSelectedPlanPoiIds(){
 const checked=[...document.querySelectorAll('.plan-poi-check:checked')].map(x=>x.value);
 return checked.length ? new Set(checked) : null;
}
function suggestedPoisForPlan(baseCoords){
 if(!baseCoords || baseCoords.length<2) return [];
 let arr=routeAttractions(baseCoords,7);
 if(!arr.length) arr=routeAttractions(baseCoords,12);
 return arr.slice(0,10).map(a=>({...a,_id:attractionId(a),_seg:bestSegmentForPoi(a,baseCoords)}));
}
function buildPlanWithAttractions(names, baseFeature){
 if(!baseFeature) return {feature:null, names};
 const baseCoords=baseFeature.geometry.coordinates||[];
 const selectedIds=getSelectedPlanPoiIds();
 let pois=suggestedPoisForPlan(baseCoords);
 if(selectedIds) pois=pois.filter(p=>selectedIds.has(p._id));
 const buckets={};
 pois.forEach(p=>{ const seg=p._seg?.idx||1; (buckets[seg] ||= []).push(p); });
 Object.values(buckets).forEach(list=>list.sort((a,b)=>(a._seg?.fromStart||0)-(b._seg?.fromStart||0)));
 const coords=[baseCoords[0]], outNames=[names[0]||'Start'];
 for(let i=1;i<baseCoords.length;i++){
   (buckets[i]||[]).forEach(p=>{ coords.push([p.lon,p.lat]); outNames.push('Atrakcja: '+p.name); });
   coords.push(baseCoords[i]); outNames.push(names[i]|| (i===baseCoords.length-1?'Meta':'Przez'));
 }
 const f={type:'Feature',properties:{id:'planned_'+Date.now(),name:'Planowana trasa z atrakcjami',distance_km:+distCoords(coords).toFixed(1),type:'plan'},geometry:{type:'LineString',coordinates:coords}};
 return {feature:f,names:outNames,pois};
}
function removePlanPoi(id){
 const cb=document.querySelector(`.plan-poi-check[value="${CSS.escape(id)}"]`);
 if(cb){ cb.checked=false; makePlan(); }
}
function renderSelectablePlanAttractions(names, baseFeature, plannedFeature){
 const box=$('planAttractions'); if(!box || !baseFeature){ return; }
 const baseCoords=baseFeature.geometry.coordinates||[];
 let pois=suggestedPoisForPlan(baseCoords);
 const selectedIds=getSelectedPlanPoiIds();
 if(selectedIds) pois=pois.map(p=>({...p,checked:selectedIds.has(p._id)})); else pois=pois.map(p=>({...p,checked:true}));
 box.classList.remove('hidden');
 if(!pois.length){
   box.innerHTML='<h2>🏛️ Atrakcje jako punkty trasy</h2><p>Nie znaleziono atrakcji blisko tej trasy w obecnej bazie. Trasa została wytyczona bez dodatkowych punktów turystycznych.</p>';
   return;
 }
 box.innerHTML='<h2>🏛️ Atrakcje uwzględnione na trasie</h2><p class="hint">Zaznaczone atrakcje są dodane jako punkty pośrednie między Start/Przez/Meta. Odznacz lub kliknij Usuń, a trasa przeliczy się bez tego punktu.</p>'+
 pois.map(p=>`<div class="route attraction-card"><label class="checkline"><input type="checkbox" class="plan-poi-check" value="${esc(p._id)}" ${p.checked?'checked':''}> <b>${categoryIcon(p.type)} ${esc(p.name)}</b></label><span class="tag">${(p._seg?.d??0).toFixed(1)} km od szkicu</span><span class="tag">${esc(p.type||'atrakcja')}</span><p>${esc(p.note||'')}</p><div class="grid"><button type="button" data-remove-poi="${esc(p._id)}" class="warn">Usuń z trasy</button><a class="btn" target="_blank" href="${mapyLink(p.lat,p.lon)}">Pokaż w Mapy.cz</a></div></div>`).join('')+
 '<p class="mini">Po zmianie zaznaczenia trasa na mapie i link Mapy.com aktualizują się automatycznie.</p>';
 box.querySelectorAll('.plan-poi-check').forEach(cb=>cb.addEventListener('change',()=>makePlan()));
 box.querySelectorAll('[data-remove-poi]').forEach(btn=>btn.addEventListener('click',()=>removePlanPoi(btn.dataset.removePoi)));
}

function makePlan(){
 const dist=$('planDist').value; const names=getPlanNames();
 const plannedBase=planFeatureFromNames(names);
 const planned = buildPlanWithAttractions(names, plannedBase.feature);
 planned.missing = plannedBase.missing || [];
 const text=(planned.names||names).join(' → ');
 let routeUrl='https://mapy.cz/';
 let mapMsg='Nie udało się narysować trasy, bo nie rozpoznano co najmniej dwóch miejsc. Dopisz miejscowości w prostszej formie, np. Puszcza Mariańska, Bartniki.';
 let warnHtml='';
 if(planned.feature){
   if(planLayer) planLayer.clearLayers();
   drawPlanMarkers(planned.names||names, planned.feature.geometry.coordinates);
   planLayer.addLayer(L.geoJSON(planned.feature,{style:{color:'#ff7a00',weight:7,opacity:.95,dashArray:'8 6'}}));
   setTimeout(()=>map && map.invalidateSize(),50);
   const b=L.geoJSON(planned.feature).getBounds(); if(b.isValid()) map.fitBounds(b,{padding:[35,35]});
   selectedLayer.clearLayers().addData(planned.feature);
   routeUrl=mapyRouteLinkFromCoords(planned.feature.geometry.coordinates);
   mapMsg=`Planowana trasa została narysowana na mapie. Szacunkowo po punktach: ${planned.feature.properties.distance_km} km.`;
   selectedFeature=planned.feature;
   renderSelectablePlanAttractions(names, plannedBase.feature, planned.feature);
   const warnings=logicWarnings(planned.names||names, planned.feature.geometry.coordinates);
   warnHtml=(warnings.length?`<div class="warnbox"><b>Uwaga:</b><br>${warnings.map(esc).join('<br>')}</div>`:'<div class="okbox">Kolejność wygląda logicznie: Start → Przez → Meta.</div>') + visitedWarningsForPlan(planned.feature.geometry.coordinates);
 }
 $('planOut').classList.remove('hidden'); $('planOut').innerHTML=`<h3>Szkic trasy ${esc(dist)}</h3><p><b>Kolejność:</b></p><p>${esc(text)}</p>${warnHtml}<p class="status">${esc(mapMsg)}</p>${planned.missing.length?`<p class="mini">Nie rozpoznano miejsc: ${esc(planned.missing.join(', '))}. Te punkty nie zostały narysowane na mapie.</p>`:''}<div class="grid"><button id="copyPlan">Kopiuj kolejność</button><a class="btn primary" target="_blank" href="${routeUrl}">Wytycz dokładnie w Mapy.com</a>${planned.feature?'<button id="openMapyNav">Otwórz nawigację Mapy.com</button><button id="downloadPlanGpx">Pobierz GPX planu</button><button id="finishPlan" class="warn">Nowa trasa / wyczyść pola</button>':''}</div><p class="mini">Na mapie aplikacji widzisz szkic po punktach. Dokładną trasę po drogach wytycza Mapy.com po kliknięciu przycisku. Meta zawsze jest ostatnia.</p>`;
 setTimeout(()=>{
   $('copyPlan').onclick=()=>navigator.clipboard?.writeText(text).then(()=>alert('Skopiowano punkty trasy.')).catch(()=>alert(text));
   const nav=$('openMapyNav'); if(nav && planned.feature) nav.onclick=()=>openMapyRoute(planned.feature.geometry.coordinates,true);
   const d=$('downloadPlanGpx'); if(d && planned.feature) d.onclick=()=>downloadGPX(planned.feature); const fp=$('finishPlan'); if(fp) fp.onclick=clearPlanForm;
 },0);
 msg(planned.feature ? 'Narysowano plan trasy na mapie.' : 'Nie udało się narysować planu — wpisz znane miejscowości.');
}
function initPlanner(){
 renderViaRows(['Puszcza Mariańska']);
 const add=$('btnAddVia'); if(add) add.onclick=()=>{ const vals=getViaValues(); vals.push(''); renderViaRows(vals); setTimeout(()=>{const inputs=document.querySelectorAll('.via-input'); inputs[inputs.length-1]?.focus();},0); };
 const prev=$('btnPreviewOrder'); if(prev) prev.onclick=updatePlanOrder;
 ['planStart','planEnd'].forEach(id=>{ const el=$(id); if(el) el.addEventListener('input',updatePlanOrder); });
 const list=$('viaList'); if(list){
   list.addEventListener('input',e=>{ if(e.target.classList.contains('via-input')) updatePlanOrder(); });
   list.addEventListener('click',e=>{
     const vals=[...document.querySelectorAll('.via-input')].map(i=>i.value);
     const up=e.target.closest('[data-up]'), down=e.target.closest('[data-down]'), del=e.target.closest('[data-del]');
     if(up){ const i=+up.dataset.up; if(i>0){ [vals[i-1],vals[i]]=[vals[i],vals[i-1]]; renderViaRows(vals); } }
     if(down){ const i=+down.dataset.down; if(i<vals.length-1){ [vals[i+1],vals[i]]=[vals[i],vals[i+1]]; renderViaRows(vals); } }
     if(del){ const i=+del.dataset.del; vals.splice(i,1); renderViaRows(vals); }
   });
 }
 updatePlanOrder();
}

function clearPlanForm(){
 if($('planStart')) $('planStart').value='';
 if($('planEnd')) $('planEnd').value='';
 renderViaRows([]);
 if(planLayer) planLayer.clearLayers();
 if(planMarkers) planMarkers.clearLayers();
 if(selectedLayer) selectedLayer.clearLayers();
 const po=$('planOut'); if(po){po.classList.add('hidden'); po.innerHTML='';}
 const pa=$('planAttractions'); if(pa){pa.classList.add('hidden'); pa.innerHTML='';}
 updatePlanOrder();
 msg('Wyczyszczono Start, Meta, punkty Przez i poprzedni szkic trasy.');
}
function newPlanAll(){
 clearPlanForm();
 details?.classList.add('hidden'); nearby?.classList.add('hidden');
 map?.setView([51.94,20.16],10);
}
function minDistToAllRoutes(lat,lon,limitFeatures=9999){
 let best=Infinity, count=0;
 for(const f of features){
   const coords=f.geometry?.coordinates||[]; if(coords.length<2) continue;
   const step=Math.max(1,Math.ceil(coords.length/80));
   let prev=null;
   for(let i=0;i<coords.length;i+=step){
     const c=coords[i];
     if(prev) best=Math.min(best, distPointToSegmentKm([lat,lon],[prev[1],prev[0]],[c[1],c[0]]));
     prev=c;
   }
   const last=coords[coords.length-1]; if(prev && last && prev!==last) best=Math.min(best, distPointToSegmentKm([lat,lon],[prev[1],prev[0]],[last[1],last[0]]));
   if(++count>limitFeatures) break;
 }
 return best;
}
function showUnvisited(){
 const box=$('unvisited'); if(!box) return;
 const arr=attractions.map(a=>({...a,distVisited:minDistToAllRoutes(a.lat,a.lon)})).filter(a=>isFinite(a.distVisited)).sort((a,b)=>b.distVisited-a.distVisited).slice(0,20);
 box.classList.remove('hidden');
 box.innerHTML='<h3>🗺️ Propozycje miejsc dalej od Twoich śladów</h3><p class="hint">To nie jest pełny routing po drogach, ale dobra podpowiedź, gdzie szukać nowych odcinków i atrakcji.</p>'+arr.map(a=>`<div class="route"><h3>${categoryIcon(a.type)} ${esc(a.name)}</h3><span class="tag">ok. ${a.distVisited.toFixed(1)} km od najbliższego śladu</span><span class="tag">${esc(a.type||'atrakcja')}</span><p>${esc(a.note||'')}</p><div class="grid"><a class="btn" target="_blank" href="${mapyLink(a.lat,a.lon)}">Pokaż w Mapy.cz</a><button data-add-unvisited="${esc(a.name)}">Dodaj jako Przez</button></div></div>`).join('');
 box.scrollIntoView({behavior:'smooth',block:'start'});
}
function addViaValue(v){ const vals=getViaValues(); vals.push(v); renderViaRows(vals); }
function showVisitedHeat(){
 if(!allLayer){return;}
 if(map.hasLayer(allLayer)){ map.removeLayer(allLayer); msg('Ukryto warstwę wszystkich przejechanych dróg.'); }
 else { allLayer.addTo(map); if(allLayer.getBounds().isValid()) map.fitBounds(allLayer.getBounds(),{padding:[10,10]}); msg('Pokazano wszystkie przejechane drogi.'); }
}
function windAdvice(){
 const out=$('windOut'); if(!out) return;
 const dir=$('windDir')?.value||'W';
 const names=getPlanNames(); const base=planFeatureFromNames(names);
 if(!base.feature){ out.textContent='Najpierw wpisz Start, Meta i ewentualne Przez, potem utwórz szkic trasy.'; return; }
 const coords=base.feature.geometry.coordinates; const s=coords[0], e=coords[coords.length-1];
 const dx=e[0]-s[0], dy=e[1]-s[1];
 const main = Math.abs(dx)>Math.abs(dy) ? (dx>0?'E':'W') : (dy>0?'N':'S');
 const opposite={N:'S',S:'N',E:'W',W:'E',NE:'SW',SW:'NE',NW:'SE',SE:'NW'};
 let txt='Główny kierunek planu: '+main+'. Wiatr z: '+dir+'. ';
 if(opposite[dir]===main) txt+='Na końcówce powinien bardziej pomagać.';
 else if(dir===main) txt+='Może przeszkadzać na końcówce; rozważ odwrócenie kolejności, jeżeli to pętla.';
 else txt+='Wpływ boczny/zmienny; sprawdź dokładną prognozę przed jazdą.';
 out.textContent=txt;
}
function visitedWarningsForPlan(coords){
 if(!coords || coords.length<2) return '';
 const msgs=[];
 for(let i=0;i<coords.length;i++){
   const d=minDistToAllRoutes(coords[i][1],coords[i][0],300);
   if(d<0.4) msgs.push(`Punkt ${i+1} leży blisko już przejechanych śladów (${d.toFixed(1)} km).`);
 }
 return msgs.length?`<div class="warnbox"><b>Analiza przejechanych dróg:</b><br>${[...new Set(msgs)].slice(0,6).map(esc).join('<br>')}</div>`:'<div class="okbox">Plan prowadzi przez punkty oddalone od części Twoich dotychczasowych śladów — może dać nowe odcinki.</div>';
}

function downloadBackup(){
 const data={version:'6.1',created:new Date().toISOString(),routes,features,imported:getImported()};
 const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})); a.download='kopia_tras_adama_'+new Date().toISOString().slice(0,10)+'.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
 msg('Pobrano kopię zapasową tras JSON.');
}

function bind(){
 $('btnLoc').onclick=locate; if($('btnNewPlan')) $('btnNewPlan').onclick=newPlanAll; if($('btnClearPlan')) $('btnClearPlan').onclick=clearPlanForm; if($('btnUnvisited')) $('btnUnvisited').onclick=showUnvisited; if($('btnVisitedHeat')) $('btnVisitedHeat').onclick=showVisitedHeat; if($('btnWind')) $('btnWind').onclick=windAdvice; $('btnAll').onclick=()=>{selectedLayer.clearLayers(); if(allLayer.getBounds().isValid()) map.fitBounds(allLayer.getBounds(),{padding:[10,10]});}; $('btnClear').onclick=()=>{selectedLayer.clearLayers(); if(planLayer) planLayer.clearLayers(); if(planMarkers) planMarkers.clearLayers(); details.classList.add('hidden'); nearby.classList.add('hidden'); const pa=$('planAttractions'); if(pa) pa.classList.add('hidden'); msg('Wyczyszczono wybór.');}; if($('btnRestore')) $('btnRestore').onclick=restoreDefaults; if($('btnBackup')) $('btnBackup').onclick=downloadBackup; if($('btnCheckDup')) $('btnCheckDup').onclick=checkDuplicatesReport;
 $('search').oninput=render; $('filter').onchange=render; $('btnImport').onclick=importFiles; initPlanner(); $('btnPlan').onclick=makePlan;
 document.addEventListener('click',e=>{ const show=e.target.closest('[data-show]'); if(show) selectRoute(show.dataset.show); const det=e.target.closest('[data-details]'); if(det) selectRoute(det.dataset.details); const near=e.target.closest('[data-near]'); if(near) showNearby(Number(near.dataset.near)); const cp=e.target.closest('[data-copy-poi]'); if(cp) navigator.clipboard?.writeText(cp.dataset.copyPoi).then(()=>alert('Skopiowano GPS.')).catch(()=>alert(cp.dataset.copyPoi)); const au=e.target.closest('[data-add-unvisited]'); if(au){addViaValue(au.dataset.addUnvisited); document.getElementById('planStart')?.scrollIntoView({behavior:'smooth'});} });
 if('serviceWorker' in navigator) navigator.serviceWorker.register('sw-v61.js?v=61').catch(()=>{});
}
window.addEventListener('DOMContentLoaded',()=>{bind(); load();});
})();
