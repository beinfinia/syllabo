import { createPlanPDF } from './pdf.js';
const panel=document.getElementById('offlinePanel');
const list=document.getElementById('offlineList');
const status=document.getElementById('offlineStatus');
function database(){return new Promise((resolve,reject)=>{
  const request=indexedDB.open('syllabo-pdf-device',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('pdfs',{keyPath:'id'});
  request.onsuccess=()=>resolve(request.result); request.onerror=()=>reject(request.error);
});}
async function transaction(mode, action){
  const db=await database();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('pdfs',mode),request=action(tx.objectStore('pdfs'));
    tx.oncomplete=()=>resolve(request.result); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error);
  });}finally{db.close();}
}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
window.syllaboSavePDF=async(text,meta)=>{
  const blob=createPlanPDF(text);
  const name=`Plan_${(meta.subject||'clase').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'_').slice(0,50)}_${meta.date||'sin_fecha'}.pdf`;
  const id=meta.id||crypto.randomUUID();
  await transaction('readwrite',store=>store.put({id,name,blob,subject:meta.subject,date:meta.date,saved:Date.now()}));
  download(blob,name); return id;
};
async function render(){
  list.replaceChildren();
  try{
    const rows=await transaction('readonly',store=>store.getAll());
    rows.sort((a,b)=>b.saved-a.saved);
    status.textContent=rows.length?`${rows.length} PDF guardados en este teléfono.`:'Todavía no guardaste PDF en este teléfono. Abrí un plan y pulsá «Guardar PDF en mi teléfono».';
    for(const row of rows){
      const item=document.createElement('article');item.className='item offline-item';
      const title=document.createElement('h3');title.textContent=row.subject||'Plan de clase';
      const date=document.createElement('p');date.textContent=row.date?new Date(row.date+'T12:00:00').toLocaleDateString('es-NI',{day:'numeric',month:'long',year:'numeric'}):'Sin fecha';
      const actions=document.createElement('div');actions.className='row';
      const open=document.createElement('button');open.className='primary';open.textContent='Abrir PDF';
      open.onclick=()=>{const url=URL.createObjectURL(row.blob);const win=window.open(url,'_blank');if(!win)download(row.blob,row.name);setTimeout(()=>URL.revokeObjectURL(url),300000);};
      const save=document.createElement('button');save.className='soft-btn';save.textContent='Descargar';save.onclick=()=>download(row.blob,row.name);
      const remove=document.createElement('button');remove.className='text-btn';remove.textContent='Quitar del teléfono';remove.onclick=async()=>{try{await transaction('readwrite',store=>store.delete(row.id));await render();}catch{status.textContent='No se pudo quitar la copia. Intentá de nuevo.';}};
      actions.append(open,save,remove);item.append(title,date,actions);list.append(item);
    }
  }catch{status.textContent='No se pudo acceder a las copias del teléfono. Revisá si tu navegador permite almacenamiento local.';}
}
document.querySelectorAll('[data-open-offline]').forEach(button=>button.addEventListener('click',async()=>{panel.hidden=false;await render();document.getElementById('closeOffline').focus();}));
document.getElementById('closeOffline').onclick=()=>{panel.hidden=true;document.querySelector('[data-open-offline]')?.focus();};
document.addEventListener('keydown',event=>{if(event.key==='Escape')panel.hidden=true;});
document.getElementById('clearOffline').onclick=async()=>{if(!confirm('¿Quitar todos los PDF guardados dentro de Syllabo en este teléfono? Los planes de tu cuenta y las descargas no se borran.'))return;try{await transaction('readwrite',store=>store.clear());await render();}catch{status.textContent='No se pudieron quitar las copias.';}};
const connection=document.getElementById('connectionStatus');
function updateConnection(){connection.textContent=navigator.onLine?'Tus PDF también pueden acompañarte sin internet.':'Sin conexión: podés abrir los PDF guardados en este teléfono.';document.getElementById('generatePlan').disabled=!navigator.onLine;}
window.addEventListener('online',updateConnection);window.addEventListener('offline',updateConnection);updateConnection();
if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').then(async registration=>{
  await navigator.serviceWorker.ready;
  if(registration.active)connection.textContent=navigator.onLine?'Acceso sin internet preparado. Guardá tus PDF en este teléfono.':connection.textContent;
}).catch(()=>{connection.textContent='Para asegurar el acceso sin internet, descargá tus PDF en el teléfono.';});
