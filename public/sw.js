const CACHE='syllabo-shell-v4';
const ASSETS=['./','./index.html','./offline.js','./pdf.js','./mobile.css','./manifest.webmanifest','./logo.svg','./app.js','./ui.js',
  ...['avatar-man','avatar-woman','book','calendar','check','clock','create','eye-off','eye','home','mic','plus','sparkle','user'].map(name=>'./icons/'+name+'.svg')];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('syllabo-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin)return;
  // Cache public shell files only; account and API data remain outside this cache.
  if(event.request.mode==='navigate'){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE);
      try{
        const response=await fetch(event.request);
        if(response.ok&&response.headers.get('content-type')?.includes('text/html')){
          await cache.put('./index.html',response.clone());
          return response;
        }
        return (await cache.match('./index.html'))||response;
      }catch{
        return (await cache.match('./index.html'))||new Response('Abrí Syllabo con internet una vez para preparar el acceso sin conexión.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8'}});
      }
    })());return;
  }
  const assetKey=ASSETS.find(asset=>new URL(asset,self.location.href).pathname===url.pathname);
  if(!assetKey)return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    try{
      const response=await fetch(event.request);
      if(response.ok){await cache.put(assetKey,response.clone());return response;}
      return (await cache.match(assetKey))||response;
    }catch{
      return (await cache.match(assetKey))||Response.error();
    }
  })());
});
