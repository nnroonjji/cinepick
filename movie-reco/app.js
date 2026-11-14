// 화면 전환·DOM 담당 (UI). 로드 순서: data/data.js → reco.js → app.js
(function(){
  const $=id=>document.getElementById(id);
  const fmt=n=>n.toLocaleString('ko-KR')+'원';

  // ── 테마: html[data-theme] 하나로 CSS 변수 세트가 바뀜. <html data-theme-lock="prev">면 그 테마로 고정(저장값 무시, 고르기 줄은 style.css가 숨김). 고정판 아티팩트용 ──
  const THEMES={base:'기본',wire:'Wire',prev:'Prev',coral:'Coral'};
  const themeLock=document.documentElement.dataset.themeLock;
  function setTheme(t){
    if(!THEMES[t]) t='base';
    document.documentElement.dataset.theme=t; $('themeName').textContent=THEMES[t];
    document.querySelectorAll('.themebar [data-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===t));
    if(!themeLock) try{localStorage.setItem('cinepick_theme',t)}catch(e){}
  }
  let savedTheme=themeLock||'base'; if(!themeLock) try{savedTheme=localStorage.getItem('cinepick_theme')||'base'}catch(e){}
  setTheme(savedTheme);
  if(!themeLock) document.querySelector('.themebar').addEventListener('click',e=>{const b=e.target.closest('[data-theme]'); if(b) setTheme(b.dataset.theme)});

  const PIN='<svg width="14" height="14" viewBox="-12 -29 24 30" aria-hidden="true"><use href="#pin-mark" style="color:var(--hot)"/></svg>';

  const state={user:'게스트',mbti:['','','',''],picked:{},price:10000,text:'',method:'match',idx:{},shows:{},pick:null,disc:{}}; // shows: 방법별로 고른 회차. pick: 예산 화면에서 고른 영화 {mv,sh}. disc: 마이페이지에서 체크한 할인 조건
  const ORDER=['main','login','survey','mbti','pref','price','reco','home','budget','map','booking','showtimes'];
  const SURVEY=['login','survey','mbti','pref','price']; // 이 화면들끼리는 슬라이드 없이 페이드
  const stack=[]; let current='main';

  // ── 화면 전환 ──
  const jump=$('jump');
  ORDER.forEach(id=>{const b=document.createElement('button'); b.textContent=id[0].toUpperCase()+id.slice(1); b.dataset.go=id; jump.appendChild(b);});
  // 발표 슬라이드: Showtimes 옆 링크. 화면 전환(show)이 아니라 같은 아티팩트 안 slides.html로 페이지 자체를 바로 바꿈
  const slidesA=document.createElement('a'); slidesA.href='slides.html'; slidesA.className='jump-slides';
  slidesA.innerHTML='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8"/></svg>Slides';
  jump.appendChild(slidesA);
  slidesA.addEventListener('click',e=>{e.stopPropagation(); try{sessionStorage.setItem('cinepick_back',location.hash)}catch(_){}}); // 슬라이드에서 돌아올 때 보던 화면으로
  let animT,booted=false;
  function show(id,push,how){ // how: 'fade'면 전환 방식을 페이드로 고정(추천 표 조각이 예약 화면으로 날아갈 때)
    if(!ORDER.includes(id)) id='main';
    const prev=$('v-'+current),next=$('v-'+id),anim=booted&&prev!==next;
    const dir=how||SURVEY.includes(current)&&SURVEY.includes(id)?how||'fade':(id==='reco'&&push)?'pop':push?'fwd':'back'; // 설문끼리는 페이드(마스코트만 이동), 추천 결과는 팝
    if(push&&id!==current) stack.push(current);
    current=id; booted=true; document.documentElement.dataset.screen=id;
    clearTimeout(animT);
    document.querySelectorAll('.view').forEach(v=>v.className=v.className.replace(/\s*(enter|leave)-(fwd|back|fade|pop)/g,''));
    next.hidden=false; if(anim&&dir==='fade') flyMascot(prev,next); // 마스코트 위치 측정은 두 화면 다 보일 때
    const keep=anim&&(dir==='fwd'||dir==='back'); // 슬라이드만 이전 화면을 잠깐 남겨 옆으로 밀어냄. 페이드·팝은 바로 숨겨 겹치지 않게
    document.querySelectorAll('.view').forEach(v=>{v.hidden=!(v===next||(keep&&v===prev));});
    if(anim){ next.classList.add('enter-'+dir); if(keep) prev.classList.add('leave-'+dir); if(dir==='pop'&&id!=='reco') burst();
      animT=setTimeout(()=>{prev.hidden=true; prev.classList.remove('leave-'+dir); next.classList.remove('enter-'+dir);},dir==='pop'?370:240); } // style.css 전환 시간(.35s, .22s)보다 조금 뒤에 정리
    jump.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.go===id));
    closeOverlay();
    if(id==='home'||SURVEY.includes(id)){state.method='match'; state.idx={};} // 추천 순위도 1위부터 다시. 줄글 추천은 홈에서 적어 보낼 때만(searchForm). 그 밖의 길로 추천 화면에 오면 맞춤 추천
    if(id==='login'){loginForm.reset();pinStep=false;syncLogin();}
    if(id==='pref') syncPref(); // 고른 편수에 맞춰 버튼 잠금
    if(id==='price') warmPosters(); // 고른 영화와 지금 예산 기준 추천 포스터를 미리 받아 둠. 슬라이더를 놓으면 다시 받음(아래 change)
    if(id==='reco'||id==='home') state.pick=null; // 예산 화면에서 고른 영화는 추천·홈으로 오면 버림
    if(id==='reco'){if(prev.id!=='v-booking') atEnd=false; renderReco(); if(anim&&!atEnd) setTimeout(ticketConfetti,dir==='pop'?160:60);}
    if(id==='home'){warmPosters(); renderHome();}
    if(id==='budget') renderBudget();
    if(id==='booking') renderBooking();
    if(id==='showtimes') renderShowtimes();
    if(id==='map'&&!$('mapHint').hidden) setTimeout(()=>{const h=$('mapHint'); h.style.opacity=0; setTimeout(()=>h.hidden=true,400);},3000); // 안내는 3초만
    // 주소 뒤 #화면 이름은 목업(발표용 바로가기)에서만 붙임. 실제 앱은 주소를 그대로 두고, 붙어 온 #은 지움 (2026-11-14)
    if(isMock){if(location.hash!=='#'+id) history.replaceState(null,'','#'+id);} else if(location.hash) history.replaceState(null,'',location.pathname+location.search);
  }
  // 두 화면 모두 .mascot이 있으면 복제본을 이전 위치→새 위치로 이동. 측정은 next에 enter 클래스를 붙이기 전(제자리)에 해야 함
  let flyT;
  function flyMascot(prev,next){
    const a=prev.querySelector('.mascot'),b=next.querySelector('.mascot'); if(!a||!b) return;
    clearTimeout(flyT); document.querySelectorAll('.mascot.fly').forEach(x=>x.remove()); document.querySelectorAll('.view .mascot').forEach(m=>m.style.visibility='');
    const scr=$('app'),S=scr.getBoundingClientRect(),z=S.width/scr.offsetWidth||1; // z: 목업 zoom 보정
    const box=r=>({left:(r.left-S.left)/z+'px',top:(r.top-S.top)/z+'px',width:r.width/z+'px',height:r.height/z+'px'});
    const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect(),c=a.cloneNode(true);
    c.classList.add('fly'); c.removeAttribute('width'); c.removeAttribute('height'); Object.assign(c.style,box(ra)); scr.appendChild(c);
    a.style.visibility='hidden'; b.style.visibility='hidden';
    requestAnimationFrame(()=>requestAnimationFrame(()=>Object.assign(c.style,box(rb))));
    flyT=setTimeout(()=>{c.remove(); a.style.visibility=''; b.style.visibility='';},240);
  }
  // 색종이 폭발: 화면 가운데서 26조각이 사방으로 튀고 사라짐
  function burst(){
    const b=document.createElement('div'); b.className='burst';
    for(let i=0;i<26;i++){const p=document.createElement('i'),a=Math.random()*Math.PI*2,d=110+Math.random()*130;
      p.className='c'+(i%4+1); p.style.setProperty('--dx',Math.cos(a)*d+'px'); p.style.setProperty('--dy',Math.sin(a)*d+'px'); p.style.setProperty('--r',(Math.random()*720-360)+'deg'); p.style.animationDelay=(.1+Math.random()*.1)+'s'; b.appendChild(p);}
    $('app').appendChild(b); setTimeout(()=>b.remove(),1200);
  }
  document.addEventListener('click',e=>{
    const go=e.target.closest('[data-go]'); if(go){e.preventDefault(); show(go.dataset.go,true); return;}
    if(e.target.closest('[data-back]')){show(stack.pop()||'main',false); return;}
    const sh=e.target.closest('[data-sheet]'); if(sh){openSheet(sh.dataset.sheet); return;}
    const ou=e.target.closest('[data-outing]'); if(ou){openSheet('outing',+ou.dataset.outing); return;} // 홈 나들이 카드
    if(e.target.closest('[data-drawer]')){openDrawer(); return;}
    const tb=e.target.closest('[data-toast]'); if(tb){toast(tb.dataset.toast); return;}
  });
  window.addEventListener('hashchange',()=>show(location.hash.slice(1)||'main',true));

  // ── 계정: 닉네임 + PIN ──
  // data/config.js에 SUPABASE_URL, SUPABASE_KEY가 있으면 Supabase에 저장(표와 함수: data/supabase.sql. PIN은 서버에서 해시로 확인하고 브라우저는 표를 직접 못 읽음)
  // config.js가 없으면(파일을 더블클릭해서 열 때, 아티팩트) 전처럼 이 브라우저 저장소에만 흉내
  const SB=typeof SUPABASE_URL==='string'&&SUPABASE_URL&&typeof SUPABASE_KEY==='string'&&SUPABASE_KEY?SUPABASE_URL.replace(/\/(rest\/v1\/?)?$/,''):''; // 주소 끝에 /rest/v1/이 붙어 있어도 됨
  const rpc=(fn,args)=>fetch(SB+'/rest/v1/rpc/'+fn,{method:'POST',headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},body:JSON.stringify(args)}).then(r=>{if(!r.ok) throw new Error(fn+' '+r.status); return r.json();});
  const known={}; // 닉네임 → 서버에 있는지 (물어본 것만)
  const seedUsers={'김치찌':{pin:'1234',mbti:['I','N','F','P'],picked:{'라라랜드':1,'벌새':1},price:10000},'popcorn_lover':{pin:'0000'}};
  function loadUsers(){if(SB) return {}; try{return Object.assign({},seedUsers,JSON.parse(localStorage.getItem('cinepick_users')||'{}'))}catch(e){return Object.assign({},seedUsers)}}
  let lastSave='';
  function saveUser(nick,data){
    if(SB){const j=nick+JSON.stringify(data); if(j===lastSave) return; lastSave=j; // 같은 내용은 다시 안 보냄
      rpc('cp_save',{p_nick:nick,p_pin:state.pin,p_data:data}).then(ok=>{if(!ok) throw 0;}).catch(()=>{lastSave=''; toast('저장하지 못했어요');}); return;}
    try{const u=JSON.parse(localStorage.getItem('cinepick_users')||'{}'); u[nick]=Object.assign(u[nick]||{},data); localStorage.setItem('cinepick_users',JSON.stringify(u))}catch(e){}
  }
  function useDisc(d){state.disc=d; setDisc(d); METHODS.forEach(k=>state.shows[k]=null); if(state.pick) state.pick.sh=null;} // 할인 조건이 바뀌면 회차 가격이 달라지니 고른 회차는 다시 고름
  const nickOk=n=>/^[가-힣a-zA-Z0-9_]{2,12}$/.test(n), pinOk=p=>/^\d{4}$/.test(p);
  const loginForm=$('loginForm'),nick=$('nick'),nickMsg=$('nickMsg'),pin=$('pin'),pin2=$('pin2'),pinField=$('pinField'),pin2Field=$('pin2Field'),loginCta=$('loginCta'),loginCtaLabel=$('loginCtaLabel'),loginErr=$('loginErr');
  let pinStep=false; // 두 단계: 닉네임 → 다음 → PIN 칸(가입이면 PIN 확인까지). 닉네임을 고치면 다시 1단계 (2026-10-30, 폰에서 칸이 버튼에 가려지는 문제)
  function showErr(msg){loginErr.textContent=msg; loginErr.hidden=!msg;}
  function nickState(){const n=nick.value.trim(); return !n?'':!nickOk(n)?'bad':SB&&!(n in known)?'wait':(SB?known[n]:loadUsers()[n])?'login':'signup';} // wait: 서버에 있는 닉네임인지 아직 모름
  let askT=0;
  const ask=n=>rpc('cp_exists',{p_nick:n}).then(x=>{known[n]=!!x;});
  function syncLogin(){
    const s=nickState(), open=pinStep&&(s==='login'||s==='signup');
    nickMsg.className='fmsg'+(s==='bad'?' bad':s==='signup'?' ok':'');
    nickMsg.textContent={'':'',wait:'',bad:'2~12자, 한글·영문·숫자·_만',login:'반가워요! 다음을 누르고 PIN을 입력해요',signup:'새 닉네임이에요. 다음을 누르고 PIN을 정하면 가입돼요'}[s];
    const reveal=open&&pinField.hidden; pinField.hidden=!open; pin2Field.hidden=!(open&&s==='signup');
    if(reveal){[pinField,pin2Field].forEach(f=>{f.classList.remove('pop-in'); void f.offsetWidth; f.classList.add('pop-in');}); loginCta.scrollIntoView({block:'nearest',behavior:'smooth'});} // PIN 칸이 열리면 내려오는 애니메이션 + 맨 아래 버튼까지 보이게 스크롤(버튼이 칸 아래 한 줄로 있음)
    loginCtaLabel.textContent=!open?'다음':s==='login'?'로그인':'가입하기';
    loginCta.disabled=!(s==='login'||s==='signup'||s==='wait');
    showErr('');
  }
  nick.addEventListener('input',()=>{pinStep=false; syncLogin();
    clearTimeout(askT); const n=nick.value.trim(); if(nickState()==='wait') askT=setTimeout(()=>ask(n).then(()=>{if(nick.value.trim()===n) syncLogin();}).catch(()=>{}),350); // 입력이 멈추면 서버에 있는 닉네임인지 물어봄
  });
  const offline=()=>showErr('서버에 연결하지 못했어요. 잠시 뒤 다시 해줘');
  [pin,pin2].forEach(el=>el.addEventListener('input',()=>{el.value=el.value.replace(/\D/g,''); showErr('');}));
  loginForm.addEventListener('submit',async e=>{
    e.preventDefault(); const n=nick.value.trim();
    if(nickState()==='wait'){try{await ask(n)}catch(_){return offline()}}
    syncLogin();
    const s=nickState(); let u=loadUsers()[n];
    if(s!=='login'&&s!=='signup') return showErr('닉네임을 확인해줘');
    if(!pinStep){pinStep=true; syncLogin(); pin.focus({preventScroll:true}); return;} // 1단계 다음: PIN 칸 열고 커서 이동. preventScroll: focus의 스크롤이 syncLogin의 버튼까지 보이는 스크롤을 끊지 않게
    if(!pinOk(pin.value)) return showErr('PIN은 숫자 4자리');
    if(s==='login'){
      if(SB){try{u=await rpc('cp_login',{p_nick:n,p_pin:pin.value})}catch(_){return offline()} if(!u) return showErr('PIN이 달라요');}
      else if(u.pin!==pin.value) return showErr('PIN이 달라요');
      return enter(n,pin.value,u);
    }
    if(pin.value!==pin2.value) return showErr('PIN 확인이 달라요');
    if(SB){let ok; try{ok=await rpc('cp_signup',{p_nick:n,p_pin:pin.value})}catch(_){return offline()}
      if(!ok){known[n]=true; syncLogin(); return showErr('방금 다른 사람이 가입한 닉네임이에요. PIN을 알면 로그인해줘');}
      known[n]=true;}
    else saveUser(n,{pin:pin.value});
    state.user=n; state.pin=pin.value; lastSave=''; keepLogin(n,pin.value); state.mbti=['','','','']; state.picked={}; state.text=''; useDisc({}); syncMbti(); renderPref();
    toast(n+' 님 가입 완료'); show('survey',true);
  });
  // 로그인 성공 뒤 상태 채우고 화면 이동. back: 새로고침해서 로그인이 이어질 때(알림 없이 홈으로)
  function enter(n,p,u,back){
    state.user=n; state.pin=p; lastSave=''; keepLogin(n,p); useDisc(u.disc||{}); state.text=''; state.method='match'; // 줄글은 홈 화면에서 그때그때 받음
    if(u.mbti&&u.picked){state.mbti=u.mbti.slice(); state.picked=Object.assign({},u.picked); state.price=u.price||state.price; syncMbti(); renderPref(); price.value=state.price; priceUpdate(); if(!back) toast(n+' 님, 저장된 취향으로 추천'); show(back?'home':'reco',true);}
    else{state.mbti=['','','','']; state.picked={}; syncMbti(); renderPref(); if(!back) toast(n+' 님, 설문부터 시작'); show('mbti',true);}
  }
  // ── 로그인 유지: 닉네임과 PIN을 이 브라우저에 두고, 다시 열면 그걸로 로그인. 로그아웃하면 지움 ──
  // ponytail: PIN을 브라우저 저장소에 그대로 둠(서버에 세션이 없어서). 공용 PC까지 챙기려면 서버가 내주는 세션 토큰으로 바꿀 것
  function keepLogin(n,p){try{n?localStorage.setItem('cinepick_login',JSON.stringify({n,p})):localStorage.removeItem('cinepick_login')}catch(e){}}
  async function resume(){
    let k; try{k=JSON.parse(localStorage.getItem('cinepick_login'))}catch(e){} if(!k||!k.n) return;
    let u; if(SB){try{u=await rpc('cp_login',{p_nick:k.n,p_pin:k.p})}catch(_){return}} else{u=loadUsers()[k.n]; if(u&&u.pin!==k.p) u=null;} // 서버에 못 닿으면 저장은 두고 다음에 다시
    if(!u) return keepLogin(); // PIN이 바뀌었거나 없는 계정
    if(state.user==='게스트'&&(current==='main'||current==='login')) enter(k.n,k.p,u,true);
  }

  // ── MBTI: 탭으로도, 노브를 위아래로 끌어서도 선택 ──
  const mbtiBox=$('mbti'),mbtiOut=$('mbtiOut'),mbtiNext=$('mbtiNext');
  const axisLetters=ax=>[ax.children[0].dataset.v,ax.children[1].dataset.v];
  function applyAxis(ax,v){ // DOM만 갱신. v가 빈 값이면 노브 숨김
    const [L,R]=axisLetters(ax),k=ax.querySelector('.knob');
    if(v) ax.dataset.v=v; else delete ax.dataset.v;
    ax.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.v===v));
    k.textContent=v||L; k.style.transform='translateY('+(v===R?'100%':'0')+')';
  }
  function syncMbti(){
    mbtiBox.querySelectorAll('.axis').forEach(ax=>applyAxis(ax,state.mbti[+ax.dataset.axis]));
    mbtiOut.textContent=state.mbti.map(v=>v||'_').join(' ');
    mbtiNext.disabled=state.mbti.some(v=>!v);
  }
  function setAxis(ax,v){state.mbti[+ax.dataset.axis]=v; syncMbti();}
  mbtiBox.addEventListener('click',e=>{const b=e.target.closest('button'); if(b) setAxis(b.closest('.axis'),b.dataset.v);}); // 키보드용. 탭은 pointer 쪽에서 먼저 처리돼 같은 값이 한 번 더 들어가도 무해
  let drag=null;
  // 노브 위치는 0(위 칸)~1(아래 칸) 비율로만 다룸. px 좌표를 안 쓰니 목업 zoom 축소와 무관
  function knobAt(ax,f){const [L,R]=axisLetters(ax),k=ax.querySelector('.knob'); k.style.transform='translateY('+(f*100)+'%)'; k.textContent=f<.5?L:R; k.style.opacity=1;}
  mbtiBox.addEventListener('pointerdown',e=>{
    const ax=e.target.closest('.axis'); if(!ax) return;
    const b=e.target.closest('button'),r=ax.getBoundingClientRect();
    const upper=b?b===ax.children[0]:(e.clientY-r.top)<r.height/2; // 누른 버튼 기준
    drag={ax,upper,half:r.height/2,y0:e.clientY,moved:false,f:upper?0:1}; // 노브는 항상 누른 칸에서 출발
    ax.setPointerCapture(e.pointerId); ax.classList.add('dragging'); knobAt(ax,drag.f);
  });
  mbtiBox.addEventListener('pointermove',e=>{
    if(!drag) return; const dy=e.clientY-drag.y0; if(Math.abs(dy)>3) drag.moved=true;
    drag.f=Math.max(0,Math.min(1,(drag.upper?0:1)+dy/drag.half)); knobAt(drag.ax,drag.f);
  });
  function endDrag(){
    if(!drag) return; const {ax}=drag,[L,R]=axisLetters(ax); ax.classList.remove('dragging'); ax.querySelector('.knob').style.opacity='';
    setAxis(ax,drag.moved?(drag.f<.5?L:R):(drag.upper?L:R)); drag=null;
  }
  mbtiBox.addEventListener('pointerup',endDrag); mbtiBox.addEventListener('pointercancel',endDrag);

  // ── Pref: 포스터 다중 선택 ──
  const CHECK='<span class="chk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>';
  // 처음엔 12칸. 다른 영화 보기 → 있던 칸은 그대로 두고 대기열에서 9편씩(3줄) 아래에 더 붙임. 대기열이 비면 버튼 제거
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
  let shown=PICKS.map((m,i)=>i).slice(0,12);
  const queue=shuffle(PICKS.map((m,i)=>i).slice(12));
  const syncPref=()=>{const n=Object.keys(state.picked).length; $('prefCount').textContent=n; $('prefNext').disabled=n<2;}; // 2편 이상 골라야 추천으로. 건너뛰기 없음
  function renderPref(){
    $('prefGrid').innerHTML=shown.map(i=>{const m=PICKS[i],on=!!state.picked[m.t];
      return '<button type="button" class="pm" data-i="'+i+'" aria-pressed="'+on+'"><span class="pm-img"><img src="posters/'+m.f+'.jpg" onerror="this.onerror=null;this.src=\''+TMDB+m.p+'\'" alt="">'+CHECK+'</span><span class="pm-t">'+m.t+'</span></button>'}).join('');
    syncPref();
  }
  renderPref();
  $('prefGrid').addEventListener('click',e=>{
    const b=e.target.closest('.pm'); if(!b) return;
    const t=PICKS[+b.dataset.i].t; if(state.picked[t]) delete state.picked[t]; else state.picked[t]=1;
    b.setAttribute('aria-pressed',!!state.picked[t]); syncPref();
  });
  const more=$('prefMore');
  more.addEventListener('click',()=>{
    const add=queue.splice(0,9); if(!add.length) return;
    const first=shown.length; shown=shown.concat(add); renderPref();
    if(!queue.length) more.remove();
    const sc=more.closest('.pref-scroll')||$('prefGrid').parentElement, el=$('prefGrid').children[first]; if(!el) return; // 새로 붙은 첫 줄이 위에 오게 스크롤. 목업 축소 배율(z)만큼 보정
    const z=sc.getBoundingClientRect().height/sc.offsetHeight||1;
    sc.scrollBy({top:(el.getBoundingClientRect().top-sc.getBoundingClientRect().top)/z-6,behavior:'smooth'});
  });

  // ── Price ──
  const price=$('price'),priceOut=$('priceOut');
  function priceUpdate(){state.price=+price.value; priceOut.textContent=fmt(state.price);}
  price.addEventListener('input',priceUpdate); priceUpdate();
  price.addEventListener('change',()=>warmPosters()); // 예산이 바뀌면 추천 영화도 바뀌니 포스터를 다시 받아 둠. 받은 주소는 ready에 남아 중복 요청 없음

  // ── 추천 포스터 미리 받기. 예산 화면에 들어오면 추천 포스터를 fetch로 받아 blob 주소로 들고 있다가 추천 화면에서 그걸 바로 씀. 아티팩트 호스트의 캐시 헤더와 무관하게 즉시 뜨고, 다른 추천도 바로 바뀜. fetch가 안 되는 file://면 원래 주소 그대로 ──
  const ready={}; // 포스터 주소 → blob 주소. ''는 받는 중이거나 실패
  const warm=u=>{if(u in ready) return; ready[u]=''; fetch(u).then(r=>r.ok?r.blob():Promise.reject()).then(b=>{ready[u]=URL.createObjectURL(b);},()=>{});};
  const posterSrc=u=>ready[u]||u;
  function warmPosters(skip){methodsOf(state).forEach(k=>{for(let i=0;i<RECO_N;i++){const u=recommend({...state,idx:{...state.idx,[k]:i},shows:{}},k).mv.img; if(u!==skip) warm(u);}});} // shows를 비운 사본으로 계산해 고른 회차는 안 건드림
  const RECO_N=3, recoLen=()=>Math.max(1,Math.min(RECO_N,candidates(state,state.method).length)); // 추천 화면은 순위 1~3위를 넘겨 봄 (2026-11-14). 예산 안 영화가 3편이 안 되면 있는 만큼. 지금 몇 위인지는 state.idx
  let atEnd=false; // 추천 마지막 장(홈으로 가기)을 보고 있는지
  const METHOD_TAG={match:'맞춤 추천',text:'한 줄 취향'}; // 표 조각의 추천 종류 글자
  function renderReco(){
    tearReset(); // 찢긴 표는 다시 들어오면 붙여 둠
    const k=state.method, len=recoLen(); // 추천 화면은 들어온 길의 추천(맞춤 추천 또는 홈 줄글 추천) 1~3위 + 마지막 장
    // 추천 표 뒤에 마지막 장(홈으로 가기)이 하나 더 붙음. 넘기기는 처음과 마지막에서 멈춤(2026-11-01)
    const at=atEnd?len:Math.min(state.idx[k]||0,len-1), n=len+1;
    $('recoStep').textContent=atEnd?'마지막 장':'추천 '+(at+1)+' / '+len;
    $('recoDots').innerHTML=Array.from({length:n},(_,i)=>'<i'+(i===at?' class="on"':'')+'></i>').join('');
    $('recoPrev').style.visibility=at===0?'hidden':''; $('recoNext').style.visibility=at===n-1?'hidden':'';
    $('recoCard').classList.toggle('is-end',atEnd); $('recoEndCard').hidden=!atEnd;
    if(atEnd){$('recoHead').textContent='오늘의 추천'; return;}
    $('recoHead').textContent=k==='text'?'한 줄 취향에 맞춘 영화':state.user+' 맞춤 추천 영화';
    const {mv,sh,why}=recommend(state);
    $('recoWhy').textContent=why;
    $('recoImg').src=posterSrc(mv.img); $('recoImg').alt=mv.t+' 포스터'; warmPosters(mv.img); // 지금 것은 img가 받고, 다른 추천 것만 미리
    $('recoTag').textContent=METHOD_TAG[k];
    $('recoTitle').textContent=mv.t; $('recoDate').innerHTML=sh.date+' <small>('+sh.dow+')</small>'; $('recoTime').textContent=sh.time;
    $('recoEarly').hidden=!(sh.note||'').startsWith('조조'); // 조조 회차면 시간 칸에 도장
    $('recoTheater').textContent=sh.theater; $('recoWhen').textContent=sh.hall+' · '+(sh.fmt||'2D'); $('recoPrice').textContent=fmt(sh.price);
    $('recoNo').textContent='No.'+sh.date.replace(/\D/g,'')+'-'+sh.time.replace(':',''); // 표 번호: 날짜 + 시간
    $('recoSheet').setAttribute('aria-label',sh.theater+' '+sh.time+' '+fmt(sh.price)+'. 누르면 지도와 예약 화면');
    if(state.user!=='게스트'&&state.mbti.every(Boolean)) saveUser(state.user,{mbti:state.mbti.slice(),picked:state.picked,price:state.price,disc:state.disc});
  }
  function renderHome(){const {mv,sh}=recommend(state,'match'); /* 홈 추천 칸은 늘 맞춤 추천 */ $('homePoster').src=posterSrc(mv.img); $('homeRecoT').textContent=mv.t; $('homeRecoTime').textContent=sh.time; $('homeRecoTh').textContent=sh.theater; $('homeReco').setAttribute('aria-label','오늘의 추천 '+mv.t+', '+sh.theater+' '+sh.time+'. 누르면 추천 화면으로');
    const fan=inBudget().slice(0,3); $('homeFan').querySelectorAll('img').forEach((im,i)=>{const t=fan[i]; im.hidden=!t; if(t) im.src=posterSrc(SCREENINGS[t[0]].poster);}); $('homeUser').textContent=state.user+' 님'; $('homeBudget').textContent=fmt(state.price); $('homeBudgetN').textContent=inBudget().length;}
  function stubZig(){ // 예약 화면 표 조각 위쪽을 찢긴 톱니로. 추천 화면 찢기(tear)와 같은 7px 톱니
    const s=$('bkStub'),W=s.offsetWidth,H=s.offsetHeight; if(!W) return; const p=[];
    for(let x=0,i=0;x<=W;x+=7,i++) p.push(x+'px '+(i%2?5:0)+'px');
    s.style.clipPath='polygon('+p.join(',')+','+W+'px '+H+'px,0 '+H+'px)';
  }
  window.addEventListener('resize',()=>{if(current==='booking') stubZig();});
  function renderBooking(){
    const {mv,sh}=cur();
    const T=THEATERS[sh.theater]||{};
    $('bkTheater').textContent=sh.theater; bkFocus(sh.theater);
    $('bkKind').textContent=T.kind||''; $('bkKind').hidden=!T.kind; if(T.type) $('bkKind').dataset.type=T.type; else delete $('bkKind').dataset.type; $('bkArea').textContent=T.area||''; $('bkArea').hidden=!T.area;
    // 표 조각: 추천 화면 아래 조각과 같은 내용 + 작은 포스터
    $('bkTag').textContent=state.pick?'예산 맞춤':METHOD_TAG[state.method]; $('bkTitle').textContent=mv.t; $('bkDate').innerHTML=sh.date+' <small>('+sh.dow+')</small>';
    $('bkTime').textContent=sh.time; $('bkEarly').hidden=!(sh.note||'').startsWith('조조'); $('bkPrice').textContent=fmt(sh.price);
    $('bkTh2').textContent=sh.theater; $('bkWhen').textContent=sh.hall+' · '+(sh.fmt||'2D'); $('bkNo').textContent='No.'+sh.date.replace(/\D/g,'')+'-'+sh.time.replace(':','');
    $('bkCaption').textContent=sh.theater+' 페이지로 이동해요'; stubZig();
    const u=THEATERS[sh.theater]?.url; if(u) $('bkGo').href=u; else $('bkGo').removeAttribute('href'); // 예약 바로가기: 그 극장 홈페이지를 새 탭으로 (data/schedule.js THEATERS url)
  }

  // ── Reco: 방법 탭, 다른 추천, 한 줄 취향 입력 ──
  const calm=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;
  let swapping=false;
  // 다른 추천: 화살표, 좌우 스와이프, 키보드 ←→. 다음은 표가 왼쪽으로 넘어가고, 이전은 오른쪽으로
  function flip(d,from){ // d=1 다음, -1 이전. from: 스와이프로 끌던 위치(px)
    const len=recoLen(), card=$('recoCard'); if(swapping||document.querySelector('.rt-torn')) return;
    const at=atEnd?len:Math.min(state.idx[state.method]||0,len-1), to=d===0?0:at+d; // d=0: 첫 추천으로(마지막 장의 다시 보기)
    if(to<0||to>len||to===at){ // 처음, 마지막에서는 제자리로
      if(card.style.transform) card.animate([{transform:card.style.transform},{transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.9,.3,1.2)'}); card.style.transform=''; return;}
    if(d===0) d=-1;
    const go=()=>{atEnd=to===len; if(!atEnd) state.idx[state.method]=to; renderReco();};
    if(calm()||!card.animate){card.style.transform=''; go(); return;}
    swapping=true; const f=from||0;
    card.animate([{transform:'translateX('+f+'px) rotate('+f/30+'deg)'},{transform:'translate('+(-d*115)+'%,-10px) rotate('+(-d*12)+'deg)',opacity:.2}],{duration:f?200:260,easing:'cubic-bezier(.5,0,.8,.4)'}).onfinish=()=>{
      card.style.transform=''; go();
      card.animate([{transform:'translate('+(d*6)+'px,8px) rotate('+(d*3)+'deg) scale(.96)',opacity:.4},{transform:'none',opacity:1}],{duration:340,easing:'cubic-bezier(.2,.9,.3,1.15)'}).onfinish=()=>{swapping=false;};
      if(!atEnd) ticketConfetti();
    };
  }
  { const art=$('recoImg').parentNode, open=()=>{if(!atEnd) openSheet('plot',recommend(state).mv.t);}; // 포스터를 누르면 줄거리 시트. 끌어서 넘길 때의 누름은 아래 스와이프가 막음
    art.tabIndex=0; art.setAttribute('role','button'); art.setAttribute('aria-label','포스터를 누르면 줄거리'); art.style.cursor='pointer';
    art.addEventListener('click',open); art.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault(); open();}}); }
  $('recoAgain').addEventListener('click',()=>flip(0));
  $('recoNext').addEventListener('click',()=>flip(1));
  $('recoPrev').addEventListener('click',()=>flip(-1));
  document.addEventListener('keydown',e=>{if(current==='reco'&&(e.key==='ArrowRight'||e.key==='ArrowLeft')&&!e.target.closest('input,textarea')){e.preventDefault(); flip(e.key==='ArrowRight'?1:-1);}});
  { // 스와이프: 표를 손가락 따라 끌다가 70px 넘게 밀면 넘김. 끈 뒤 손을 떼면 조각 누름(예약)은 무시
    const card=$('recoCard'); let sx=0,sy=0,dx=0,on=false,moved=false;
    card.addEventListener('pointerdown',e=>{if(swapping||e.button||e.target.closest('.rt-end button')) return; on=true; moved=false; sx=e.clientX; sy=e.clientY; dx=0;});
    card.addEventListener('pointermove',e=>{if(!on) return; const z=card.getBoundingClientRect().width/card.offsetWidth||1; dx=(e.clientX-sx)/z;
      if(!moved){if(Math.abs(dx)<8) return; if(Math.abs(e.clientY-sy)/z>Math.abs(dx)){on=false; return;} moved=true; try{card.setPointerCapture(e.pointerId)}catch(_){} }
      card.style.transform='translateX('+dx+'px) rotate('+dx/30+'deg)';});
    const end=()=>{if(!on) return; on=false; if(!moved) return;
      if(Math.abs(dx)>70) flip(dx<0?1:-1,dx);
      else card.animate([{transform:card.style.transform},{transform:'none'}],{duration:220,easing:'cubic-bezier(.2,.9,.3,1.2)'}).onfinish=()=>{card.style.transform='';};
      if(Math.abs(dx)<=70) card.style.transform='';};
    card.addEventListener('pointerup',end); card.addEventListener('pointercancel',end);
    card.addEventListener('click',e=>{if(moved){e.preventDefault(); e.stopPropagation(); moved=false;}},true);
    card.addEventListener('dragstart',e=>e.preventDefault()); // 포스터 이미지 끌기 막음
  }
  // 아래 조각을 누르면 절취선이 톱니 모양으로 찢어지고 조각이 떨어진 뒤 예약 화면으로
  function tearReset(){const c=$('recoCard'); c.style.clipPath=''; $('recoSheet').style.visibility=''; $('bkStub').style.visibility=''; document.querySelectorAll('.rt-torn').forEach(e=>e.remove());}
  $('recoSheet').addEventListener('click',e=>{
    e.preventDefault(); e.stopPropagation();
    if(swapping||document.querySelector('.rt-torn')) return;
    const view=$('v-reco'),card=$('recoCard'),st=$('recoSheet');
    if(calm()||!card.animate){show('booking',true); return;}
    let L=0,T=0; for(let el=card;el&&el!==view;el=el.offsetParent){L+=el.offsetLeft;T+=el.offsetTop;}
    const W=card.offsetWidth,H=card.offsetHeight,S=st.offsetHeight,Y=H-S;
    const zig=(y0,dir)=>{const p=[];for(let x=0,i=0;x<=W;x+=7,i++)p.push(x+'px '+(y0+(i%2?4:-1)*dir)+'px');return p;}; // 찢긴 톱니
    card.style.clipPath='polygon(0 0,'+W+'px 0,'+zig(Y,1).reverse().join(',')+')';
    const torn=document.createElement('div'); torn.className='rt-torn'; torn.setAttribute('aria-hidden','true');
    torn.style.cssText='left:'+(L+view.offsetLeft)+'px;top:'+(T+view.offsetTop+Y-4)+'px;width:'+W+'px;height:'+(S+4)+'px';
    const inner=st.cloneNode(true); inner.removeAttribute('id'); inner.removeAttribute('href'); inner.querySelectorAll('[id]').forEach(n=>n.removeAttribute('id'));
    torn.appendChild(inner); torn.style.clipPath='polygon('+zig(4,1).join(',')+','+W+'px '+(S+4)+'px,0 '+(S+4)+'px)';
    $('app').appendChild(torn); st.style.visibility='hidden'; // 화면 밖(#app)에 붙여서 예약 화면으로 넘어간 뒤에도 끝까지 떨어지는 게 보이게
    const tug=torn.animate([{transform:'none'},{offset:.5,transform:'translateY(5px) rotate(1.5deg)'},{transform:'translate(3px,14px) rotate(4deg)'}],{duration:150,easing:'ease-out',fill:'forwards'});
    // 찢긴 뒤 예약 화면으로 넘어가면서 조각이 예약 화면 표 자리로 날아가 앉음(예약 화면 표 조각은 같은 크기, 같은 톱니)
    setTimeout(()=>{
      show('booking',true,'fade'); // 화면은 제자리에서 바뀌고 표 조각만 움직이게
      const bv=$('v-booking'),bs=$('bkStub'); let tx=bv.offsetLeft,ty=bv.offsetTop; for(let el=bs;el&&el!==bv;el=el.offsetParent){tx+=el.offsetLeft;ty+=el.offsetTop;}
      const x0=L+view.offsetLeft,y0=T+view.offsetTop+Y-4,sc=bs.offsetWidth/W,dx=tx-x0,dy=ty-y0-4*sc;
      bs.style.visibility='hidden'; tug.cancel();
      torn.animate([{transform:'translate(3px,14px) rotate(4deg)'},{offset:.55,transform:'translate('+(dx*.55)+'px,'+(dy*.55-36)+'px) rotate(-5deg) scale('+(1+(sc-1)*.55)+')'},{transform:'translate('+dx+'px,'+dy+'px) rotate(0deg) scale('+sc+')'}],{duration:520,easing:'cubic-bezier(.3,.6,.25,1)',fill:'forwards'});
      setTimeout(()=>{bs.style.visibility=''; tearReset();},520); // 예약 화면 조각은 같은 내용, 같은 모양이라 내려앉으면 그대로 바꿔 끼움
    },150); // 찢기는 순간(0.15초)만 보여 주고 바로 넘김
  });
  // 표 컨페티: 절취선 양쪽 홈과 표 위쪽에서 한 번에 터져 팔랑이며 떨어짐. 색은 테마 변수, 3초쯤 뒤 멈춤
  let cfRaf=0;
  function ticketConfetti(){
    const cv=$('recoCf'),view=$('v-reco'),card=$('recoCard'); if(calm()||view.hidden) return;
    cancelAnimationFrame(cfRaf);
    const W=view.clientWidth,H=view.clientHeight,z=view.getBoundingClientRect().width/W||1,dpr=Math.min(2,(devicePixelRatio||1)*z);
    cv.width=W*dpr; cv.height=H*dpr; const x=cv.getContext('2d'); x.setTransform(dpr,0,0,dpr,0,0);
    const cs=getComputedStyle(document.documentElement),v=n=>cs.getPropertyValue(n).trim();
    const cols=[v('--spark'),v('--tag'),v('--accent'),v('--slate'),'#ffffff',v('--pink')].filter(Boolean);
    let L=0,T=0; for(let e=card;e&&e!==view;e=e.offsetParent){L+=e.offsetLeft;T+=e.offsetTop;} // 화면 전환 애니메이션 중에도 맞게 레이아웃 좌표로
    const R=L+card.offsetWidth,stub=parseFloat(getComputedStyle(card).getPropertyValue('--stub'))||214,Y=T+card.offsetHeight-stub;
    const P=[];
    const seed=(n,ox,oy,spread,up,side)=>{for(let i=0;i<n;i++){const a=-Math.PI/2+(Math.random()-.5)*spread,s=up*(.55+Math.random()*.6);let vx=Math.cos(a)*s; if(side) vx=side*(Math.abs(vx)*.5+2);
      P.push({x:ox+(Math.random()-.5)*30,y:oy,vx,vy:Math.sin(a)*s,w:6+Math.random()*6,h:9+Math.random()*7,r:Math.random()*6,vr:(Math.random()-.5)*.35,f:Math.random()*6,vf:.12+Math.random()*.18,c:cols[i%cols.length],k:Math.random()<.22?'o':Math.random()<.12?'s':'r'});}};
    seed(40,L+4,Y,1.6,15,-1); seed(40,R-4,Y,1.6,15,1); seed(56,W/2,T+40,2.2,13,0);
    const star=(rr)=>{x.beginPath();for(let i=0;i<10;i++){const a=i*Math.PI/5-Math.PI/2,q=i%2?rr*.45:rr;x.lineTo(Math.cos(a)*q,Math.sin(a)*q);}x.closePath();x.fill();};
    let t0=0;
    const step=t=>{if(!t0)t0=t; const k=Math.min(2,(t-(step.l||t))/16.7||1); step.l=t; x.clearRect(0,0,W,H); let alive=0;
      for(const p of P){p.vy+=.32*k;p.vx*=.985;p.vy*=.985;if(p.vy>2.6)p.vy=2.6+Math.sin(p.f)*.4;p.x+=(p.vx+Math.sin(p.f)*.6)*k;p.y+=p.vy*k;p.r+=p.vr*k;p.f+=p.vf*k;
        if(p.y>H+20) continue; alive++;
        x.save();x.translate(p.x,p.y);x.rotate(p.r);x.scale(1,Math.cos(p.f));x.fillStyle=p.c;
        if(p.k==='o'){x.beginPath();x.arc(0,0,p.w/2,0,7);x.fill();} else if(p.k==='s') star(p.w*.8); else {x.fillRect(-p.w/2,-p.h/2,p.w,p.h); if(p.c==='#ffffff'){x.strokeStyle='rgba(0,0,0,.12)';x.lineWidth=1;x.strokeRect(-p.w/2,-p.h/2,p.w,p.h);}}
        x.restore();}
      if(alive&&t-t0<4500&&!view.hidden) cfRaf=requestAnimationFrame(step); else x.clearRect(0,0,W,H);};
    cfRaf=requestAnimationFrame(step);
  }
  // ── 지금 보는 영화·회차: 예산 화면에서 고른 영화가 있으면 그것, 없으면 추천 결과 ──
  function cur(){const p=state.pick; if(!p) return recommend(state); if(!p.sh||p.sh.price>state.price) p.sh=defaultShow(p.mv.t,state.price); return p;}

  // ── Budget: 예산 안 회차가 있는 상영작 전부, 싼 순. 누르면 그 영화 회차 보기 ──
  const byPrice=()=>Object.keys(SHOWS).map(t=>[t,minPrice(t)]).sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0],'ko'));
  const inBudget=()=>byPrice().filter(x=>x[1]<=state.price);
  const bdRange=$('bdRange'); let bdList=[];
  // 영화마다 버튼 하나를 한 번만 만들어 재사용. 슬라이더를 움직일 때마다 innerHTML로 다시 만들면 포스터 99장을 매번 새로 받아 깜빡이고 느림. 싼 순 앞 12장(첫 화면 분량)은 부팅 때 바로 받고 나머지는 보일 때 받음
  const bdNode={};
  const bdBtn=(t,eager)=>bdNode[t]||(bdNode[t]=Object.assign(document.createElement('button'),{type:'button',className:'bm',innerHTML:'<span class="bm-img"><img src="'+SCREENINGS[t].poster+'" alt=""'+(eager?'':' loading="lazy"')+'><span class="bm-p"></span></span><span class="bm-t">'+t+'</span>'}));
  byPrice().forEach(([t],i)=>bdBtn(t,i<12).dataset.t=t);
  function renderBudget(){
    bdRange.value=state.price; $('bdOut').textContent=fmt(state.price);
    bdRange.style.setProperty('--p',(state.price-bdRange.min)/(bdRange.max-bdRange.min)*100+'%'); // 슬라이더 채운 부분
    const q=$('bdQ').value.replace(/\s/g,'').toLowerCase(); // 띄어쓰기, 대소문자 무시
    bdList=inBudget().filter(([t])=>t.replace(/\s/g,'').toLowerCase().includes(q)); $('bdN').textContent=bdList.length;
    if(!bdList.length) $('bdGrid').innerHTML='<div class="empty" style="grid-column:1/-1"><svg class="mascot" width="64" height="64" aria-hidden="true"><use href="#popcorn"/></svg>'+(q?'<b>찾는 영화가 없어요</b><span>다른 이름으로 찾거나 예산을 올려 보세요</span>':'<b>이 예산으로 볼 수 있는 회차가 없어요</b><span>예산을 올려 보세요</span>')+'</div>';
    else $('bdGrid').replaceChildren(...bdList.map(([t,p])=>{const b=bdBtn(t); b.setAttribute('aria-label',t+', '+fmt(p)+'부터'); b.querySelector('.bm-p').textContent=fmt(p)+'~'; return b;}));
  }
  bdRange.addEventListener('input',()=>{price.value=bdRange.value; priceUpdate(); renderBudget();}); // 설문 예산 슬라이더와 같은 예산을 공유
  $('bdQ').addEventListener('input',renderBudget);
  $('bdGrid').addEventListener('click',e=>{const b=e.target.closest('.bm'); if(!b) return; const t=b.dataset.t; state.pick={mv:{t,img:SCREENINGS[t].poster},sh:null}; show('showtimes',true);});

  // ── 나들이: 마포구 영화 문화공간(data/data.js OUTINGS). 홈 카드 줄, 시트(목록 → 상세), 지도 크게 핀과 연결 ──
  const OG_CATS=[['all','전체'],['cafe','영화 카페'],['shop','영화 굿즈'],['space','문화공간'],['ott','OTT 카페']];
  const OG_NAME=Object.fromEntries(OG_CATS);
  const OG_IC={ // 종류별 아이콘, 바탕색
    cafe:['#f8e6b4','<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8a6414" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 9h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3v3M12 3v3"/></svg>'],
    shop:['#e3e7f0','<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4b5a7d" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 5.8a6.2 6.2 0 0 1 5.4 3.2"/></svg>'],
    space:['#eee3d9','<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6e4f4f" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z"/><path d="M14 6v12" stroke-dasharray="2 2"/></svg>'],
    ott:['#fbe1e4','<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a83a50" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M10.5 8.5l4 2.5-4 2.5z"/></svg>']};
  const ogIc=o=>'<span class="ic" style="background:'+OG_IC[o.c][0]+'">'+OG_IC[o.c][1]+'</span>';
  // 홈: 장소 카드 줄. 누르면 나들이 시트의 그 장소 상세
  $('homeOuts').innerHTML=OUTINGS.map((o,i)=>'<button type="button" class="out" data-outing="'+i+'">'+ogIc(o)+'<b>'+o.n+'</b><small>'+OG_NAME[o.c]+' · '+o.area+'</small></button>').join('');
  function ogDetail(o){
    return '<div class="og-detail"><button type="button" class="og-back" data-og-back>← 목록</button>'
      +'<div class="og-head">'+ogIc(o)+'<div><b>'+o.n+'</b><small>'+OG_NAME[o.c]+' · '+o.area+'</small></div><a class="outline og-go" href="'+o.url+'" target="_blank" rel="noopener">네이버 지도 ↗</a></div>' // 이름 옆 네이버 지도 버튼만 (지도에서 보기, 지도에서 모아 보기는 2026-11-14에 뺌)
      +'<p class="og-desc">'+o.d+'</p>'
      +'<dl class="og-info"><dt>영업</dt><dd>'+o.h+'</dd><dt>주소</dt><dd>'+o.a+'</dd><dt>가는 길</dt><dd>'+o.near+'</dd></dl>'+'</div>';
  }
  // ── Map: 지도 크게. 실제 좌표로 그린 SVG 약도(끌어서 이동). 핀이나 아래 카드를 누르면 시트에 위치 정보 ──
  const CAT_NAME={multi:'멀티플렉스',indie:'독립영화관',culture:'문화공간'};
  const CAT_C={multi:'var(--cat-multi)',indie:'var(--hot)',culture:'var(--culture)'};
  const nowAt=n=>Object.keys(SHOWS).filter(t=>daysOf(t).some(d=>d.s.some(x=>x[1]===n))).length; // 그 극장에서 상영 중인 영화 수
  const PLACES=[...document.querySelectorAll('#mapSvg g[data-n]')].map(g=>({g,n:g.dataset.n,cat:g.dataset.cat,th:THEATERS[g.dataset.n],cnt:nowAt(g.dataset.n),og:g.dataset.cat==='culture'?OUTINGS.find(o=>o.pin===g.dataset.n):null}))
    .sort((a,b)=>'indie multi culture'.indexOf(a.cat)-'indie multi culture'.indexOf(b.cat)||a.n.localeCompare(b.n,'ko')); // 독립영화관, 멀티플렉스, 문화공간 순, 같은 종류는 가나다순(상영작 수는 지도 화면에 안 보이니 순서에도 안 씀)
  // 네이버 지도 바로가기: 나들이 장소는 OUTINGS의 naver.me, 극장은 아래 naver.me(채은이 네이버 지도 앱 공유로 받음, 2026-11-01)
  const NAVER={'라이카시네마':'https://naver.me/FMcgmflF','아트하우스 모모':'https://naver.me/x2jAri85','인디스페이스':'https://naver.me/5Q3trNup','필름포럼':'https://naver.me/FqWtIIpR','롯데시네마 홍대입구':'https://naver.me/xwmqS19w','메가박스 상암':'https://naver.me/F884SznE','메가박스 홍대':'https://naver.me/5FmSHnl2','CGV 연남':'https://naver.me/x4FLX72c','CGV 홍대':'https://naver.me/5PVa2mUy'};
  const naverUrl=n=>NAVER[n]||OUTINGS.find(o=>o.pin===n)?.url||'https://map.naver.com/p/search/'+encodeURIComponent(n);
  const mapInfoDefault=()=>{$('mapInfo').innerHTML='<div class="mi-txt"><div class="mi-name"><b>영화공간 '+PLACES.length+'곳</b></div><span>마포구, 서대문구 · 핀이나 카드를 눌러 보세요</span></div>';};
  $('mapList').innerHTML=PLACES.map((p,i)=>'<button type="button" class="mp" data-i="'+i+'" data-cat="'+p.cat+'" aria-pressed="false" style="--c:'+CAT_C[p.cat]+'"><span class="k"><i></i>'+CAT_NAME[p.cat]+'</span><b>'+p.n+'</b><small>'+(p.og?OG_NAME[p.og.c]+' · '+p.og.area:(p.th?p.th.area+' · '+(p.th.addr||'').split(',')[0].replace(/^\S+구 /,''):''))+'</small></button>').join('');
  mapInfoDefault();
  function pickPlace(g,fromList){
    const p=PLACES.find(x=>x.g===g), n=p.n, th=p.th;
    {const z=Math.max(views.get(mapSvg).z,1); glide(mapSvg,+g.dataset.x,+g.dataset.y-20/z,z);} // 고른 곳을 지도 가운데로. 많이 줄여 놨으면 기본 배율로
    document.querySelectorAll('#mapSvg g[data-on]').forEach(x=>x.removeAttribute('data-on')); g.setAttribute('data-on',''); g.parentNode.appendChild(g); // 고른 핀을 맨 위로
    document.querySelectorAll('#mapList .mp').forEach(b=>{const on=PLACES[+b.dataset.i]===p; b.setAttribute('aria-pressed',on); if(on&&!fromList) b.scrollIntoView({behavior:'smooth',inline:'center',block:'nearest'});});
    if(p.og){const o=p.og; $('mapInfo').innerHTML='<div class="mi-txt"><div class="mi-name"><b>'+n+'</b><span>'+OG_NAME[o.c]+' · '+o.area+'</span></div><span>'+o.a+'</span><span class="mi-n">'+o.h+'</span></div><a class="outline mi-go" href="'+o.url+'" target="_blank" rel="noopener">네이버 지도 ↗</a>'; return;} // 나들이 장소: 종류 · 동네, 주소, 영업시간, 네이버 지도
    $('mapInfo').innerHTML='<div class="mi-txt"><div class="mi-name"><b>'+n+'</b><span>'+(th?th.kind+' · '+th.area:CAT_NAME[p.cat])+'</span></div>'+(th?.addr?'<span>'+th.addr+'</span>':'')+'</div><a class="outline mi-go" href="'+naverUrl(n)+'" target="_blank" rel="noopener">네이버 지도 ↗</a>'; // 이름 + 종류 · 동네, 주소, 네이버 지도 바로가기. 지도 화면엔 상영작 정보 안 넣음(2026-11-01)
  }
  $('mapSvg').addEventListener('click',e=>{if(dragged) return; const g=e.target.closest('g[data-n]'); if(g) pickPlace(g);});
  $('mapSvg').addEventListener('keydown',e=>{const g=e.target.closest('g[data-n]'); if(g&&(e.key==='Enter'||e.key===' ')){e.preventDefault(); pickPlace(g);}});
  $('mapList').addEventListener('click',e=>{const b=e.target.closest('.mp'); if(b) pickPlace(PLACES[+b.dataset.i].g,true);});
  // 종류 칩: 홈 미니 지도와 지도 크게 화면 같은 방식. 끄면 그 종류 핀이 흐려짐
  document.querySelectorAll('#cats .cat').forEach(c=>c.insertAdjacentHTML('beforeend','<em>'+document.querySelectorAll('#homeMap g[data-cat="'+c.dataset.cat+'"]').length+'</em>')); // 홈 범례: 종류별 개수
  [['cats','homeMap'],['mapCats','mapSvg']].forEach(([rail,map])=>$(rail).addEventListener('click',e=>{
    const b=e.target.closest('.cat'); if(!b) return;
    const on=b.getAttribute('aria-pressed')!=='true'; b.setAttribute('aria-pressed',on);
    document.querySelectorAll('#'+map+' g[data-cat="'+b.dataset.cat+'"]').forEach(g=>on?g.removeAttribute('data-off'):g.setAttribute('data-off',''));
    if(map==='mapSvg') document.querySelectorAll('#mapList .mp[data-cat="'+b.dataset.cat+'"]').forEach(x=>x.hidden=!on); // 지도 크게: 꺼진 종류는 카드도 숨김
  }));

  // ── 실제 좌표 약도: 지도 크게와 예약 화면이 같은 바탕(index.html #mapbase)을 viewBox만 바꿔 보여 줌 ──
  // 경위도 → 지도 좌표. 1km = 300. 바탕(길, 지하철, 학교, 공원, 하천)은 OpenStreetMap 데이터를 이 식으로 옮긴 것. 극장 좌표: data/schedule.js THEATERS.ll
  if(THEATERS['메가박스 상암']&&!THEATERS['메가박스 상암'].ll) THEATERS['메가박스 상암'].ll=[37.56907,126.8982]; // 인허가 데이터에 좌표가 비어 있어 OpenStreetMap 위치로 채움(월드컵로 240)
  const MAP_W=1707,MAP_H=916, toMap=ll=>[(ll[1]-126.889)*88.23*300,(37.5715-ll[0])*111*300];
  const mapSvg=$('mapSvg'), bkSvg=$('bkSvg'), views=new Map(); // svg → 화면 가운데에 둘 지도 좌표와 배율 {cx,cy,z}
  // z: 배율(1 = 지도 1단위가 1px). 가장 작게는 지도 전체가 화면을 채울 때까지, 크게는 ZMAX까지
  const ZMAX=3, mapFix=[...mapSvg.querySelectorAll('[data-x]')]; let mapZ=0, bkXY=[847.8,682.6]; // bkXY: 예약 화면에서 고른 극장 핀 위치
  const bkPinAt=()=>$('bkSel').setAttribute('transform','translate('+bkXY[0].toFixed(1)+','+bkXY[1].toFixed(1)+') scale('+(1/views.get(bkSvg).z).toFixed(4)+')'); // 핀과 이름표는 배율과 상관없이 같은 크기
  function setView(svg,cx,cy,z){
    const v=views.get(svg)||{z:1}; if(cx!=null){v.cx=cx; v.cy=cy;} if(z!=null) v.z=z; views.set(svg,v);
    const w=svg.parentNode.clientWidth,h=svg.parentNode.clientHeight; if(!w||!h||v.cx==null) return; // 숨은 화면: 보이면 ResizeObserver가 다시 부름
    v.z=Math.min(Math.max(v.z,w/MAP_W,h/(MAP_H*1.4)),ZMAX); // 세로로 긴 폰 화면에서도 동서 전체가 보이게, 위아래 빈 바탕은 조금 허용
    const vw=w/v.z,vh=h/v.z, fit=(c,a,M)=>a>=M?M/2:Math.min(Math.max(c,a/2-120),M-a/2+120); // 가장자리 120만큼 더 갈 수 있게(위쪽 칩, 아래 시트에 가려진 핀도 가운데로 올 수 있게)
    v.cx=fit(v.cx,vw,MAP_W); v.cy=fit(v.cy,vh,MAP_H);
    svg.setAttribute('viewBox',(v.cx-vw/2).toFixed(1)+' '+(v.cy-vh/2).toFixed(1)+' '+vw.toFixed(1)+' '+vh.toFixed(1));
    if(svg===mapSvg&&v.z!==mapZ){ // 핀, 라벨, 홍익대 표시는 배율과 상관없이 같은 크기로(핀 끝 기준으로 1/z배)
      mapZ=v.z; const k=1/v.z;
      mapFix.forEach(g=>{const x=+g.dataset.x,y=+g.dataset.y; g.setAttribute('transform','translate('+(x*(1-k)).toFixed(1)+' '+(y*(1-k)).toFixed(1)+') scale('+k.toFixed(4)+')');});
      mapSvg.classList.toggle('far',v.z<.7); // 많이 줄이면 고른 곳 말고는 라벨을 숨기고 핀만
    }
    if(svg===bkSvg) bkPinAt();
  }
  let glideF=0;
  function glide(svg,tx,ty,tz){
    const v=views.get(svg); cancelAnimationFrame(glideF); if(!v||!svg.parentNode.clientWidth) return setView(svg,tx,ty,tz);
    const sx=v.cx,sy=v.cy,sz=v.z,ez=tz??sz,t0=performance.now();
    const step=t=>{const q=Math.min(1,(t-t0)/380),e=1-Math.pow(1-q,3); setView(svg,sx+(tx-sx)*e,sy+(ty-sy)*e,sz*Math.pow(ez/sz,e)); if(q<1) glideF=requestAnimationFrame(step);};
    glideF=requestAnimationFrame(step);
  }
  setView(mapSvg,943,570); setView(bkSvg,848,650); // 처음: 홍대입구역~홍익대 사이
  const ro=new ResizeObserver(es=>es.forEach(e=>setView(e.target.querySelector('svg'))));
  ro.observe(mapSvg.parentNode); ro.observe(bkSvg.parentNode);
  const hideHint=()=>{$('mapHint').hidden=true;};
  let dragged=false; // 끌기 뒤의 click은 무시(지도 크게 핀)
  // 끌어서 이동, 두 손가락이나 휠로 확대·축소, + − 버튼. 지도 크게(mapSvg)와 예약 화면(bkSvg)이 같은 코드
  function interact(svg,zoomBtns,hint=()=>{}){
    // 화면 위 한 점(X,Y)을 붙잡은 채로 f배 확대. X가 없으면 가운데 기준
    function zoomAt(f,X,Y){
      const v=views.get(svg),r=svg.getBoundingClientRect(),vb=svg.viewBox.baseVal,u=vb.width/r.width;
      const cx=v.cx,cy=v.cy,z0=v.z,mx=X==null?cx:vb.x+(X-r.left)*u,my=Y==null?cy:vb.y+(Y-r.top)*u;
      setView(svg,cx,cy,z0*f); const z1=v.z; setView(svg,mx-(mx-cx)*z0/z1,my-(my-cy)*z0/z1);
    }
    // 5px 넘게 움직여야 끌기로 봄(그 전엔 핀 누르기)
    const pts=new Map(); let mdrag=null,pinch=null;
    const pinchOf=()=>{const [a,b]=[...pts.values()]; return {d:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};};
    const pxU=()=>svg.viewBox.baseVal.width/svg.getBoundingClientRect().width; // 화면 px → 지도 단위 (목업 zoom 포함)
    svg.addEventListener('pointerdown',e=>{
      if(e.button) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY}); cancelAnimationFrame(glideF); getSelection().removeAllRanges();
      if(pts.size===1){mdrag={x:e.clientX,y:e.clientY,id:e.pointerId,on:false}; dragged=false;}
      else if(pts.size===2){pts.forEach((_,id)=>{try{svg.setPointerCapture(id);}catch(_){}}); pinch=pinchOf(); mdrag=null; dragged=true; hint();}
    });
    svg.addEventListener('pointermove',e=>{
      if(!pts.has(e.pointerId)) return; pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(pinch&&pts.size>=2){const q=pinchOf(),v=views.get(svg),u=pxU(); setView(svg,v.cx-(q.x-pinch.x)*u,v.cy-(q.y-pinch.y)*u); if(pinch.d>0) zoomAt(q.d/pinch.d,q.x,q.y); pinch=q; return;}
      if(!mdrag||e.pointerId!==mdrag.id) return; const dx=e.clientX-mdrag.x,dy=e.clientY-mdrag.y;
      if(!mdrag.on){if(Math.hypot(dx,dy)<5) return; mdrag.on=true; svg.setPointerCapture(e.pointerId); svg.classList.add('dragging'); hint();}
      const v=views.get(svg),u=pxU(); setView(svg,v.cx-dx*u,v.cy-dy*u); mdrag.x=e.clientX; mdrag.y=e.clientY;
    });
    const end=e=>{pts.delete(e.pointerId); if(pts.size<2) pinch=null; if(mdrag?.on) dragged=true; if(!pts.size){mdrag=null; svg.classList.remove('dragging');}};
    svg.addEventListener('pointerup',end); svg.addEventListener('pointercancel',end);
    svg.addEventListener('selectstart',e=>e.preventDefault()); // 끌 때 지도 글자가 파랗게 선택되지 않게
    svg.addEventListener('dragstart',e=>e.preventDefault());
    // 마우스 휠, 노트북 터치패드 두 손가락 확대(ctrlKey로 들어옴)
    svg.addEventListener('wheel',e=>{e.preventDefault(); cancelAnimationFrame(glideF); zoomAt(Math.exp(-e.deltaY*(e.ctrlKey?.01:.0015)),e.clientX,e.clientY); hint();},{passive:false});
    $(zoomBtns).addEventListener('click',e=>{const b=e.target.closest('[data-z]'); if(!b) return; const v=views.get(svg); glide(svg,v.cx,v.cy,v.z*+b.dataset.z); hint();}); // + − 버튼
  }
  interact(mapSvg,'mapZoom',hideHint); interact(bkSvg,'bkZoom');
  // 예약 화면: 고른 극장을 가운데에 크게. 좌표 없는 극장(메가박스 상암)은 홍대입구역 쪽을 보여 주고 핀 없이 이름만
  function bkFocus(name){
    const t=THEATERS[name], ll=t?.ll, lb=$('bkMapLabel'), bg=$('bkMapBg'), pin=$('bkPin');
    const [x,y]=toMap(ll||[37.55716,126.92452]);
    lb.textContent=ll?name:name+' (지도 밖)';
    bkXY=[x,y];
    pin.style.display=ll?'':'none'; pin.style.color={multi:'var(--cat-multi)',indie:'var(--hot)'}[t?.type]||'var(--brown)';
    const w=(lb.getComputedTextLength()||lb.textContent.length*13)+28;
    bg.setAttribute('x',(-w/2).toFixed(1)); bg.setAttribute('width',w.toFixed(1)); bg.setAttribute('y',ll?-80:-14); lb.setAttribute('y',ll?-61:5);
    setView(bkSvg,x,y-34,1); // 배율은 처음으로
  }

  // ── Showtimes ──
  let stDate=null;
  function renderShowtimes(){
    const {mv,sh}=cur(), DAYS=calendar(mv.t); if(!stDate||!DAYS.some(x=>x.d===stDate)) stDate=sh.date;
    $('stMovie').textContent=mv.t; $('stBudget').textContent=fmt(state.price); $('stThumb').src=posterSrc(mv.img); $('stThumb').alt=mv.t+' 포스터';
    const fits=day=>day.s.filter(x=>priceOf(x,day.w)<=state.price);
    $('dates').innerHTML='<span class="month">'+(+stDate.slice(0,2))+'월</span>'+DAYS.map(day=>{const n=fits(day).length;
      return '<button type="button" class="date'+(day.w==='토'?' sat':day.w==='일'?' sun':'')+(n?'':' none')+'" aria-pressed="'+(day.d===stDate)+'" data-date="'+day.d+'" aria-label="'+(+day.d.slice(0,2))+'월 '+(+day.d.slice(3))+'일 '+day.w+'요일, 예산 안 '+n+'회"><span class="dow">'+day.w+'</span><span class="num">'+(+day.d.slice(3))+'</span><span class="dot"></span></button>';}).join('');
    const day=DAYS.find(x=>x.d===stDate)||DAYS[0], fit=fits(day);
    let html=Object.entries(Object.groupBy(fit,s=>s[1])).map(([t,ss])=>'<div class="th">'+PIN+'<b>'+t+'</b><span>'+(THEATERS[t]?.area||'')+'</span></div>'+ss.map(s=>{
      const on=sh.date===day.d&&sh.time===s[0]&&sh.theater===s[1]&&sh.hall===s[2], dc=discountOf(s,day.w);
      return '<button type="button" class="show" aria-pressed="'+on+'" data-time="'+s[0]+'" data-th="'+s[1]+'" data-hall="'+s[2]+'"><span class="tm">'+s[0]+'</span><span class="inf"><span class="hall">'+s[2]+' · '+(s[5]||'2D')+((s[6]||'').startsWith('조조')?'<span class="early">조조</span>':'')+(dc.by?'<span class="early">'+DISC_LABEL[dc.by]+'</span>':'')+'</span><span class="seats">'+(s[4]!=null?'잔여 '+s[4]+'석':(s[6]||'').replace(/^조조(, )?/,'').replace(/(, )?요금 미확인/,''))+'</span></span><span class="pr">'+(dc.by?'<s>'+fmt(s[3])+'</s>':'')+fmt(dc.price)+'</span></button>';}).join('')).join('');
    if(!fit.length) html+='<div class="empty"><svg class="mascot" width="64" height="64" aria-hidden="true"><use href="#popcorn"/></svg>'+(day.s.length?'<b>이 날은 예산 안에 맞는 회차가 없어요</b><span>다른 날짜를 고르거나 <button type="button" class="inline-link" data-sheet="budget">예산을 바꿔</button> 보세요</span>':'<b>이 날은 상영표가 없어요</b><span>다른 날짜를 골라 보세요</span>')+'</div>';
    $('shows').innerHTML=html;
    $('selLine1').textContent=sh.date+' ('+sh.dow+') '+sh.time; $('selLine2').textContent=sh.theater+' '+sh.hall+' · '+fmt(sh.price);
  }
  $('dates').addEventListener('click',e=>{const b=e.target.closest('.date'); if(b){stDate=b.dataset.date; renderShowtimes();}});
  $('shows').addEventListener('click',e=>{const b=e.target.closest('.show'); if(!b) return; const t=cur().mv.t, day=daysOf(t).find(x=>x.d===stDate), s=mk(day,day.s.find(x=>x[0]===b.dataset.time&&x[1]===b.dataset.th&&x[2]===b.dataset.hall),t); if(state.pick) state.pick.sh=s; else state.shows[state.method]=s; renderShowtimes();});

  // ── Home: 검색·제안 칩·지도 카테고리 ──
  $('searchForm').addEventListener('submit',e=>{e.preventDefault(); const q=$('q').value.trim(); if(!q){toast('찾고 싶은 영화를 적어줘'); return;} toast(q.slice(0,18)+(q.length>18?'…':'')+' 기준으로 추천'); state.text=q; state.method='text'; state.idx.text=0; state.shows.text=null; show('reco',true);});
  $('suggest').addEventListener('click',e=>{const b=e.target.closest('.sg'); if(b){$('q').value=b.dataset.q; $('q').focus();}});

  // ── 드로어·시트·토스트 ──
  const overlay=$('overlay');
  function closeOverlay(){overlay.innerHTML='';}
  const X='<button type="button" class="x" data-close aria-label="닫기"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>'; // 시트, 드로어 오른쪽 위 닫기
  overlay.addEventListener('click',e=>{if(e.target.classList.contains('drawer')||e.target.classList.contains('sheet')||e.target.closest('[data-close]')) closeOverlay();});
  function openDrawer(){
    overlay.innerHTML='<div class="drawer"><div class="panel">'+X+'<h2>메뉴</h2><button data-go="mbti">설문 다시 하기</button><button data-logout>로그아웃</button></div></div>';
    overlay.querySelector('[data-logout]').addEventListener('click',()=>{state.user='게스트'; keepLogin(); useDisc({}); toast('로그아웃'); show('main',false);});
  }
  function openSheet(kind,arg){
    let html='';
    if(kind==='mypage') html='<h2>마이페이지</h2><div class="mp-row"><span class="av"><svg width="36" height="36" aria-hidden="true"><use href="#popcorn"/></svg></span><div><b>'+state.user+'</b><p class="hint">MBTI '+(state.mbti.join('')||'미설정')+' · 예산 ~'+fmt(state.price)+'</p></div></div><p class="hint">해당되는 할인 조건을 체크하면 회차 가격을 그 조건으로 다시 계산해요. 극장에서 신분 확인이 필요해요</p><div class="discs">'+DISCOUNTS.map(d=>'<button type="button" class="disc" data-d="'+d+'" aria-pressed="'+!!state.disc[d]+'">'+d+'</button>').join('')+'</div><button class="cta static" data-close>적용</button>';
    if(kind==='outing') html='<h2>나들이 <small style="font-size:11px;color:var(--mute)">마포구 영화 문화공간</small></h2><div class="rail og-cats">'+OG_CATS.map(([k,t],i)=>'<button type="button" class="cat" data-og="'+k+'" aria-pressed="'+!i+'">'+t+'</button>').join('')+'</div><div class="og-grid"></div>';
    if(kind==='plot'){const i=SCREENINGS[arg]||{}, esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;'); // 추천 화면에서 포스터를 누르면 줄거리 (KMDb, data/build_schedule.py가 넣음)
      html='<h2>'+esc(arg)+'</h2><p class="hint">'+esc([i.genre,i.min&&i.min+'분',i.rating].filter(Boolean).join(' · '))+'</p><p class="plot">'+(i.plot?esc(i.plot):'줄거리 정보가 아직 없어요')+'</p>';}
    if(kind==='budget') html='<h2>예산 바꾸기</h2><div class="price-card"><div class="row"><span>최대</span><b id="sheetBudgetOut">'+fmt(state.price)+'</b></div><input type="range" id="sheetBudget" min="5000" max="20000" step="1000" value="'+state.price+'" aria-label="최대 예산"><div class="row"><span>5,000원</span><span>20,000원</span></div></div><button class="cta static" data-close>적용</button>';
    overlay.innerHTML='<div class="sheet"><div class="panel">'+X+html+'</div></div>';
    overlay.querySelectorAll('.disc').forEach(b=>b.addEventListener('click',()=>{const d=b.dataset.d; if(state.disc[d]) delete state.disc[d]; else state.disc[d]=1; useDisc(state.disc); b.setAttribute('aria-pressed',!!state.disc[d]); if(current==='home') renderHome(); if(state.user!=='게스트') saveUser(state.user,{disc:state.disc});}));
    const og=overlay.querySelector('.og-grid'); // 나들이 시트: 칩으로 종류 고르기, 카드 누르면 상세, ← 목록으로 돌아감
    if(og){let k='all';
      const draw=()=>{og.classList.remove('one'); og.innerHTML=OUTINGS.map((o,i)=>[o,i]).filter(([o])=>k==='all'||o.c===k).map(([o,i])=>'<button type="button" class="og" data-og-i="'+i+'">'+ogIc(o)+'<b>'+o.n+'</b><small>'+o.m+'</small></button>').join('');};
      const one=i=>{og.classList.add('one'); og.innerHTML=ogDetail(OUTINGS[i]);};
      if(arg!=null) one(arg); else draw();
      overlay.querySelector('.og-cats').addEventListener('click',e=>{const b=e.target.closest('[data-og]'); if(!b) return; overlay.querySelectorAll('[data-og]').forEach(x=>x.setAttribute('aria-pressed',x===b)); k=b.dataset.og; draw();});
      og.addEventListener('click',e=>{const c=e.target.closest('[data-og-i]'); if(c) return one(+c.dataset.ogI); if(e.target.closest('[data-og-back]')) draw();});}
    const bg=overlay.querySelector('#sheetBudget'); // 예산 시트: 현재 화면은 그대로 두고 목록만 갱신
    if(bg) bg.addEventListener('input',()=>{price.value=bg.value; priceUpdate(); overlay.querySelector('#sheetBudgetOut').textContent=fmt(state.price); if(current==='showtimes') renderShowtimes();});
  }
  let toastT;
  function toast(msg){let t=document.querySelector('.toast'); if(!t){t=document.createElement('div'); t.className='toast'; $('app').appendChild(t);} t.textContent=msg; clearTimeout(toastT); toastT=setTimeout(()=>t.remove(),1500);}

  // ── Main 포스터 2초마다 교체 ──
  const posters=[...document.querySelectorAll('#v-main .stage img')]; let pi=0;
  setInterval(()=>{pi=(pi+1)%posters.length; posters.forEach((p,i)=>i===pi?p.setAttribute('data-on',''):p.removeAttribute('data-on'));},2000);

  // ── 화면 390×844 유지: 세로가 모자라면 폰 전체를 축소. 실제 앱은 폰에선 전체 채움이라 제외 ──
  const phone=$('phone'),isMock=document.documentElement.hasAttribute('data-mockup');
  // zoom 대신 transform으로 줄임: iOS 사파리는 zoom으로 작아진 글자를 자동 확대(text autosizing)로 원래 크기로 되돌려 글자만 커짐(WebKit 272351, 폰에서 아티팩트가 깨지던 원인). transform은 글자 크기를 안 건드림. 줄어든 만큼 음수 margin을 줘서 레이아웃 칸도 같이 줄임
  function fit(){
    if(!isMock&&innerWidth<600){phone.style.transform=phone.style.margin=''; return;}
    const used=document.querySelector('.bar').offsetHeight+16;
    const z=Math.min(1,(innerHeight-used)/(isMock?908:844)),W=phone.offsetWidth,H=phone.offsetHeight;
    phone.style.transform=`scale(${z})`;
    phone.style.margin=`0 ${-W*(1-z)/2}px ${-H*(1-z)}px`;
  }
  addEventListener('resize',fit); fit();

  show(isMock&&location.hash?location.hash.slice(1):'main',false); // 실제 앱은 늘 첫 화면부터. 아티팩트 주소를 복사하면 보고 있던 화면이 #login처럼 붙어 와서 청중이 로그인 화면부터 보게 됐음(2026-10-30). 목업만 #화면 바로가기 유지
  if(!isMock) resume(); // 목업(발표용)은 늘 로그인 전부터
})();

// ── 포스터 대체: 포스터 주소가 안 열리면 POSTER_FB(KOBIS 썸네일) 주소로 ──
function posterFallback(i){const f=POSTER_FB[i.getAttribute('src')]; if(f&&i.src!==f) i.src=f;}
document.addEventListener('error',e=>{if(e.target.tagName==='IMG') posterFallback(e.target);},true);
document.querySelectorAll('img').forEach(i=>{if(i.complete&&!i.naturalWidth) posterFallback(i);});

// ── 가로 스크롤 띠(.rail, .kw)를 마우스로 잡고 끌기. 트랙패드 없는 데스크톱용. 끌고 난 직후의 클릭은 무시 ──
(function(){
  let drag=null; const eat=e=>e.stopPropagation();
  document.addEventListener('pointerdown',e=>{const r=e.pointerType==='mouse'&&e.button===0&&e.target.closest('.rail,.kw'); if(r&&r.scrollWidth>r.clientWidth){drag={r,x:e.clientX,s:r.scrollLeft,moved:false}; e.preventDefault();}});
  document.addEventListener('pointermove',e=>{if(!drag) return; const dx=e.clientX-drag.x; if(Math.abs(dx)>4) drag.moved=true; drag.r.scrollLeft=drag.s-dx;});
  const end=()=>{if(!drag) return; const {r,moved}=drag; drag=null; if(moved){r.addEventListener('click',eat,true); setTimeout(()=>r.removeEventListener('click',eat,true));}};
  document.addEventListener('pointerup',end); document.addEventListener('pointercancel',end);
})();
