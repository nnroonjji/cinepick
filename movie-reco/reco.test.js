// node reco.test.js — 추천은 예산 안 회차가 있는 영화만 골라야 함. 예산 안 영화가 하나도 없으면(5,000원) 제일 싼 상영작으로. 합친 추천은 MBTI 방향 규칙대로
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const c={location:{search:''},URLSearchParams,console}; vm.createContext(c);
for(const f of ['data/data.js','data/schedule.js','data/tags.js','reco.js']) vm.runInContext(fs.readFileSync(path.join(__dirname,f),'utf8'),c);
const R=vm.runInContext('({METHODS,NOW,PICKS,priceOf,recommend,candidates,daysOf})',c);
const minOf=t=>Math.min(...R.daysOf(t).flatMap(d=>d.s.map(x=>R.priceOf(x,d.w))));
const live=R.NOW.filter(m=>R.daysOf(m.t).length), cheapest=Math.min(...live.map(m=>minOf(m.t)));
const st=(p,mbti=['I','N','F','P'])=>({mbti,picked:{'라라랜드':1,'벌새':1},price:p,text:'잔잔한 영화',method:'match',idx:{},shows:{}});
for(let p=5000;p<=50000;p+=1000) for(const k of R.METHODS){
  const r=R.recommend(st(p),k), tag=k+' 예산 '+p+': '+r.mv.t+' '+r.sh.price+'원';
  if(live.some(m=>minOf(m.t)<=p)) assert(r.sh.price<=p,'예산 초과 '+tag);
  else assert.strictEqual(r.sh.price,cheapest,'예산 안 영화가 없으면 제일 싼 회차여야 함 '+tag);
}
// 합친 추천: 익숙한 쪽(ESTJ −3)은 겹친 점수 1위, 새로운 쪽(INFP +2)은 1위 절반 이상 풀 안에서 고름
const score=m=>{const c={}; R.PICKS.filter(p=>st(0).picked[p.t]).forEach(p=>p.tags.forEach(x=>c[x]=(c[x]||0)+1)); return m.tags.reduce((a,x)=>a+(c[x]||0),0);};
const best=Math.max(...R.candidates(st(20000),'match').map(score));
assert(best>0,'고른 영화와 겹치는 상영작이 있어야 함');
assert.strictEqual(score(R.candidates(st(20000,['E','S','T','J']),'match')[0]),best,'익숙한 쪽은 겹친 점수 1위');
assert(score(R.candidates(st(20000),'match')[0])>=best/2,'새로운 쪽은 1위 절반 이상 풀 안에서');
// 줄글: 글에서 읽은 태그(태그 이름이나 TEXT_WORDS의 말)로 점수. 한 글자 태그는 낱말 그대로나 토씨 붙은 꼴만
const T=vm.runInContext('({textTags})',c);
assert.deepStrictEqual(Object.keys(T.textTags('무서운 거 보고 싶어')),['horror']);
assert.deepStrictEqual(Object.keys(T.textTags('sf 우주 영화')).sort(),['sci fi','space']);
assert.deepStrictEqual(Object.keys(T.textTags('꿈을 다룬 섬세한 영화')),['dreams'],'섬세한의 섬은 태그가 아님');
assert.deepStrictEqual(Object.keys(T.textTags('')),[]); // vm 컨텍스트 객체는 프로토타입이 달라 {}와 바로 못 비교
const tx=t=>({...st(20000),text:t,method:'text'});
assert(R.candidates(tx('웃긴 영화 보고 싶어'),'text')[0].tags.includes('comedy'),'웃긴 → 코미디 상영작이 1위');
assert(R.recommend(tx('웃긴 영화 보고 싶어'),'text').why.includes('코미디'),'이유 문장에 읽은 태그');
assert(R.recommend(tx('asdf'),'text').why.includes('못 찾아'),'태그를 못 읽으면 그렇다고 말함');
assert(R.recommend(st(cheapest-1000),'match').why.includes('예산에 맞는 영화가 없어요'),'예산 안 영화가 없으면 이유 문장에서 알림');
// 추천 화면은 1~3위를 넘겨 봄: 순위(idx)마다 다른 영화
for(const k of R.METHODS) assert.strictEqual(new Set([0,1,2].map(i=>R.recommend({...st(20000),idx:{[k]:i}},k).mv.t)).size,3,k+' 1~3위가 서로 다른 영화');
console.log('ok');
