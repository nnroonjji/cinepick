// 줄글 추천의 비동기 경계. reco.js 뒤, app.js 앞에서 로드. AI 키는 서버에만 둠.
const TextReco=(()=>{
  const LIMIT=3;
  const payloadOf=state=>({text:state.text,candidates:candidates(state,'text').map(m=>{
    const info=SCREENINGS[m.t]; return {code:info.code,title:m.t,plot:info.plot||'',genre:info.genre||''};
  })});
  const keyOf=state=>JSON.stringify([state.text,state.price,state.picked,state.disc]);
  function normalize(rows,pool){
    if(!Array.isArray(rows)) throw Error('Invalid recommendation response');
    const allowed=new Set(pool.map(m=>m.code)),seen=new Set(),out=[];
    for(const row of rows){
      if(!row||!allowed.has(row.code)||seen.has(row.code)||typeof row.reason!=='string'||!row.reason.trim()) continue;
      seen.add(row.code); out.push({code:row.code,reason:row.reason.trim()}); if(out.length===LIMIT) break;
    }
    return out;
  }
  function results(state){
    return state.textReco?.status==='success'?normalize(state.textReco.items,payloadOf(state).candidates):[];
  }
  function recommendation(state){
    const list=results(state); if(!list.length) return null;
    const row=list[Math.min(state.idx.text||0,list.length-1)];
    const mv=NOW.find(m=>SCREENINGS[m.t].code===row.code);
    // 저장된 회차의 가격도 믿지 않고 현재 상영표/할인으로 다시 계산함.
    const saved=state.shows.text,day=saved&&daysOf(mv.t).find(d=>d.d===saved.date);
    const slot=day?.s.find(s=>s[0]===saved.time&&s[1]===saved.theater&&s[2]===saved.hall);
    let sh=slot?mk(day,slot,mv.t):null;
    if(!sh||sh.price>state.price) sh=defaultShow(mv.t,state.price);
    if(!sh||sh.price>state.price) return null; // 맞춤 추천의 예산 밖 대체 회차 사용 금지
    state.shows.text=sh; return {mv,sh,why:row.reason};
  }
  // 기존 config.js의 공개 키만 전송. publishable 키는 JWT가 아니므로 Bearer에 넣지 않음.
  async function serverRequest(payload,{signal}){
    const url=typeof SUPABASE_URL==='string'?SUPABASE_URL.replace(/\/(rest\/v1\/?)?$/,''):'';
    const key=typeof SUPABASE_KEY==='string'?SUPABASE_KEY:'';
    let publicKey=key.startsWith('sb_publishable_');
    if(!publicKey){try{publicKey=JSON.parse(atob(key.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon';}catch{}}
    if(!url||!publicKey) throw Error('Recommendation server is not configured');
    const response=await fetch(url+'/functions/v1/recommend',{
      method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify(payload),signal
    });
    if(!response.ok){const error=Error('Recommendation request failed');if(response.status===504) error.code='timeout';throw error;}
    return response.json();
  }
  function create({request=serverRequest,timeoutMs=20000,onChange=()=>{}}={}){
    let serial=0,active;
    function cancel(state){
      serial++; active?.abort(); active=null;
      if(state.textReco?.status==='loading') state.textReco={status:'idle',items:[]};
    }
    async function run(state){
      cancel(state); const id=serial,key=keyOf(state),payload=payloadOf(state);
      if(!payload.candidates.length){state.textReco={status:'empty',items:[]}; onChange(); return;}
      const controller=new AbortController(); active=controller;
      state.textReco={status:'loading',items:[]}; onChange();
      let timer,abort;
      const stopped=new Promise((_,reject)=>{
        abort=()=>reject(Error('Aborted')); controller.signal.addEventListener('abort',abort,{once:true});
        timer=setTimeout(()=>{const error=Error('Recommendation timed out'); error.code='timeout'; reject(error); controller.abort();},timeoutMs);
      });
      try{
        const rows=await Promise.race([Promise.resolve().then(()=>request(payload,{signal:controller.signal})),stopped]);
        if(id!==serial) return;
        if(key!==keyOf(state)){state.textReco={status:'idle',items:[]}; return;}
        const items=normalize(normalize(rows,payload.candidates),payloadOf(state).candidates);
        if(!items.length) throw Error('No valid recommendations');
        state.textReco={status:'success',items}; state.idx.text=0; state.shows.text=null;
      }catch(error){
        if(id===serial) state.textReco={status:'error',items:[],error:error?.code==='timeout'?'timeout':'request'};
      }finally{
        clearTimeout(timer); controller.signal.removeEventListener('abort',abort);
        if(id===serial){active=null; onChange();}
      }
    }
    return {run,cancel};
  }
  return {create,results,recommend:recommendation};
})();
