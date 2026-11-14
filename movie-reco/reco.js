// 추천 계산 (채은). DOM 안 만짐, state는 인자로 받음. 로드 순서: data/data.js → data/schedule.js → data/tags.js → reco.js → app.js
// 추천은 둘: match(설문의 MBTI와 좋아하는 영화를 합친 추천), text(홈에서 적은 한 줄 취향, 적었을 때만)
// 둘 다 태그 점수로 순위 (data/tags.js). text는 적은 글에서 태그 이름이나 TEXT_WORDS의 말을 찾아 점수 (Gemini 없이, 11/4). Gemini 줄글 추천을 넣으면 textTags 자리에
const METHODS=['match','text'];
// ── 지금 시각 이후 회차만: 추천, 예산 목록, 상영표, 지도 상영작 수 모두 이 기준(2026-10-31) ──
// 브라우저의 현재 날짜와 시간을 매번 읽음. 날이 바뀌면 다음 날 회차부터 자동으로 추천
// 시각 고정(발표 연습용): DEMO_NOW에 '2026-11-05T10:00'처럼 넣거나 주소 끝에 ?now=2026-11-05T10:00. 평소엔 null
// 'MM.DD' 문자열 비교라 12월에서 1월로 넘어가는 상영표는 안 맞음. 자정 넘는 회차(24:00 이후)는 상영표에 없음
const DEMO_NOW=null;
const ALL_DAYS=[...new Map(Object.values(SHOWS).flat().map(x=>[x.d,x.w])).entries()].sort().map(([d,w])=>({d,w})); // 상영표에 있는 날짜 전부. 'MM.DD'라 문자열 정렬로 충분
function nowKey(){
  let q=DEMO_NOW; try{q=new URLSearchParams(location.search).get('now')||q;}catch(e){}
  const n=q?new Date(q):new Date(), p=v=>String(v).padStart(2,'0');
  return {md:p(n.getMonth()+1)+'.'+p(n.getDate()), hm:p(n.getHours())+':'+p(n.getMinutes())};
}
const lastShow=()=>{const d=ALL_DAYS[ALL_DAYS.length-1]; return d?d.d+' '+Object.values(SHOWS).flat().filter(x=>x.d===d.d).flatMap(x=>x.s.map(s=>s[0])).sort().pop():'';};
const STALE=(()=>{const n=nowKey(); return !ALL_DAYS.length||lastShow()<=n.md+' '+n.hm;})(); // 상영표가 다 지났으면 시간 기준 없이 전부 씀(상영표 새로 받기 전 대비)
function upcoming(day,n){ // 지난 날은 빼고, 오늘은 지금 이후 회차만
  if(STALE||day.d>n.md) return day; if(day.d<n.md) return null;
  const s=day.s.filter(x=>x[0]>n.hm); return s.length?{d:day.d,w:day.w,s}:null;
}
const daysOf=t=>{const n=nowKey(); return (SHOWS[t]||[]).map(d=>upcoming(d,n)).filter(Boolean);}; // 영화 제목 → [{d:'10.30',w:'금',s:[[시간, 극장, 관, 가격, 잔여석, 상영방식, 메모]]}]
const calendar=t=>{const days=daysOf(t), n=nowKey(); return ALL_DAYS.filter(x=>STALE||x.d>=n.md).map(x=>days.find(y=>y.d===x.d)||{d:x.d,w:x.w,s:[]});}; // 날짜 띠: 오늘부터. 이 영화 회차가 없는 날도 비워서 보여 줌
// ── 신분 확인 할인 (docs/관람료_할인_정리.md 3번 표). 마이페이지에서 체크한 조건 중 제일 싼 값. 기본가(조조, 수요일 반영)보다 싸질 때만 ──
const DISCOUNTS=['청소년','마포구, 서대문구 대학생','마포구, 서대문구 주민, 직장인','장애인, 국가유공자','인디스페이스 후원회원'];
let DISC={}; const setDisc=d=>{DISC=d||{};}; // app.js가 state.disc를 넘겨줌
const WEEKEND={'라이카시네마':(w,t)=>'금토일'.includes(w),'필름포럼':(w,t)=>'토일'.includes(w)||(w==='금'&&t>='14:00')}; // 극장마다 주말 기준이 다름
const DISC_RULES={ // 극장 → 조건 → (기본가, 주말 여부) → 가격. 표에 없는 조합은 할인 없음
  '인디스페이스':{'청소년':()=>6000,'장애인, 국가유공자':()=>6000,'마포구, 서대문구 대학생':()=>9000,'마포구, 서대문구 주민, 직장인':()=>9000,'인디스페이스 후원회원':()=>6000},
  '라이카시네마':{'청소년':(b,we)=>we?9000:8000,'장애인, 국가유공자':()=>7000,'마포구, 서대문구 대학생':(b,we)=>we?9000:8000}, // 학생가에서 마포구, 서대문구 대학생 1,000원 추가 할인
  '아트하우스 모모':{'청소년':b=>b<=6000?b:b-2000,'장애인, 국가유공자':()=>5000}, // 청소년은 일반가에서 2,000원 할인. 조조(6,000원)에는 겹쳐 주지 않는 것으로 둠
  '필름포럼':{'청소년':(b,we)=>we?10000:9000,'장애인, 국가유공자':()=>7000}
};
const DISC_LABEL={'청소년':'청소년 할인','마포구, 서대문구 대학생':'대학생 할인','마포구, 서대문구 주민, 직장인':'주민 할인','장애인, 국가유공자':'장애인, 유공자 할인','인디스페이스 후원회원':'후원회원 할인'}; // 상영표 뱃지 글자
function discountOf(s,w){ // 회차 [시간, 극장, 관, 가격, ...]와 요일 → {price: 할인 적용 가격, by: 적용된 조건, 없으면 null}
  const rules=DISC_RULES[s[1]], r={price:s[3],by:null}; if(!rules) return r;
  const we=WEEKEND[s[1]]?WEEKEND[s[1]](w,s[0]):false;
  Object.keys(DISC).forEach(k=>{if(!rules[k]) return; const p=rules[k](s[3],we); if(p<r.price){r.price=p; r.by=k;}});
  return r;
}
const priceOf=(s,w)=>discountOf(s,w).price;
const mk=(day,s,t)=>({movie:t,date:day.d,dow:day.w,time:s[0],theater:s[1],hall:s[2],price:priceOf(s,day.w),base:s[3],fmt:s[5],note:s[6]});
function defaultShow(t,price){ // 예산 안 가장 빠른 회차, 없으면 제일 싼 회차
  const days=daysOf(t);
  for(const day of days){const s=day.s.find(x=>priceOf(x,day.w)<=price); if(s) return mk(day,s,t);}
  let best=null; days.forEach(day=>day.s.forEach(s=>{const c=mk(day,s,t); if(!best||c.price<best.price) best=c;})); return best;
}
// ── 태그 매칭: 합친 추천 (docs/추천로직_정리.md 5-⑥, data/상영작/match_picks.py와 같은 규칙) ──
// 태그 점수 = 고른 영화 중 그 태그가 붙은 편수. 상영작 점수 = 상영작 태그 중 겹치는 것의 점수 합
// MBTI는 의외성 방향에만 씀 (I, P +1 / E, S, J −1 / N, F, T 0의 합, Nguyen 외 2018). +면 점수가 1위의 절반 이상인 영화 중 의외성 최고, −면 1위 중 의외성 최저, 0이면 1위
// 의외성 = 고른 영화마다 코사인 거리(1 − 겹친 태그 수 ÷ √(두 영화 태그 수의 곱))의 평균
// 그다음 가장 빠른 상영일(오늘 우선). 파이썬은 마지막을 무작위로 고르지만 앱은 상영표 순서로 고정 (홈 카드와 추천 화면이 같은 영화를 보여 줘야 함)
const NOW=Object.keys(SCREENINGS).filter(t=>NOW_TAGS[SCREENINGS[t].code]).map(t=>({t,img:SCREENINGS[t].poster,tags:NOW_TAGS[SCREENINGS[t].code]})); // 공연, 콘서트 빠진 상영작
const SEREN_DIR={I:1,P:1,E:-1,S:-1,J:-1}, POOL_RATIO=0.5; // 절반은 임의 (채은 결정 11/3)
const serenDir=state=>state.mbti.reduce((s,l)=>s+(SEREN_DIR[l]||0),0);
const pickedTags=state=>PICKS.filter(p=>state.picked[p.t]).map(p=>p.tags||[]); // 고른 영화마다 태그
function tagCount(state){const c={}; pickedTags(state).flat().forEach(x=>c[x]=(c[x]||0)+1); return c;} // 태그 → 점수
const matched=(m,cnt)=>Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a]).filter(x=>m.tags.includes(x)); // 겹친 태그, 점수 높은 순
function rankMatch(state,pool,cnt=tagCount(state),pt=pickedTags(state),dir=serenDir(state)){ // 상영작 목록 → 추천 순위. cnt 태그 점수, pt 의외성 비교용 태그 묶음, dir MBTI 방향
  const cos=(a,b)=>a.length&&b.length?1-a.filter(x=>b.includes(x)).length/Math.sqrt(a.length*b.length):1;
  const rows=pool.map((m,i)=>({m,i,score:m.tags.reduce((s,x)=>s+(cnt[x]||0),0),seren:pt.length?pt.reduce((s,t)=>s+cos(m.tags,t),0)/pt.length:0,day:(daysOf(m.t)[0]||{}).d||'99.99'}));
  const best=Math.max(0,...rows.map(r=>r.score)), top=r=>dir>0?r.score>0&&r.score>=best*POOL_RATIO:r.score===best; // 1위 후보 풀
  return rows.sort((a,b)=>top(b)-top(a)||(top(a)?(dir>0?b.seren-a.seren:dir<0?a.seren-b.seren:0):b.score-a.score)||(a.day<b.day?-1:a.day>b.day?1:0)||a.i-b.i).map(r=>r.m);
}
// ── 줄글 추천: 적은 글에서 태그 찾기 (Gemini 없이, 11/4) ──
// ponytail: 태그 이름(띄어쓰기, 대소문자 무시)과 아래 표의 말을 글에서 부분 문자열로 찾음. 형태소 분석 없음. 한 글자 태그(춤, 꿈, 섬, 삶, 뱀)는 낱말 그대로나 토씨 붙은 꼴만. Gemini Edge Function이 들어오면 textTags만 바꿈
const TEXT_WORDS={comedy:['웃긴','웃음','유쾌','코믹','웃을','웃고'],horror:['무서','호러','소름'],romance:['사랑','연애','로맨틱','설레','달달','멜로'],suspense:['긴장','쫄깃','스릴','서스펜스'],
  action:['신나','화끈','통쾌'],drama:['감동','눈물','울컥','울고','잔잔','먹먹'],family:['부모','엄마','아빠'],animation:['애니','만화'],'based on a comic':['웹툰'],mystery:['추리','반전','미스테리'],
  crime:['형사','범인'],'sci fi':['에스에프','공상과학'],fantasy:['마법'],music:['노래','뮤지컬','뮤직'],documentary:['다큐'],war:['전투'],friendship:['친구'],'coming of age':['청춘','사춘기'],
  death:['상실','이별'],dreams:['꿈꾸'],'feel-good':['힐링','따뜻','포근','편안','기분좋'],'art house':['예술'],'independent film':['독립'],'based on true story':['실제'],'based on a book':['소설'],
  disturbing:['불편','찝찝'],intense:['강렬'],solitude:['외로'],'alone in the world':['혼자'],animals:['강아지','고양이'],children:['아동','꼬마'],'fight scenes':['싸움'],ghosts:['귀신'],school:['학생'],
  travel:['로드무비'],food:['요리','먹방'],sports:['운동'],'teen movie':['십대','10대','청소년'],'small town':['시골'],'social commentary':['사회'],biographical:['일대기'],'dark humor':['블랙코미디'],
  adventure:['어드벤처'],'martial arts':['무협','쿵푸'],historical:['시대극','사극'],marriage:['부부'],life:['인생']};
function textTags(text){ // 적은 글 → {태그: 1}
  const low=(text||'').toLowerCase(), flat=low.replace(/\s/g,''), c={};
  for(const id in TAGS){
    const ws=[TAGS[id],...(TEXT_WORDS[id]||[])].map(w=>w.toLowerCase().replace(/\s/g,''));
    if(ws.some(w=>w.length>1?flat.includes(w):new RegExp('(^|\\s)'+w+'([은는이가을를의에도와과로]|\\s|$)').test(low))) c[id]=1;
  }
  return c;
}
const minPrice=t=>Math.min(...daysOf(t).flatMap(d=>d.s.map(x=>priceOf(x,d.w)))); // 이 영화의 지금 이후 회차 중 최저가 (할인 반영). 회차가 없으면 Infinity
function candidates(state,k){ // 방법별 추천 순위. 지금 이후 회차가 예산 안에 남은 영화만, 고른 영화 자체는 뺌 (docs/서비스_진행방향.md: 예산에 맞는 회차 먼저 거르고 그 안에서 고름)
  const ok=m=>!state.picked[m.t]&&minPrice(m.t)<=state.price;
  if(k==='text') return rankMatch(state,NOW.filter(ok),textTags(state.text),[],0); // 줄글: 글에서 읽은 태그 점수만, 의외성 없음. 태그를 못 읽으면 전부 0점이라 가까운 회차 순
  return rankMatch(state,NOW.filter(ok));
}
const anyLeft=()=>{const l=NOW.filter(m=>daysOf(m.t).length).sort((a,b)=>minPrice(a.t)-minPrice(b.t)); return l.length?l:MOVIES;}; // 마지막 대비: 예산 안 영화가 하나도 없으면(5,000원) 제일 싼 상영작부터
const basePick=(state,k)=>{const l=candidates(state,k); return l.length?l[(state.idx[k]||0)%l.length]:anyLeft()[0];};
function recommend(state,k=state.method){ // → {mv, sh, why}
  const others=methodsOf(state).filter(x=>x!==k).map(x=>basePick(state,x).t); // 다른 방법이 고른 영화는 피함
  const list=candidates(state,k).filter(m=>!others.includes(m.t));
  const pool=list.length?list:candidates(state,k).length?candidates(state,k):anyLeft();
  const mv=pool[(state.idx[k]||0)%pool.length];
  let sh=state.shows[k];
  if(!sh||sh.movie!==mv.t||sh.price>state.price) sh=state.shows[k]=defaultShow(mv.t,state.price);
  return {mv,sh,why:whyOf(state,k,mv)};
}
const methodsOf=state=>METHODS.filter(k=>k!=='text'||state.text); // 홈에서 줄글을 안 적었으면 그 추천은 없음
function whyOf(state,k,mv){ // 추천 이유 문장. 겹친 태그 최대 3개
  if(k==='text'){const q='‘'+state.text.slice(0,24)+(state.text.length>24?'…':'')+'’', hit=mv.tags?matched(mv,textTags(state.text)).slice(0,3).map(x=>TAGS[x]).join(', '):'';
    return hit?q+'에서 '+hit+' 태그를 읽어 골랐어요':q+'에서 아는 태그를 못 찾아 가까운 회차부터 골랐어요';}
  const hit=mv.tags?matched(mv,tagCount(state)).slice(0,3).map(x=>TAGS[x]).join(', '):'';
  if(serenDir(state)>0) return '고른 영화와 비슷하면서 새로운 영화예요'+(hit?'. '+hit+' 태그가 겹쳐요':''); // 의외성 쪽으로 고른 영화는 이 문장으로 시작 (채은 결정 11/3)
  const g=(SCREENINGS[mv.t]?.genre||'').split(',')[0].trim();
  return hit?'고른 영화들과 '+hit+' 태그가 겹치는 영화예요':'고른 영화들과 분위기가 닮은 '+(g||'영화')+'예요';
}
