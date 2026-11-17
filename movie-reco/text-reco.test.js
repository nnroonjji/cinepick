// 줄글 추천 계약: 고정 상영표로 검사하여 실제 날짜/자동 생성 데이터에 의존하지 않음.
module.exports=async function(){
  const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
  const c={URLSearchParams,location:{search:'?now=2026-11-14T10:00'},setTimeout,clearTimeout,AbortController,atob};
  const titles=['가','나','다','라'];
  c.SCREENINGS=Object.fromEntries(titles.map((t,i)=>[t,{code:String(i+1),plot:t+' 줄거리',genre:'드라마',poster:''}]));
  c.SHOWS=Object.fromEntries(titles.map((t,i)=>[t,[{d:'11.14',w:'토',s:[['12:00','극장','1관',[6000,8000,10000,20000][i],5,'2D','']]}]]));
  c.NOW_TAGS={'1':['drama'],'2':['drama'],'3':['drama'],'4':['drama']};
  c.TAGS={drama:'드라마'}; c.PICKS=[]; c.MOVIES=[];
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'reco.js'),'utf8'),c);
  const file=path.join(__dirname,'text-reco.js');
  if(fs.existsSync(file)) vm.runInContext(fs.readFileSync(file,'utf8'),c);
  assert.strictEqual(vm.runInContext('typeof TextReco',c),'object','비동기 줄글 추천 경계가 있어야 함');
  const T=vm.runInContext('TextReco',c), rec=vm.runInContext('recommend',c);
  const st=(price=10000)=>({price,text:'잔잔한 영화',picked:{},mbti:[],disc:{},method:'text',idx:{},shows:{}});
  const json=x=>JSON.parse(JSON.stringify(x));
  assert.strictEqual(rec(st()),null,'응답 전에는 기존 태그/예산 밖 대체 추천을 표시하지 않음');
  const state=st(); let payload;
  const client=T.create({request:async p=>{payload=p; return [{code:'3',reason:'세 번째를 먼저'},{code:'99',reason:'후보 밖'},{code:'3',reason:'중복'},{code:'4',reason:'예산 초과'},{code:'2',reason:'  두 번째  '},{code:'1',reason:''},null];}});
  const pending=client.run(state);
  assert.strictEqual(state.textReco.status,'loading','응답을 기다리는 동안 loading');
  await pending;
  assert.deepStrictEqual(json(payload),{text:'잔잔한 영화',candidates:[{code:'1',title:'가',plot:'가 줄거리',genre:'드라마'},{code:'2',title:'나',plot:'나 줄거리',genre:'드라마'},{code:'3',title:'다',plot:'다 줄거리',genre:'드라마'}]});
  assert.deepStrictEqual(json(T.results(state)),[{code:'3',reason:'세 번째를 먼저'},{code:'2',reason:'두 번째'}],'후보 밖·중복·빈 이유를 제거하고 응답 순서 유지');
  assert.strictEqual(rec(state).mv.t,'다'); assert.strictEqual(rec(state).why,'세 번째를 먼저');
  assert.strictEqual(rec(state).sh.price,10000);
  state.idx.text=1; assert.strictEqual(rec(state).mv.t,'나');
  state.shows.text={movie:'나',price:1,date:'11.13',time:'09:00',theater:'가짜',hall:'1관'};
  assert.strictEqual(rec(state).sh.price,8000,'저장된 회차도 실제 상영표와 대조');
  state.price=6000; assert.deepStrictEqual(json(T.results(state)),[],'예산 변경 후 자격을 잃은 결과 제거');
  assert.strictEqual(rec(state),null,'defaultShow의 예산 초과 대체 경로 금지');
  for(const [price,want] of [[5000,0],[6000,1],[8000,2],[10000,3]]){
    const s=st(price), service=T.create({request:async p=>p.candidates.map(x=>({code:x.code,reason:'이유'})).concat({code:'4',reason:'네 번째'})});
    await service.run(s);
    assert.strictEqual(T.results(s).length,want,price+'원 후보 수');
    assert.strictEqual(s.textReco.status,want?'success':'empty');
  }
  const empty=st(5000); await T.create({request:()=>{throw Error('0편이면 요청하면 안 됨');}}).run(empty);
  assert.strictEqual(empty.textReco.status,'empty');
  const capped=st(20000); await T.create({request:async()=>['4','2','1','3'].map(code=>({code,reason:'순서 '+code}))}).run(capped);
  assert.deepStrictEqual(json(T.results(capped)).map(x=>x.code),['4','2','1'],'유효 응답이 네 편이어도 처음 세 편만 유지');
  for(const response of [null,{},[],[{code:'99',reason:'없는 영화'}],[{code:'1',reason:42}]]){
    const s=st(); await T.create({request:async()=>response}).run(s);
    assert.strictEqual(s.textReco.status,'error','유효 후보는 있으나 응답이 잘못되면 재시도 안내');
  }
  let fail=true; const retry=st(), retryClient=T.create({request:async()=>{if(fail) throw Error('offline'); return [{code:'1',reason:'재시도 성공'}];}});
  await retryClient.run(retry); assert.strictEqual(retry.textReco.status,'error');
  fail=false; await retryClient.run(retry); assert.strictEqual(rec(retry).why,'재시도 성공');
  const rejected=st(); await T.create({request:()=>Promise.reject(null)}).run(rejected);
  assert.strictEqual(rejected.textReco.status,'error','Error 객체가 아닌 거절도 오류 화면으로 복구');
  const slow=st(); await T.create({request:()=>new Promise(()=>{}),timeoutMs:5}).run(slow);
  assert.strictEqual(slow.textReco.status,'error'); assert.strictEqual(slow.textReco.error,'timeout');
  let resolveOld,resolveNew; const race=st(), racing=T.create({request:p=>new Promise(resolve=>{if(p.text==='새 요청') resolveNew=resolve; else resolveOld=resolve;})});
  const old=racing.run(race); await Promise.resolve(); race.text='새 요청'; const fresh=racing.run(race); await Promise.resolve();
  resolveNew([{code:'2',reason:'새 응답'}]); await fresh; resolveOld([{code:'1',reason:'옛 응답'}]); await old;
  assert.strictEqual(rec(race).why,'새 응답','늦은 이전 응답이 새 결과를 덮어쓰지 않음');
  const cancelled=st(), cancelling=T.create({request:()=>new Promise(()=>{})});
  const waiting=cancelling.run(cancelled); cancelling.cancel(cancelled); await waiting;
  assert.strictEqual(cancelled.textReco.status,'idle'); assert.strictEqual(rec(cancelled),null);
  let resolveBudget; const changed=st(), changing=T.create({request:()=>new Promise(resolve=>resolveBudget=resolve)});
  const inFlight=changing.run(changed); await Promise.resolve(); changed.price=5000;
  resolveBudget([{code:'3',reason:'변경 전 응답'}]); await inFlight;
  assert.notStrictEqual(changed.textReco.status,'success','요청 중 조건이 바뀌면 이전 응답 폐기');
  const html=st(); await T.create({request:async()=>[{code:'1',reason:'<img src=x onerror=alert(1)>'}]}).run(html);
  assert.strictEqual(rec(html).why,'<img src=x onerror=alert(1)>','화면에서 textContent로 표시할 원문 유지');

  // 기본 경로는 모의 함수 대신 실제 Supabase HTTP 요청이어야 함.
  c.SUPABASE_URL='https://project.supabase.co/rest/v1/'; c.SUPABASE_KEY='sb_publishable_test';
  let sent;
  c.fetch=async(url,options)=>{sent={url,...options}; return Response.json([{code:'2',reason:'서버 응답'}]);};
  c.location.search='?now=2026-11-14T10:00&textReco=error'; // 예전 테스트용 URL로 실제 동작을 바꿀 수 없음.
  const remote=st(); await T.create().run(remote);
  assert.strictEqual(remote.textReco.status,'success','기본 요청으로 서버 응답을 표시');
  assert(sent,'기본 요청은 fetch를 호출해야 함');
  assert.strictEqual(sent.url,'https://project.supabase.co/functions/v1/recommend');
  assert.strictEqual(sent.method,'POST');
  assert.deepStrictEqual(json(sent.headers),{apikey:'sb_publishable_test','Content-Type':'application/json'});
  assert(!('Authorization' in sent.headers),'publishable 키를 JWT Bearer로 보내지 않음');
  assert.deepStrictEqual(JSON.parse(sent.body),json(payload));
  assert(sent.signal instanceof AbortSignal);
  assert.strictEqual(rec(remote).why,'서버 응답');
  const jwt=role=>'eyJhbGciOiJIUzI1NiJ9.'+Buffer.from(JSON.stringify({role})).toString('base64url')+'.signature';
  for(const badKey of ['', 'sb_secret_never_send',jwt('service_role'),'invalid-key']){
    c.SUPABASE_KEY=badKey;c.fetch=()=>assert.fail('설정이 잘못되면 요청하지 않음');
    const s=st();await T.create().run(s);assert.strictEqual(s.textReco.status,'error');
  }
  c.SUPABASE_KEY=jwt('anon');c.SUPABASE_URL='https://project.supabase.co/';
  c.fetch=async()=>Response.json([{code:'1',reason:'legacy anon'}]);
  const legacy=st();await T.create().run(legacy);assert.strictEqual(rec(legacy).why,'legacy anon');
  c.SUPABASE_URL='';c.fetch=()=>assert.fail('주소가 없으면 요청하지 않음');
  const missing=st();await T.create().run(missing);assert.strictEqual(missing.textReco.status,'error');
  c.SUPABASE_URL='https://project.supabase.co';c.SUPABASE_KEY='sb_publishable_test';
  for(const response of [new Response('private provider error',{status:502}),Response.json({error:{code:'SERVER_NOT_CONFIGURED'}},{status:503}),new Response('not json'),Response.json({unexpected:true})]){
    c.fetch=async()=>response;const s=st();await T.create().run(s);assert.strictEqual(s.textReco.status,'error');
  }
  c.fetch=async()=>Response.json({error:{code:'MODEL_TIMEOUT'}},{status:504});
  const httpTimeout=st();await T.create().run(httpTimeout);assert.strictEqual(httpTimeout.textReco.error,'timeout');
  let startFetch,networkSignal;
  const started=new Promise(resolve=>startFetch=resolve);
  c.fetch=(_,options)=>{networkSignal=options.signal;startFetch();return new Promise(()=>{});};
  const abortState=st(),abortClient=T.create(),network=abortClient.run(abortState);
  await started;abortClient.cancel(abortState);await network;
  assert.strictEqual(networkSignal.aborted,true,'화면 이탈은 실제 HTTP 요청도 중단');
  assert.strictEqual(abortState.textReco.status,'idle');
};
