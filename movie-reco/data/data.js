// 샘플 데이터. 로드 순서: data/data.js → data/schedule.js → reco.js → app.js
// MOVIES 추천 후보 · PICKS 취향 고르기 풀 · PLACES 지도 장소
// 샘플 추천 후보: 멀티플렉스와 독립영화관에서 다 트는 상영작. 포스터는 posters/now/영화코드.jpg (없으면 TMDB)
const MOVIES=[
  {t:'룩백',img:'posters/now/20265062.jpg'},
  {t:'흐르는 여정',img:'posters/now/20246365.jpg'},
  {t:'트레인스포팅',img:'posters/now/19970084.jpg'},
  {t:'이성과 감성',img:'posters/now/20266747.jpg'},
  {t:'아사코',img:'posters/now/20181200.jpg'}
];

// ── 재밌게 본 영화 고르기용 풀 (30편). 앞 12편이 첫 화면 ──
// 포스터: posters/<f>.jpg (download-posters.bat로 받음), 파일이 없으면 TMDB 주소로 대체
const TMDB='https://image.tmdb.org/t/p/w342';
const PICKS=[
  {t:'기생충',f:'parasite',p:'/jjHccoFjbqlfr4VGLVLT7yek0Xn.jpg',tags:["comedy","suspense","family","slackers","teacher"]},
  {t:'서울의 봄',f:'12-12-the-day',p:'/ukVVnY9ovwl78WE5KndcpA6SnAm.jpg',tags:["war","action","suspense","based on true story","rebellion"]},
  {t:'파묘',f:'exhuma',p:'/tw0i3kkmOTjDjGFZTLHKhoeXVvA.jpg',tags:["horror","suspense","mystery","ghosts","weird"]},
  {t:'범죄도시2',f:'the-roundup',p:'/9XkAF2pl2uliiuAORaWTgPmr6zG.jpg',tags:["crime","action","suspense","vietnam war","police investigation"]},
  {t:'좀비딸',f:'zombie-daughter',p:'/aASLRiO8p9xLIvG9EHXSyZ71sPl.jpg',tags:["comedy","zombie","family","father daughter relationship","drama"]},
  {t:'라라랜드',f:'la-la-land',p:'/ad9ndytwOckyShSc0A6tx1rZRkW.jpg',tags:["music","romance","comedy","jazz","dreams"]},
  {t:'인터스텔라',f:'interstellar',p:'/gDN2NWtHbs8ZWEBQM8Dh5OVXdb4.jpg',tags:["sci fi","adventure","space","father daughter relationship","time travel"]},
  {t:'어바웃 타임',f:'about-time',p:'/cLfuuK1Y5FjX1xXDrrEa9ppnKuy.jpg',tags:["romance","comedy","fantasy","family","london"]},
  {t:'더 퍼스트 슬램덩크',f:'first-slam-dunk',p:'/coiJrdXAXuBkSGDvp9bZ7mkuU6E.jpg',tags:["animation","comedy","sports","teen movie","romance","feel-good"]},
  {t:'스즈메의 문단속',f:'suzume',p:'/95cnAy1nqjoEev1YkaXrSf0NDa1.jpg',tags:["animation","art house","adventure","fantasy","action","catastrophe","travel"]},
  {t:'벌새',f:'house-of-hummingbird',p:'/dWqvNwMkxTWUqClUdR2Xr30Xla4.jpg',tags:["art house","independent film","family","teacher","memory","coming of age","teen movie"]},
  {t:'퍼펙트 데이즈',f:'perfect-days',p:'/tD5njVBxiDBEPmBiPOSnmP6AmNt.jpg',tags:["art house","japan","working class","character study","solitude","drama"]},
  {t:'헤어질 결심',f:'decision-to-leave',p:'/rXEJ28XDQsogIGqwVEgwM2oDdpl.jpg',tags:["romance","mystery","suspense","police investigation","death"]},
  {t:'엑시트',f:'exit',p:'/7GTwjMaEVLbDBkg6McEizHTH1PF.jpg',tags:["action","comedy","catastrophe","mountain climbing","slackers"]},
  {t:'대도시의 사랑법',f:'love-in-the-big-city',p:'/vn2qtaU5x4x6R54hFweigLE8C4M.jpg',tags:["romance","based on a book","friendship","homophobia","drama"]},
  {t:'왕과 사는 남자',f:'wanggwa-saneun-namja',p:'/kkJB3SeUJp7Y0IXXLkv5QZHJGkH.jpg',tags:["historical","based on true story","drama","small town"]},
  {t:'리틀 포레스트',f:'little-forest',p:'/adoiOpcuBUKeEqfzLqY47VBZN86.jpg',tags:["friendship","feel-good","small town","based on a comic","japan"]},
  {t:'탑건: 매버릭',f:'top-gun-maverick',p:'/jeqXUwNilvNqNXqAHsdwm5pEfae.jpg',tags:["action","sequel","war","military","drama"]},
  {t:'오펜하이머',f:'oppenheimer',p:'/jpD6z9fgNe7OqsHoDeAWQWoULde.jpg',tags:["war","suspense","historical","based on true story","biographical"]},
  {t:'에브리씽 에브리웨어 올 앳 원스',f:'everything-everywhere',p:'/dd29Kt2p2voyP2sB6p3jC36A7ce.jpg',tags:["art house","action","adventure","sci fi","family","divorce"]},
  {t:'패스트 라이브즈',f:'past-lives',p:'/5igEts2tRTgUd2gz0uuldAx0tcD.jpg',tags:["romance","new york","memory","friendship","independent film"]},
  {t:'위키드',f:'wicked',p:'/mCB6biaBEafLGbs1eTImqlOgZj9.jpg',tags:["fantasy","music","romance","dancing","bullying"]},
  {t:'듄: 파트 2',f:'dune-part-two',p:'/8AsDR2o5AC3V8Jmj6JH6cpta7dz.jpg',tags:["adventure","sci fi","action","destiny","desert"]},
  {t:'서브스턴스',f:'the-substance',p:'/oUkeyrXvGUEylOQtlYMv9esNRiu.jpg',tags:["art house","horror","suspense","sci fi","dark humor","absurd"]},
  {t:'인사이드 아웃 2',f:'inside-out-2',p:'/x2BHx02jMbvpKjMvbf8XxJkYwHJ.jpg',tags:["animation","adventure","family","comedy","sequel","witty"]},
  {t:'주토피아 2',f:'zootopia-2',p:'/ib6v6qUXzez1x2qIOLN7C0yJNPQ.jpg',tags:["animation","comedy","adventure","family","snakes","animals"]},
  {t:'귀멸의 칼날: 무한성편',f:'infinity-castle',p:'/a6wK0b9cIEnpu1og37ZyBah0Bv6.jpg',tags:["animation","action","fantasy","supernatural","friendship","sequel"]},
  {t:'남매의 여름밤',f:'moving-on',p:'/6LQ1VQAaXskx59PRzG3yHDTQ4Mo.jpg',tags:["art house","independent film","family","childhood","teen movie","family drama","drama"]},
  {t:'소공녀',f:'microhabitat',p:'/wOHA475h4iV1dXgDhoYHXdcnSSo.jpg',tags:["art house","independent film","romance","homeless","drama"]},
  {t:'괴물',f:'monster-2023',p:'/7KEoTrMxLQILdhdcoQ2JGh8dilX.jpg',tags:["art house","suspense","mystery","drama","friendship","school"]}
];
// 상영표(극장, 회차, 가격)는 data/schedule.js (KOBIS에서 자동 생성)
// ── 지도에 찍을 장소. 범위는 마포구, 서대문구만(홍대, 연남, 신촌, 이대, 연희). 광화문 등 그 밖은 넣지 않음 ──
// 좌표: 데시스/문화_영화상영관.csv(영화상영관 인허가 데이터)의 좌표정보(X,Y)를 EPSG:5174 → 위경도로 변환한 값
// ponytail: 영화 카페는 예시 위치. 실제 장소 정해지면 좌표 교체. 가 본 곳(visited)은 로그인 기록으로 바꿀 자리
const PLACES=[
  {n:'CGV 홍대',cat:'multi',ll:[37.55643,126.92276],label:'CGV 홍대'},
  {n:'메가박스 홍대',cat:'multi',ll:[37.55607,126.92209]},
  {n:'롯데시네마 홍대입구',cat:'multi',ll:[37.55733,126.92531]},
  {n:'CGV 연남',cat:'multi',ll:[37.55767,126.92590]},
  {n:'상상마당 시네마',cat:'indie',ll:[37.55100,126.92103],label:'상상마당 · 예약 11/2',hot:true},
  {n:'인디스페이스',cat:'indie',ll:[37.55719,126.92476]},
  {n:'라이카시네마',cat:'indie',ll:[37.56517,126.93093],label:'라이카 · 후기 1',visited:true},
  {n:'아트하우스 모모',cat:'indie',ll:[37.56256,126.94745],label:'아트하우스 모모'},
  {n:'필름포럼',cat:'indie',ll:[37.56413,126.94452]},
  {n:'영화 카페',cat:'culture',ll:[37.56030,126.92380],label:'영화 카페'}
];

// ── 나들이: 마포구 영화 관련 문화공간 (홈 나들이, 나들이 시트, 지도 크게의 문화공간 핀) ──
// c: cafe 영화 카페, space 문화공간
// 위치(ll), 주소, 영업시간, 가까운 역: 카카오맵 장소 정보 기준(2026-10-31 확인). 영업시간은 바뀔 수 있음
// url: 네이버 지도 공유 링크. pin: 지도 크게에 있는 핀 이름(극장이라 이미 핀이 있으면 그 이름)
const OUTINGS=[
  {c:'cafe',n:'씨네마포',pin:'씨네마포',area:'상수',near:'상수역 1번 출구 도보 6분',ll:[37.54863,126.91932],
   m:'영화가 종일 상영되는 카페',d:'스크린에서 영화가 내내 상영되고, 영화 굿즈와 책, 음반, 문구도 팔아요.',
   h:'수~일 15:00~19:00 (월, 화 휴무)',a:'마포구 독막로9길 3-3 1층',url:'https://naver.me/Gdym4EPS'},
  {c:'cafe',n:'포로토 커피',pin:'포로토커피',area:'신수',near:'대흥역 4번 출구 도보 5분',ll:[37.54886,126.93860],
   m:'영화 포스터로 꾸민 카페',d:'일반 카페지만 가게 안이 영화 포스터로 꾸며져 있어요.',
   h:'매일 10:00~18:00',a:'마포구 광성로6길 22 1층',url:'https://naver.me/5kP8x2ZP'},
  {c:'cafe',n:'만월다방 시네마',pin:'만월다방 시네마',area:'서교',near:'상수역 2번 출구 도보 7분',ll:[37.55113,126.92354],
   m:'스크린이 있는 카페',d:'스크린이 있는 레트로 카페예요. 시네마룸에서 영화를 볼 수 있어요.',
   h:'매일 11:00~23:00',a:'마포구 와우산로 76 2층',url:'https://naver.me/xSBcosb2'},
  {c:'space',n:'KT&G 상상마당 시네마',pin:'상상마당 시네마',area:'서교',near:'상수역 1번 출구 도보 9분',ll:[37.55102,126.92104],
   m:'독립예술영화관이 있는 문화공간',d:'독립예술영화관(최대 76석)에 전시, 공연까지 한 건물에 모인 복합 문화공간이에요.',
   h:'화~일 10:00~22:00 (월 휴무)',a:'마포구 어울마당로 65 지하4층',url:'https://naver.me/xprAwngG'}
];
