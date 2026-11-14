// 화면 전환·지도·DOM 담당 (UI). 로드 순서: data/data.js → reco.js → app.js
(function(){
  const $=id=>document.getElementById(id);
  const fmt=n=>n.toLocaleString('ko-KR')+'원';

  // ── 테마: html[data-theme] 하나로 CSS 변수 세트가 바뀜 ──
  const THEMES={base:'기본',wire:'Wire',prev:'Prev',coral:'Coral'};
  function setTheme(t){
    if(!THEMES[t]) t='base';
    document.documentElement.dataset.theme=t; $('themeName').textContent=THEMES[t];
    document.querySelectorAll('.themebar [data-theme]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.theme===t));
    try{localStorage.setItem('cinepick_theme',t)}catch(e){}
  }
  let savedTheme='base'; try{savedTheme=localStorage.getItem('cinepick_theme')||'base'}catch(e){}
  setTheme(savedTheme);
  document.querySelector('.themebar').addEventListener('click',e=>{const b=e.target.closest('[data-theme]'); if(b) setTheme(b.dataset.theme)});

  const CAT_COLOR={multi:'var(--accent)',indie:'var(--hot)',culture:'var(--culture)',visited:'var(--brown)'};
  // 바탕 지도: OpenStreetMap 기본 타일(키 불필요, 한글 라벨). CARTO는 2026-09부터 키가 필요해져서 교체
  const TILE='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
  const TILE_ATTR='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const pinIcon=(color,s=1,check=false)=>L.divIcon({className:'lpin',iconSize:[24*s,30*s],iconAnchor:[12*s,29*s],tooltipAnchor:[9*s,-17*s],
    html:'<svg width="'+24*s+'" height="'+30*s+'" viewBox="-12 -29 24 30" aria-hidden="true">'+(check
      ?'<path d="M0 0C-4-6-10-11-10-17A10 10 0 1 1 10-17C10-11 4-6 0 0Z" style="fill:'+color+'" stroke="#fffdf7" stroke-width="1.5"/><path d="M-4-17l3 3 5-6" stroke="#fffdf7" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>'
      :'<use href="#pin-mark" style="color:'+color+'"/>')+'</svg>'});
  const groupOf=p=>p.visited?'visited':p.cat;

  // 홈: 홍대~신촌 근처 영화공간. 카테고리 칩으로 흐리게/진하게
  let homeMap; const homeMarkers=[];
  function initHomeMap(){
    homeMap=L.map('homeMap',{zoomControl:false,scrollWheelZoom:false,dragging:!L.Browser.mobile,zoomSnap:.5});
    homeMap.attributionControl.setPrefix(false);
    L.tileLayer(TILE,{attribution:TILE_ATTR,maxZoom:19}).addTo(homeMap);
    PLACES.forEach(p=>{
      const g=groupOf(p), m=L.marker(p.ll,{icon:pinIcon(CAT_COLOR[g],1,g==='visited'),title:p.n,keyboard:false}).addTo(homeMap);
      m.bindTooltip(p.label||p.n,{permanent:!!p.label,direction:'right',className:'ltip'+(p.hot?' hot':'')});
      m.on('click',()=>{const sh=AREA[p.n]&&showAt(p.n,state.price); if(sh){state.show=sh; show('booking',true);} else toast(p.n+(AREA[p.n]?'은 예산 안 회차가 없어요':' 상세 (프로토타입)'));});
      m.group=g; homeMarkers.push(m);
    });
    homeMap.fitBounds(PLACES.filter(p=>p.ll[1]<126.96).map(p=>p.ll),{padding:[18,18]}); // 광화문 쪽은 지도 크게에서 보기
    homeMap.on('click',()=>show('booking',true));
  }
  function setHomeCat(cat,on){homeMarkers.filter(m=>m.group===cat).forEach(m=>{m.setOpacity(on?1:.15); const t=m.getTooltip(); t&&t.setOpacity(on?.9:.15);});}

  // 예약: 고른 극장을 크게, 같은 영화를 트는 다른 극장은 흐리게
  let bkMap,bkLayer,bkMoved=false;
  function renderBookingMap(theater){
    if(!bkMap){
      bkMap=L.map('bkMap',{zoomControl:false,zoomSnap:.5,attributionControl:false});
      L.tileLayer(TILE,{maxZoom:19}).addTo(bkMap);
      L.control.attribution({position:'topright',prefix:false}).addAttribution(TILE_ATTR).addTo(bkMap);
      bkLayer=L.layerGroup().addTo(bkMap);
    }
    bkMap.invalidateSize();
    bkLayer.clearLayers();
    let sel;
    PLACES.filter(p=>AREA[p.n]).forEach(p=>{
      const me=p.n===theater, m=L.marker(p.ll,{icon:pinIcon('var(--hot)',me?1.7:1),opacity:me?1:.5,zIndexOffset:me?1000:0,title:p.n}).addTo(bkLayer);
      if(me){sel=p; m.bindTooltip(p.n,{permanent:true,direction:'top',offset:[-15,-26],className:'ltip hot big'});}
      else m.on('click',()=>{const sh=showAt(p.n,state.price); if(!sh){toast(p.n+'은 예산 안 회차가 없어요'); return;} state.show=sh; renderBooking();});
    });
    if(sel){bkMap.setView(sel.ll,14.5,{animate:bkMoved}); bkMoved=true;}
  }

  const PIN='<svg width="14" height="14" viewBox="-12 -29 24 30" aria-hidden="true"><use href="#pin-mark" style="color:var(--hot)"/></svg>';

  const state={user:'게스트',mbti:['','','',''],picked:{},price:10000,show:null};
  const ORDER=['main','login','survey','mbti','pref','price','reco','home','booking','showtimes'];
  const SURVEY=['login','survey','mbti','pref','price']; // 이 화면들끼리는 슬라이드 없이 페이드
  const stack=[]; let current='main';

  // ── 화면 전환 ──
  const jump=$('jump');
  ORDER.forEach(id=>{const b=document.createElement('button'); b.textContent=id[0].toUpperCase()+id.slice(1); b.dataset.go=id; jump.appendChild(b);});
  let animT,booted=false;
  function show(id,push){
    if(!ORDER.includes(id)) id='main';
    const prev=$('v-'+current),next=$('v-'+id),anim=booted&&prev!==next;
    const dir=SURVEY.includes(current)&&SURVEY.includes(id)?'fade':(id==='reco'&&push)?'pop':push?'fwd':'back'; // 설문끼리는 페이드(마스코트만 이동), 추천 결과는 팝
    if(push&&id!==current) stack.push(current);
    current=id; booted=true; document.documentElement.dataset.screen=id;
    clearTimeout(animT);
    document.querySelectorAll('.view').forEach(v=>v.className=v.className.replace(/\s*(enter|leave)-(fwd|back|fade|pop)/g,''));
    next.hidden=false; if(anim&&dir==='fade') flyMascot(prev,next); // 마스코트 위치 측정은 두 화면 다 보일 때
    const keep=anim&&(dir==='fwd'||dir==='back'); // 슬라이드만 이전 화면을 잠깐 남겨 옆으로 밀어냄. 페이드·팝은 바로 숨겨 겹치지 않게
    document.querySelectorAll('.view').forEach(v=>{v.hidden=!(v===next||(keep&&v===prev));});
    if(anim){ next.classList.add('enter-'+dir); if(keep) prev.classList.add('leave-'+dir); if(dir==='pop') burst();
      animT=setTimeout(()=>{prev.hidden=true; prev.classList.remove('leave-'+dir); next.classList.remove('enter-'+dir);},dir==='pop'?470:320); }
    jump.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',b.dataset.go===id));
    closeOverlay();
    if(id==='login'){loginForm.reset();syncLogin();}
    if(id==='reco') renderReco();
    if(id==='home') renderHome();
    if(id==='booking') renderBooking();
    if(id==='showtimes') renderShowtimes();
    if(location.hash!=='#'+id) history.replaceState(null,'','#'+id);
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
    flyT=setTimeout(()=>{c.remove(); a.style.visibility=''; b.style.visibility='';},320);
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
    if(e.target.closest('[data-drawer]')){openDrawer(); return;}
    const tb=e.target.closest('[data-toast]'); if(tb){toast(tb.dataset.toast); return;}
  });
  window.addEventListener('hashchange',()=>show(location.hash.slice(1)||'main',true));

  // ── 계정: 닉네임 + PIN (브라우저 저장소에 흉내) ──
  const seedUsers={'김치찌':{pin:'1234',mbti:['I','N','F','P'],price:10000},'popcorn_lover':{pin:'0000'}};
  function loadUsers(){try{return Object.assign({},seedUsers,JSON.parse(localStorage.getItem('cinepick_users')||'{}'))}catch(e){return Object.assign({},seedUsers)}}
  function saveUser(nick,data){try{const u=JSON.parse(localStorage.getItem('cinepick_users')||'{}'); u[nick]=Object.assign(u[nick]||{},data); localStorage.setItem('cinepick_users',JSON.stringify(u))}catch(e){}}
  const nickOk=n=>/^[가-힣a-zA-Z0-9_]{2,12}$/.test(n), pinOk=p=>/^\d{4}$/.test(p);
  const loginForm=$('loginForm'),nick=$('nick'),nickMsg=$('nickMsg'),pin=$('pin'),pin2=$('pin2'),pin2Field=$('pin2Field'),loginCta=$('loginCta'),loginCtaLabel=$('loginCtaLabel'),loginErr=$('loginErr');
  function showErr(msg){loginErr.textContent=msg; loginErr.hidden=!msg;}
  function nickState(){const n=nick.value.trim(); return !n?'':!nickOk(n)?'bad':loadUsers()[n]?'login':'signup';}
  function syncLogin(){
    const s=nickState();
    nickMsg.className='fmsg'+(s==='bad'?' bad':s==='signup'?' ok':'');
    nickMsg.textContent={'':'',bad:'2~12자, 한글·영문·숫자·_만',login:'반가워요! PIN을 입력하면 로그인돼요',signup:'새 닉네임이에요. PIN을 정하면 바로 가입돼요'}[s];
    pin2Field.hidden=s!=='signup';
    loginCtaLabel.textContent=s==='login'?'로그인':'가입하기';
    loginCta.disabled=!(s==='login'||s==='signup');
    showErr('');
  }
  nick.addEventListener('input',syncLogin);
  [pin,pin2].forEach(el=>el.addEventListener('input',()=>{el.value=el.value.replace(/\D/g,''); showErr('');}));
  loginForm.addEventListener('submit',e=>{
    e.preventDefault(); syncLogin();
    const s=nickState(),n=nick.value.trim(),u=loadUsers()[n];
    if(s!=='login'&&s!=='signup') return showErr('닉네임을 확인해줘');
    if(!pinOk(pin.value)) return showErr('PIN은 숫자 4자리');
    if(s==='login'){
      if(u.pin!==pin.value) return showErr('PIN이 달라요');
      state.user=n;
      if(u.mbti){state.mbti=u.mbti.slice(); state.price=u.price||state.price; syncMbti(); price.value=state.price; priceUpdate(); toast(n+' 님, 저장된 취향으로 추천'); show('reco',true);}
      else{state.mbti=['','','','']; syncMbti(); toast(n+' 님, 설문부터 시작'); show('mbti',true);}
      return;
    }
    if(pin.value!==pin2.value) return showErr('PIN 확인이 달라요');
    saveUser(n,{pin:pin.value}); state.user=n; state.mbti=['','','','']; syncMbti();
    toast(n+' 님 가입 완료'); show('survey',true);
  });

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
  // 화면엔 12칸. 다른 영화 보기 → 고른 칸은 그대로, 나머지 칸만 대기열에서 교체. 31편이 다 한 번씩 보이면 버튼 제거
  const shuffle=a=>{for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
  let shown=PICKS.map((m,i)=>i).slice(0,12);
  const queue=shuffle(PICKS.map((m,i)=>i).slice(12)),seen=new Set(shown);
  function renderPref(){
    $('prefGrid').innerHTML=shown.map(i=>{const m=PICKS[i],on=!!state.picked[m.t];
      return '<button type="button" class="pm" data-i="'+i+'" aria-pressed="'+on+'"><span class="pm-img"><img src="posters/'+m.f+'.jpg" onerror="this.onerror=null;this.src=\''+TMDB+m.p+'\'" alt="" loading="lazy">'+CHECK+'</span><span class="pm-t">'+m.t+'</span></button>'}).join('');
    $('prefCount').textContent=Object.keys(state.picked).length;
  }
  renderPref();
  $('prefGrid').addEventListener('click',e=>{
    const b=e.target.closest('.pm'); if(!b) return;
    const t=PICKS[+b.dataset.i].t; if(state.picked[t]) delete state.picked[t]; else state.picked[t]=1;
    b.setAttribute('aria-pressed',!!state.picked[t]); $('prefCount').textContent=Object.keys(state.picked).length;
  });
  const more=$('prefMore');
  more.addEventListener('click',()=>{
    shown=shown.map(i=>{if(state.picked[PICKS[i].t]) return i; queue.push(i); return queue.shift();});
    shown.forEach(i=>seen.add(i)); if(seen.size===PICKS.length) more.remove();
    renderPref();
  });

  // ── Price ──
  const price=$('price'),priceOut=$('priceOut');
  function priceUpdate(){state.price=+price.value; priceOut.textContent=fmt(state.price);}
  price.addEventListener('input',priceUpdate); priceUpdate();

  function renderReco(){
    const {mv,sh}=recommend(state);
    $('recoImg').src=mv.img; $('recoImg').alt=mv.t+' 포스터'; $('recoThumb').src=mv.img;
    $('recoTitle').textContent=mv.t; $('recoWhen').textContent=sh.date+' ('+sh.dow+') · '+sh.hall; $('recoTime').textContent=sh.time;
    $('recoTheater').textContent=sh.theater; $('recoPrice').textContent=fmt(sh.price);
    $('recoSheet').setAttribute('aria-label',sh.theater+' '+sh.time+' '+fmt(sh.price)+'. 누르면 지도와 예약 화면');
    if(state.user!=='게스트'&&state.mbti.every(Boolean)) saveUser(state.user,{mbti:state.mbti.slice(),price:state.price});
  }
  function renderHome(){const {mv}=recommend(state); $('homePoster').src=mv.img; $('homeUser').textContent=state.user+' 님'; if(!homeMap) initHomeMap(); else homeMap.invalidateSize();}
  function renderBooking(){
    const {mv,sh}=recommend(state);
    $('bkTheater').textContent=sh.theater; renderBookingMap(sh.theater); $('bkArea').textContent='독립영화관 · '+AREA[sh.theater];
    $('bkThumb').src=mv.img; $('bkTitle').textContent=mv.t; $('bkWhen').textContent=sh.date+' ('+sh.dow+') · '+sh.hall+' · 1명';
    $('bkTime').textContent=sh.time; $('bkPrice').textContent=fmt(sh.price); $('bkCaption').textContent=sh.theater+' 예매 페이지로 이동해요';
  }
  $('bkGo').addEventListener('click',()=>toast(state.show.theater+' 예매 페이지로 이동 (프로토타입)'));

  // ── Showtimes ──
  let stDate=null;
  function renderShowtimes(){
    const {mv,sh}=recommend(state); if(!stDate) stDate=sh.date;
    $('stMovie').textContent=mv.t; $('stBudget').textContent=fmt(state.price); $('stThumb').src=mv.img; $('stThumb').alt=mv.t+' 포스터';
    const fits=day=>day.s.filter(x=>x[3]<=state.price);
    $('dates').innerHTML='<span class="month">11월</span>'+DAYS.map(day=>{const n=fits(day).length;
      return '<button type="button" class="date'+(day.w==='토'?' sat':day.w==='일'?' sun':'')+(n?'':' none')+'" aria-pressed="'+(day.d===stDate)+'" data-date="'+day.d+'" aria-label="11월 '+(+day.d.slice(3))+'일 '+day.w+'요일, 예산 안 '+n+'회"><span class="dow">'+day.w+'</span><span class="num">'+(+day.d.slice(3))+'</span><span class="dot"></span></button>';}).join('');
    const day=DAYS.find(x=>x.d===stDate)||DAYS[0], fit=fits(day), hidden=day.s.length-fit.length;
    let html=Object.entries(Object.groupBy(fit,s=>s[1])).map(([t,ss])=>'<div class="th">'+PIN+'<b>'+t+'</b><span>'+AREA[t]+'</span></div>'+ss.map(s=>{
      const on=sh.date===day.d&&sh.time===s[0];
      return '<button type="button" class="show" aria-pressed="'+on+'" data-time="'+s[0]+'"><span class="tm">'+s[0]+'</span><span class="inf"><span class="hall">'+s[2]+' · 2D'+(s[0]<'11:00'?'<span class="early">조조</span>':'')+'</span><span class="seats">잔여 '+s[4]+'석</span></span><span class="pr">'+fmt(s[3])+'</span></button>';}).join('')).join('');
    if(!fit.length) html+='<div class="empty"><svg class="mascot" width="64" height="64" aria-hidden="true"><use href="#popcorn"/></svg><b>이 날은 예산 안에 맞는 회차가 없어요</b><span>다른 날짜를 고르거나 <button type="button" class="inline-link" data-sheet="budget">예산을 바꿔</button> 보세요</span></div>';
    if(hidden>0) html+='<p class="hidden-note">예산을 넘는 회차 '+hidden+'개는 뺐어요</p>';
    $('shows').innerHTML=html;
    $('selLine1').textContent=sh.date+' ('+sh.dow+') '+sh.time; $('selLine2').textContent=sh.theater+' '+sh.hall+' · '+fmt(sh.price);
  }
  $('dates').addEventListener('click',e=>{const b=e.target.closest('.date'); if(b){stDate=b.dataset.date; renderShowtimes();}});
  $('shows').addEventListener('click',e=>{const b=e.target.closest('.show'); if(!b) return; const day=DAYS.find(x=>x.d===stDate); state.show=mk(day,day.s.find(x=>x[0]===b.dataset.time)); renderShowtimes();});

  // ── Home: 검색·제안 칩·지도 카테고리 ──
  $('searchForm').addEventListener('submit',e=>{e.preventDefault(); const q=$('q').value.trim(); if(!q){toast('찾고 싶은 영화를 적어줘'); return;} toast(q.slice(0,18)+(q.length>18?'…':'')+' 기준으로 추천'); show('reco',true);});
  $('suggest').addEventListener('click',e=>{const b=e.target.closest('.sg'); if(b){$('q').value=b.dataset.q; $('q').focus();}});
  $('cats').addEventListener('click',e=>{
    const b=e.target.closest('.cat'); if(!b) return;
    const on=b.getAttribute('aria-pressed')!=='true'; b.setAttribute('aria-pressed',on);
    setHomeCat(b.dataset.cat,on);
  });

  // ── 드로어·시트·토스트 ──
  const overlay=$('overlay');
  function closeOverlay(){overlay.innerHTML='';}
  overlay.addEventListener('click',e=>{if(e.target.classList.contains('drawer')||e.target.classList.contains('sheet')||e.target.closest('[data-close]')) closeOverlay();});
  function openDrawer(){
    overlay.innerHTML='<div class="drawer"><div class="panel"><h2>메뉴</h2><button data-close>설정</button><button data-go="login">로그인 / 계정 전환</button><button data-logout>로그아웃</button><button data-close>고객센터</button><button data-close>이용 안내</button></div></div>';
    overlay.querySelector('[data-logout]').addEventListener('click',()=>{state.user='게스트'; toast('로그아웃'); show('main',false);});
  }
  function openSheet(kind){
    let html='';
    if(kind==='community') html='<h2>커뮤니티 <small style="font-size:11px;color:var(--mute)">베타 · 자유 게시판</small></h2><div class="post"><b>상상마당 GV 후기</b><span>감독님 질문 시간 길어서 좋았음. 좌석은 중간이 제일 나음</span><span>popcorn_lover · 2시간 전 · 댓글 4</span></div><div class="post"><b>인디스페이스 조조 꿀팁</b><span>평일 첫 회차 거의 비어 있음. 청년 할인 되는 날 확인하기</span><span>김치찌 · 어제 · 댓글 7</span></div><div class="post"><b>이번 주 뭐 봄?</b><span>추천 받은 영화 서로 공유해요</span><span>cine_kim · 3일 전 · 댓글 12</span></div><p class="hint">가입 안 해도 읽기 가능</p><button class="cta static" data-close>글쓰기 (베타)</button>';
    if(kind==='mypage') html='<h2>마이페이지</h2><div class="mp-row"><span class="av"><svg width="36" height="36" aria-hidden="true"><use href="#popcorn"/></svg></span><div><b>'+state.user+'</b><p class="hint">MBTI '+(state.mbti.join('')||'미설정')+' · 예산 ~'+fmt(state.price)+'</p></div></div><div class="row"><span>예약 내역</span><span>1건</span></div><div class="row"><span>방문한 곳</span><span>3곳</span></div><div class="row"><span>내 후기</span><span>1개</span></div><button class="cta static" data-go="mbti">설문 다시 하기</button>';
    if(kind==='budget') html='<h2>예산 바꾸기</h2><p class="hint">티켓 1인 기준. 움직이면 아래 회차 목록이 바로 바뀌어요</p><div class="price-card"><div class="row"><span>최대</span><b id="budgetOut">'+fmt(state.price)+'</b></div><input type="range" id="budget" min="5000" max="20000" step="1000" value="'+state.price+'" aria-label="최대 예산"><div class="row"><span>5,000원</span><span>20,000원</span></div></div><button class="cta static" data-close>적용</button>';
    overlay.innerHTML='<div class="sheet"><div class="panel">'+html+'</div></div>';
    const bg=overlay.querySelector('#budget'); // 예산 시트: Price 화면 슬라이더와 같은 상태를 공유, 현재 화면은 그대로 두고 목록만 갱신
    if(bg) bg.addEventListener('input',()=>{price.value=bg.value; priceUpdate(); overlay.querySelector('#budgetOut').textContent=fmt(state.price); if(current==='showtimes') renderShowtimes();});
  }
  let toastT;
  function toast(msg){let t=document.querySelector('.toast'); if(!t){t=document.createElement('div'); t.className='toast'; $('app').appendChild(t);} t.textContent=msg; clearTimeout(toastT); toastT=setTimeout(()=>t.remove(),1800);}

  // ── Main 포스터 2초마다 교체 ──
  const posters=[...document.querySelectorAll('#v-main .stage img')]; let pi=0;
  setInterval(()=>{pi=(pi+1)%posters.length; posters.forEach((p,i)=>i===pi?p.setAttribute('data-on',''):p.removeAttribute('data-on'));},2000);

  // ── 화면 390×844 유지: 세로가 모자라면 폰 전체를 축소. 실제 앱은 폰에선 전체 채움이라 제외 ──
  const phone=$('phone'),isMock=document.documentElement.hasAttribute('data-mockup');
  function fit(){
    if(!isMock&&innerWidth<600){phone.style.zoom=''; return;}
    const used=document.querySelector('.bar').offsetHeight+16;
    phone.style.zoom=Math.min(1,(innerHeight-used)/(isMock?908:844));
  }
  addEventListener('resize',fit); fit();

  show(location.hash.slice(1)||'main',false);
})();
