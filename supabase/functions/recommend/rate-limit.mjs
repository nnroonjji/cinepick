const LIMIT_CODES=new Set(['VISITOR_MINUTE_LIMIT','VISITOR_DAY_LIMIT','GLOBAL_DAY_LIMIT']);
const unavailable=()=>Error('Recommendation limiter unavailable');
function clientIp(req){
  // Only the managed ingress header. Never trust client-controlled X-Forwarded-For.
  const ip=req.headers.get('cf-connecting-ip')?.trim();
  if(!ip||!(/^[0-9a-fA-F:.]+$/).test(ip)) throw unavailable();
  if(ip.includes(':')){
    try{return new URL('http://['+ip+']/').hostname.toLowerCase();}catch{throw unavailable();}
  }
  const parts=ip.split('.');
  if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255)) throw unavailable();
  return parts.map(Number).join('.');
}
async function readResult(response){
  if(!response.ok||!response.body) throw unavailable();
  const reader=response.body.getReader(),chunks=[];let size=0;
  try{
    while(true){const {value,done}=await reader.read();if(done) break;size+=value.byteLength;if(size>4096){void reader.cancel().catch(()=>{});throw unavailable();}chunks.push(value);}
    const bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
    const result=JSON.parse(new TextDecoder().decode(bytes));
    if(!result||Array.isArray(result)) throw unavailable();
    if(result.allowed===true&&Object.keys(result).length===1) return {allowed:true};
    if(result.allowed===false&&LIMIT_CODES.has(result.code)&&Number.isInteger(result.retry_after)&&result.retry_after>0&&result.retry_after<=86400)
      return {allowed:false,code:result.code,retryAfter:result.retry_after};
    throw unavailable();
  }finally{reader.releaseLock();}
}
export function createRateLimiter({env,fetchImpl=fetch,timeoutMs=3000}){
  return async(req,{signal=req.signal}={})=>{
    if(signal.aborted||req.signal.aborted) throw unavailable();
    const ip=clientIp(req),url=env('SUPABASE_URL')?.replace(/\/$/,'');
    let serverKey;try{serverKey=JSON.parse(env('SUPABASE_SECRET_KEYS')||'{}').default;}catch{throw unavailable();}
    if(!url||typeof serverKey!=='string'||!serverKey.startsWith('sb_secret_')) throw unavailable();
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(serverKey),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    const signed=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode('cinepick:recommend-limits:v1:'+ip));
    const visitor=Array.from(new Uint8Array(signed),value=>value.toString(16).padStart(2,'0')).join('');
    const controller=new AbortController();let timer,stop;
    const stopped=new Promise((_,reject)=>{
      stop=()=>{reject(unavailable());controller.abort();};
      signal.addEventListener('abort',stop,{once:true});timer=setTimeout(stop,timeoutMs);
      if(signal.aborted) stop();
    });
    try{
      const work=async()=>{
        if(controller.signal.aborted) throw unavailable();
        const response=await fetchImpl(url+'/rest/v1/rpc/cp_take_recommendation_slot',{
          method:'POST',headers:{apikey:serverKey,'Content-Type':'application/json'},
          body:JSON.stringify({p_visitor_hash:visitor}),signal:controller.signal
        });
        return readResult(response);
      };
      return await Promise.race([work(),stopped]);
    }finally{clearTimeout(timer);signal.removeEventListener('abort',stop);}
  };
}
