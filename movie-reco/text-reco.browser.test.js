// 선택 검증: PLAYWRIGHT_MODULE로 설치된 playwright 경로를 지정하거나 로컬 playwright 사용.
const assert=require('assert'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=__dirname,errors=[],apiRequests=[];
let modelMode='',apiBase,webBase,providerCalls=0,cancelledCalls=0,createHandler;
const api=http.createServer(async(req,res)=>{
  const controller=new AbortController();
  res.on('close',()=>{if(!res.writableEnded) controller.abort();});
  try{
    if(req.url==='/rest/v1/rpc/cp_click'){
      res.writeHead(req.method==='OPTIONS'?204:200,{'Access-Control-Allow-Origin':webBase,'Access-Control-Allow-Headers':'apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json'});
      return res.end(req.method==='OPTIONS'?undefined:'null');
    }
    assert.strictEqual(req.url,'/functions/v1/recommend');
    apiRequests.push({method:req.method,headers:req.headers});
    const chunks=[];for await(const chunk of req) chunks.push(chunk);
    const mode=modelMode;
    const env={OPENAI_API_KEY:mode==='missing-key'?'':'fake-never-sent-to-network',SUPABASE_PUBLISHABLE_KEYS:JSON.stringify({default:'sb_publishable_browser_test'}),ALLOWED_ORIGINS:webBase};
    const limitCodes={'minute-limit':'VISITOR_MINUTE_LIMIT','visitor-day-limit':'VISITOR_DAY_LIMIT','global-day-limit':'GLOBAL_DAY_LIMIT'};
    const handler=createHandler({env:n=>env[n],rateLimit:async()=>limitCodes[mode]?{allowed:false,code:limitCodes[mode],retryAfter:42}:{allowed:true},fetchImpl:async(_,options)=>{
      providerCalls++;
      await new Promise((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);cancelledCalls++;reject(Error('cancelled'));};
        const timer=setTimeout(()=>{options.signal.removeEventListener('abort',abort);resolve();},mode==='timeout'?60000:700);
        options.signal.addEventListener('abort',abort,{once:true});if(options.signal.aborted) abort();
      });
      if(mode==='error') return new Response('private model error',{status:500});
      const payload=JSON.parse(JSON.parse(options.body).input[0].content);
      const n=mode==='one'?1:mode==='two'?2:3;
      const rows=payload.candidates.slice(0,n).reverse().map(m=>({code:m.code,reason:'서버 추천 검증: ‘'+payload.text.slice(0,40)+'’ 요청으로 살펴볼 '+m.title+'입니다.'}));
      return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({recommendations:rows})}]}]});
    }});
    const response=await handler(new Request(apiBase+req.url,{method:req.method,headers:req.headers,signal:controller.signal,...(req.method==='POST'?{body:Buffer.concat(chunks)}:{})}));
    if(!res.destroyed){res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}
  }catch(error){errors.push(error.message);if(!res.destroyed){res.writeHead(500);res.end();}}
});
const server=http.createServer((req,res)=>{
  // route 가로채기는 Chromium의 CORS 경로를 바꿀 수 있어 CSP로 외부 요청만 차단함.
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' "+apiBase);
  if(req.url==='/data/config.js'){
    res.setHeader('Content-Type','text/javascript');return res.end('const SUPABASE_URL='+JSON.stringify(apiBase)+',SUPABASE_KEY="sb_publishable_browser_test";');
  }
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!file.startsWith(root+path.sep)){res.writeHead(403); return res.end();}
  fs.readFile(file,(err,body)=>{if(err){res.writeHead(404); return res.end();} res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream'); res.end(body);});
});
(async()=>{
  ({createHandler}=await import('../supabase/functions/recommend/handler.mjs'));
  await new Promise(resolve=>api.listen(0,'127.0.0.1',resolve));
  apiBase='http://127.0.0.1:'+api.address().port;
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=webBase='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:1100},reducedMotion:'reduce'});
    page.on('pageerror',e=>errors.push(e.message));
    const visible=id=>page.locator('#'+id).waitFor({state:'visible'});
    const text=id=>page.locator('#'+id).textContent();
    const shot=async name=>{if(process.env.TEXT_RECO_SCREENSHOT_DIR){fs.mkdirSync(process.env.TEXT_RECO_SCREENSHOT_DIR,{recursive:true}); await page.locator('#phone').screenshot({path:path.join(process.env.TEXT_RECO_SCREENSHOT_DIR,name+'.png')});}};
    const open=async(mode='')=>{
      modelMode=mode;
      await page.goto(base+'/?now=2026-11-14T10:00',{waitUntil:'domcontentloaded'});
      await page.locator('#v-main [data-go="mbti"]').click();
      for(const v of ['I','N','F','P']) await page.locator('#mbti [data-v="'+v+'"]').press('Enter');
      await page.locator('#mbtiNext').click();
      await page.locator('#prefGrid .pm').nth(0).click(); await page.locator('#prefGrid .pm').nth(1).click();
      await page.locator('#prefNext').click(); await page.locator('#v-price [data-go="reco"]').click();
      await page.locator('#v-reco .home-btn').click(); await visible('v-home');
    };
    const submit=async()=>{await page.locator('#q').fill('웃긴 영화 보고 싶어'); await page.locator('#searchForm [type="submit"]').click();};
    await open(); await submit();
    assert.match(await text('recoStatusTitle'),/찾고 있어요/); await shot('loading'); await visible('recoTicket');
    assert.strictEqual(await text('recoStep'),'추천 1 / 3');
    const first=await text('recoTitle'),reason=await text('recoWhy'),price=await text('recoPrice'),time=await text('recoTime');
    assert(reason.includes(first)&&reason.includes('서버 추천 검증'));
    await shot('success'); await page.setViewportSize({width:390,height:844}); await shot('success-mobile'); await page.setViewportSize({width:1280,height:1100});
    await page.locator('#recoNext').click(); assert.strictEqual(await text('recoStep'),'추천 2 / 3');
    const second=await text('recoTitle'); assert.notStrictEqual(second,first);
    await page.locator('#recoPrev').click(); assert.strictEqual(await text('recoTitle'),first);
    await page.locator('#recoSheet').click(); await visible('v-booking');
    assert.strictEqual(await text('bkTitle'),first); assert.strictEqual(await text('bkPrice'),price); assert.strictEqual(await text('bkTime'),time);
    await page.locator('#v-booking [data-go="showtimes"]').click(); await visible('v-showtimes'); assert.strictEqual(await text('stMovie'),first);
    console.log('PASS 정상 3편·응답 이유·카드 탐색·예약/회차 연결:',first,'/',second);
    await page.locator('#v-showtimes [data-sheet="budget"]').click();
    await page.locator('#sheetBudget').evaluate(el=>{el.value='12000'; el.dispatchEvent(new Event('input',{bubbles:true}));});
    assert.strictEqual(await page.locator('#sheetBudget').isVisible(),true,'예산 드래그 도중 시트가 닫히면 안 됨');
    await page.locator('#sheetBudget').dispatchEvent('change'); await visible('recoTicket');
    console.log('PASS 상세 화면 예산 드래그 유지·완료 후 재추천');
    for(const [mode,count] of [['one',1],['two',2]]){
      await open(mode); await submit(); await visible('recoTicket'); assert.strictEqual(await text('recoStep'),'추천 1 / '+count);
      for(let i=0;i<count;i++) await page.locator('#recoNext').click();
      await visible('recoEndCard'); console.log('PASS '+count+'편과 마지막 장');
    }
    await open();
    await page.locator('#v-home [data-go="budget"]').click(); await visible('v-budget');
    await page.locator('#bdRange').press('Home');
    await page.locator('#v-budget [data-back]').click(); await visible('v-home'); await submit(); await visible('recoBudget');
    assert.match(await text('recoStatusTitle'),/예산에 맞는 상영작이 없어요/); assert.strictEqual(await page.locator('#recoTicket').isVisible(),false);
    await shot('empty');
    await page.locator('#recoBudget').click();
    const callsBeforeBudget=providerCalls;
    for(const value of [6000,8000,10000]){
      await page.locator('#sheetBudget').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
      await page.waitForTimeout(100); // 네트워크가 시작될 시간을 주어 중간 값의 호출도 검출함.
    }
    assert.strictEqual(providerCalls,callsBeforeBudget,'예산 드래그 중에는 모델을 호출하면 안 됨');
    assert.strictEqual(await page.locator('#sheetBudget').isVisible(),true);
    await page.locator('#sheetBudget').dispatchEvent('change');
    await page.locator('#overlay [data-close]').last().click();
    await visible('recoTicket');assert.strictEqual(providerCalls,callsBeforeBudget+1,'예산 확정 후 모델은 한 번만 호출');
    console.log('PASS 후보 없음·예산 드래그 중 0회·확정 후 1회 호출');
    await open('error'); await submit(); await visible('recoRetry'); assert.match(await text('recoStatusTitle'),/불러오지 못했어요/);
    await shot('error');
    await page.locator('#recoRetry').click(); assert.match(await text('recoStatusTitle'),/찾고 있어요/); await visible('recoRetry');
    console.log('PASS 요청 실패·버튼 재시도');
    await open('missing-key'); await submit(); await visible('recoRetry'); assert.match(await text('recoStatusTitle'),/불러오지 못했어요/); console.log('PASS 서버 키 누락 503 안내');
    for(const [mode,title,description,retry] of [
      ['minute-limit',/너무 자주/,/5회/,true],
      ['visitor-day-limit',/오늘의 AI 추천/,/20회.*자정/,false],
      ['global-day-limit',/오늘의 추천 이용량/,/300회.*자정/,false]
    ]){
      await open(mode);const callsBefore=providerCalls;await submit();
      await page.locator('#recoStatusTitle').filter({hasText:title}).waitFor({state:'visible'});
      assert.match(await text('recoStatusText'),description);
      assert.strictEqual(await page.locator('#recoRetry').isVisible(),retry);
      assert.strictEqual(await page.locator('#recoTicket').isVisible(),false);
      assert.strictEqual(providerCalls,callsBefore,'제한 요청은 모델을 호출하지 않음');
      console.log('PASS '+mode+' 안내·카드 숨김·AI 호출 없음');
    }
    await open('timeout'); await submit(); await visible('recoRetry'); assert.match(await text('recoStatusText'),/시간이 초과/); await shot('timeout'); console.log('PASS 서버 15초 시간 초과');
    await open(); await submit(); await page.locator('#v-reco .home-btn').click(); await visible('v-home');
    await page.locator('#q').fill('새로운 문장'); await page.locator('#searchForm [type="submit"]').click(); await visible('recoTicket');
    assert.match(await text('recoWhy'),/새로운 문장/); console.log('PASS 대기 중 홈 이동·새 요청');
    await page.locator('#v-reco .home-btn').click(); await page.locator('#q').fill('<img src=x onerror=alert(1)>');
    await page.locator('#searchForm [type="submit"]').click(); await visible('recoTicket');
    assert.match(await text('recoWhy'),/<img/); assert.strictEqual(await page.locator('#recoWhy img').count(),0); console.log('PASS 추천 이유 HTML을 텍스트로 표시');
    await page.locator('#v-reco .home-btn').click(); await page.locator('#homeReco').click(); await visible('recoTicket');
    assert.strictEqual(await text('recoTag'),'맞춤 추천'); assert(!((await text('recoWhy')).includes('서버 추천 검증'))); console.log('PASS 기존 맞춤 추천');
    assert(providerCalls>0,'브라우저→HTTP→실제 핸들러→공급자 대체 응답까지 호출');
    assert(apiRequests.some(r=>r.method==='OPTIONS'),'cross-origin preflight 검증');
    const posts=apiRequests.filter(r=>r.method==='POST');assert(posts.length>0);
    assert(posts.every(r=>r.headers.apikey==='sb_publishable_browser_test'&&!r.headers.authorization));
    assert(cancelledCalls>0,'timeout/취소는 서버 공급자 요청까지 중단');
    assert.deepStrictEqual(errors,[],'브라우저 JavaScript 오류가 없어야 함');
    if(process.env.TEXT_RECO_SCREENSHOT){await page.screenshot({path:process.env.TEXT_RECO_SCREENSHOT,fullPage:true});}
    console.log('browser ok');
  }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{server.close();api.close();});
