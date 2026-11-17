import { test } from 'node:test';
import assert from 'node:assert/strict';

let createHandler;
try { ({ createHandler } = await import('./handler.mjs')); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
test('추천 HTTP 핸들러가 있어야 함', () => assert.equal(typeof createHandler, 'function'));

const origin='https://nnroonjji.github.io', key='sb_publishable_test';
const payload={text:'잔잔한 영화',candidates:[
  {code:'1',title:'가',plot:'한 사람의 하루',genre:'드라마'},
  {code:'2',title:'나',plot:'가족의 이야기',genre:'드라마'},
  {code:'3',title:'다',plot:'',genre:''},
]};
const rows=[{code:'3',reason:'세 번째 추천'},{code:'1',reason:'첫 번째 추천'},{code:'2',reason:'두 번째 추천'}];
const env={OPENAI_API_KEY:'fake-provider-key',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:key})};
const answer=(items=rows)=>Response.json({status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:JSON.stringify({recommendations:items})}]}]});
const request=(body=payload,headers={},method='POST')=>new Request('https://example.supabase.co/functions/v1/recommend',{
  method,headers:{origin,apikey:key,'Content-Type':'application/json',...headers},...(method==='POST'?{body:typeof body==='string'?body:JSON.stringify(body)}:{})
});
const handler=(extra={})=>createHandler({env:n=>env[n],fetchImpl:async()=>answer(),rateLimit:async()=>({allowed:true}),...extra});
const options={skip:!createHandler};

test('OpenAI strict schema로 요청하고 추천 순서·이유를 반환',options,async()=>{
  let sent;
  const response=await handler({fetchImpl:async(url,opts)=>{sent={url,...opts};return answer();}})(request());
  assert.equal(response.status,200); assert.deepEqual(await response.json(),rows);
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(sent.url,'https://api.openai.com/v1/responses');
  assert.equal(sent.headers.Authorization,'Bearer fake-provider-key');
  const body=JSON.parse(sent.body);
  assert.equal(body.model,'gpt-5.4-mini'); assert.equal(body.store,false);
  assert.equal(body.text.format.type,'json_schema'); assert.equal(body.text.format.strict,true);
  assert.deepEqual(body.text.format.schema.properties.recommendations.items.properties.code.enum,['1','2','3']);
  assert.equal(body.text.format.schema.additionalProperties,false);
  assert.deepEqual(JSON.parse(body.input[0].content),payload);
  assert(sent.signal instanceof AbortSignal);
});
test('CORS preflight는 인증·AI 호출 없이 처리',options,async()=>{
  const response=await handler({env:()=>undefined,fetchImpl:()=>assert.fail('preflight 모델 호출 금지')})(request(null,{apikey:''},'OPTIONS'));
  assert.equal(response.status,204); assert.match(response.headers.get('access-control-allow-headers'),/apikey/);
  assert.match(response.headers.get('access-control-allow-methods'),/POST/);
});
test('허용하지 않은 origin·잘못된 키·메서드 차단',options,async()=>{
  const fn=handler({fetchImpl:()=>assert.fail('검증 전 모델 호출 금지')});
  for(const [req,status] of [[request(payload,{origin:'https://evil.example'}),403],[request(payload,{apikey:'wrong'}),401],[request(payload,{apikey:''}),401],[request(null,{},'GET'),405]]){
    const response=await fn(req); assert.equal(response.status,status);
    if(status===403) assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
});
test('명시적 local origin·모델·legacy anon 설정 지원',options,async()=>{
  const localEnv={OPENAI_API_KEY:'fake',SUPABASE_ANON_KEY:'legacy-anon',ALLOWED_ORIGINS:'http://localhost:8000',OPENAI_MODEL:'custom-model'};
  const fn=handler({env:n=>localEnv[n],fetchImpl:async(_,opts)=>{assert.equal(JSON.parse(opts.body).model,'custom-model');return answer();}});
  assert.equal((await fn(request(payload,{origin:'http://localhost:8000',apikey:'legacy-anon'}))).status,200);
});
test('키 없거나 publishable 설정이 잘못되면 503, 원문 비노출',options,async()=>{
  for(const overrides of [{OPENAI_API_KEY:''},{SUPABASE_PUBLISHABLE_KEYS:'{'},{SUPABASE_PUBLISHABLE_KEYS:''}]){
    const fn=handler({env:n=>({...env,...overrides})[n],fetchImpl:()=>assert.fail('키 없이 모델 호출 금지')});
    const r=await fn(request()); assert.equal(r.status,503); assert(!JSON.stringify(await r.json()).includes('fake-provider-key'));
  }
});
test('입력 타입·글·후보와 각 필드 길이를 서버에서 제한',options,async()=>{
  const bad=[null,{},[],{...payload,text:42},{...payload,text:' '},{...payload,text:'가'.repeat(1001)},
    {...payload,candidates:{}},{...payload,candidates:Array(201).fill(payload.candidates[0])},
    {...payload,candidates:[null]}, {...payload,candidates:[payload.candidates[0],payload.candidates[0]]},
    ...Object.entries({code:'a'.repeat(33),title:'가'.repeat(201),plot:'가'.repeat(2001),genre:'가'.repeat(101)}).map(([k,v])=>({...payload,candidates:[{...payload.candidates[0],[k]:v}]})),
    ...['code','title','plot','genre'].map(k=>({...payload,candidates:[{...payload.candidates[0],[k]:null}]})),
    {...payload,candidates:[{...payload.candidates[0],code:' '}]}];
  const fn=handler({fetchImpl:()=>assert.fail('잘못된 입력으로 모델 호출 금지')});
  for(const body of bad) assert.equal((await fn(request(body))).status,400,JSON.stringify(body).slice(0,90));
  assert.equal((await fn(request('{'))).status,400);
  assert.equal((await fn(request(payload,{'Content-Type':'text/plain'}))).status,415);
});
test('Content-Length 없는 UTF-8 초과 본문도 413',options,async()=>{
  const fn=handler({fetchImpl:()=>assert.fail('초과 본문 모델 호출 금지')});
  const oversized=JSON.stringify({...payload,text:'가'.repeat(50000)});
  assert.equal((await fn(request(oversized))).status,413);
  assert.equal((await fn(request(payload,{'Content-Length':'131073'}))).status,413);
});
test('후보 없음은 API 호출 없이 빈 배열 반환, 1/2편도 지원',options,async()=>{
  assert.deepEqual(await (await handler({fetchImpl:()=>assert.fail('빈 후보 모델 호출 금지')})(request({...payload,candidates:[]}))).json(),[]);
  for(const n of [1,2]){
    const candidates=payload.candidates.slice(0,n),items=candidates.map(x=>({code:x.code,reason:'선택 이유'}));
    assert.deepEqual(await (await handler({fetchImpl:async()=>answer(items)})(request({...payload,candidates}))).json(),items);
  }
});
test('후보 밖·중복·빈/긴 이유 제거, 최대 3편과 순서 유지',options,async()=>{
  const input=[{code:'99',reason:'후보 밖'},null,{code:'1',reason:' '},{code:'1',reason:'x'.repeat(301)},
    {code:'3',reason:'  셋  '},{code:'3',reason:'중복'},{code:'2',reason:'둘'},{code:'1',reason:'하나'},{code:'2',reason:'넷'}];
  const r=await handler({fetchImpl:async()=>answer(input)})(request());
  assert.deepEqual(await r.json(),[{code:'3',reason:'셋'},{code:'2',reason:'둘'},{code:'1',reason:'하나'}]);
});
test('refusal·incomplete·잘못된 출력은 502, 키/모델 오류 비노출',options,async()=>{
  for(const result of [answer([]),answer([{code:'99',reason:'후보 밖'}]),Response.json({status:'incomplete',output:[]}),
    Response.json({status:'completed',output:[{type:'message',content:[{type:'refusal',refusal:'private'}]}]}),
    Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:'not json'}]}]}),
    new Response('fake-provider-key',{status:500}),new Response('fake-provider-key',{status:401})]){
    const r=await handler({fetchImpl:async()=>result})(request()); assert.equal(r.status,502);
    const body=await r.text(); assert(!body.includes('fake-provider-key')); assert(!body.includes('private'));
  }
  assert.equal((await handler({fetchImpl:async()=>new Response('',{status:429})})(request())).status,429);
});
test('fetch뿐 아니라 응답 본문 수신까지 timeout 적용',options,async()=>{
  for(const fetchImpl of [()=>new Promise(()=>{}),async()=>new Response(new ReadableStream({start(){}}))]){
    const r=await handler({fetchImpl,timeoutMs:10})(request()); assert.equal(r.status,504);
  }
});
test('OpenAI 429의 크레딧·지출 한도와 요청량 제한을 구분',options,async()=>{
  for(const [providerCode,expected] of [['insufficient_quota','MODEL_QUOTA_EXCEEDED'],['credit_balance_exhausted','MODEL_QUOTA_EXCEEDED'],['project_spend_limit_exceeded','MODEL_SPEND_LIMIT'],['organization_spend_limit_exceeded','MODEL_SPEND_LIMIT'],['organization_usage_limit_exceeded','MODEL_SPEND_LIMIT'],['rate_limit_exceeded','MODEL_RATE_LIMITED']]){
    const r=await handler({fetchImpl:async()=>Response.json({error:{code:providerCode,message:'fake-provider-key'}},{status:429})})(request());
    assert.equal(r.status,429);assert.deepEqual(await r.json(),{error:{code:expected}});
  }
});
test('클라이언트 취소가 모델 요청에 전달',options,async()=>{
  const controller=new AbortController();let modelSignal,started;
  const ready=new Promise(resolve=>started=resolve);
  const fn=handler({fetchImpl:(_,opts)=>{modelSignal=opts.signal;started();return new Promise(()=>{});}});
  const req=new Request(request(),{signal:controller.signal}),pending=fn(req);
  await ready;controller.abort(); assert.equal((await pending).status,499); assert.equal(modelSignal.aborted,true);
});
test('업로드 도중 취소도 499로 종료하고 모델 호출 금지',options,async()=>{
  const controller=new AbortController();let reading;
  const started=new Promise(resolve=>reading=resolve);
  const body=new ReadableStream({pull(){reading();}});
  const req=new Request('https://example.supabase.co/functions/v1/recommend',{
    method:'POST',headers:{origin,apikey:key,'Content-Type':'application/json'},body,duplex:'half',signal:controller.signal
  });
  const pending=handler({fetchImpl:()=>assert.fail('취소된 업로드로 모델 호출 금지')})(req);
  await started;controller.abort();assert.equal((await pending).status,499);
});
test('Deno 진입점이 같은 핸들러를 등록',options,async()=>{
  let registered;
  globalThis.Deno={env:{get:n=>env[n]},serve:fn=>registered=fn};
  try{await import('./index.ts');assert.equal(typeof registered,'function');}
  finally{delete globalThis.Deno;}
});

test('visitor/global reservation rejection prevents OpenAI and exposes retry information',options,async()=>{
  for(const code of ['VISITOR_MINUTE_LIMIT','VISITOR_DAY_LIMIT','GLOBAL_DAY_LIMIT']){
    const r=await handler({rateLimit:async()=>({allowed:false,code,retryAfter:60}),fetchImpl:()=>assert.fail('limited request must never call OpenAI')})(request());
    assert.equal(r.status,429);
    assert.deepEqual(await r.json(),{error:{code,retry_after:60}});
    assert.equal(r.headers.get('retry-after'),'60');
    assert.match(r.headers.get('access-control-expose-headers'),/Retry-After/i);
  }
});
test('unavailable limiter fails closed, while empty/invalid/preflight requests reserve nothing',options,async()=>{
  const fail=handler({rateLimit:async()=>{throw Error('private limiter data');},fetchImpl:()=>assert.fail('no OpenAI on reservation failure')});
  const r=await fail(request()); assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:{code:'RATE_LIMIT_UNAVAILABLE'}});
  const noReservation=handler({rateLimit:()=>assert.fail('no quota consumed before valid billable request'),fetchImpl:()=>assert.fail('no OpenAI')});
  assert.equal((await noReservation(request(null,{},'OPTIONS'))).status,204);
  assert.equal((await noReservation(request({...payload,text:''}))).status,400);
  assert.deepEqual(await (await noReservation(request({...payload,candidates:[]}))).json(),[]);
});
