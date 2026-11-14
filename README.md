# 씨네픽

홍대 근처 영화관 상영작 중에서 취향과 예산에 맞는 영화를 추천하는 웹앱

- 사이트: https://nnroonjji.github.io/cinepick/
- 프레임워크 없이 HTML, CSS, JS. 빌드 과정 없음
- 계정 저장은 Supabase, 배포는 GitHub Pages

이 문서는 줄글 추천에 LLM을 붙일 사람이 읽는 설명서임. 앞쪽은 프로젝트를 돌리는 법, 뒤쪽은 LLM 작업 순서

## 1. 시작하기

### 받아서 열기

```
git clone https://github.com/nnroonjji/cinepick.git
```

`movie-reco/index.html`을 더블클릭하면 바로 열림. 서버가 필요하면 `movie-reco` 폴더에서 `python -m http.server` 실행 후 http://localhost:8000

### 채은에게 받아야 하는 것

| 무엇 | 왜 |
|---|---|
| GitHub 저장소 초대 (Collaborator) | 코드를 올리려면 필요. 내려받기만 할 때는 필요 없음 |
| Supabase 프로젝트 초대 | Edge Function을 올리고 LLM 키를 넣으려면 필요 |

Supabase 키를 따로 받을 필요는 없음. 앱이 쓰는 주소와 publishable 키는 공개용이고 배포된 사이트의 https://nnroonjji.github.io/cinepick/data/config.js 에 그대로 있음

### 내 PC에서 Supabase에 붙이기 (선택)

`movie-reco/data/config.example.js`를 같은 폴더에 `config.js`로 복사하고, 위 주소의 내용을 그대로 넣음. `config.js`는 git에 올라가지 않음. 이 파일이 없으면 계정이 그 브라우저에만 저장되고 나머지는 똑같이 동작함

### 올리면 생기는 일

- `main`에 push하면 1분쯤 뒤 실제 사이트가 바뀜. 따로 배포 명령 없음
- 올리기 전에 `movie-reco` 폴더에서 `node reco.test.js`를 돌려 `ok`가 나오는지 확인
- 매일 05:00에 상영표와 태그가 자동으로 새로 만들어져 사이트에 올라감. 그래서 `movie-reco/data/schedule.js`와 `tags.js`는 손으로 고치지 않음 (저장소에 있는 것은 예전 것이고, 사이트는 매일 새로 만든 것을 씀)

## 2. 폴더

| 위치 | 내용 |
|---|---|
| `movie-reco/index.html`, `style.css`, `app.js` | 화면 |
| `movie-reco/reco.js` | 추천 계산. 화면을 건드리지 않는 함수만 있음. LLM 작업은 주로 여기 |
| `movie-reco/reco.test.js` | 추천 테스트 |
| `movie-reco/data/data.js` | 좋아하는 영화 30편과 그 태그 |
| `movie-reco/data/schedule.js` | 상영표, 극장, 상영작 정보와 시놉시스 (자동 생성) |
| `supabase/functions/` | Edge Function 코드를 둘 자리 (아직 없음) |
| `movie-reco/data/tags.js` | 태그 이름표와 상영작별 태그 (자동 생성) |
| `data/` | 상영표와 태그를 만드는 파이썬 스크립트. LLM 작업에서는 건드릴 일 없음 |
| `data/supabase.sql` | 계정 표와 함수 |
| `.github/workflows/deploy.yml` | 매일 갱신과 배포 |

## 3. 지금 줄글 추천이 도는 방식

홈 화면에서 글을 적어 보내면 이 순서로 감

1. `app.js`의 `searchForm` submit: 적은 글을 `state.text`에 넣고 `state.method='text'`로 바꾼 뒤 추천 화면으로 감
2. `reco.js`의 `textTags(text)`: 글에서 태그를 읽어 `{태그: 1}` 꼴로 돌려줌
3. `reco.js`의 `candidates(state,'text')`: 예산 안에 회차가 남은 상영작 중에서, 읽은 태그가 많이 붙은 영화 순으로 줄 세움
4. `reco.js`의 `whyOf`: 겹친 태그로 추천 이유 문장을 만듦

태그는 `data/tags.js`에 있음

- `TAGS`: 태그 → 화면 이름. 예: `"love story":"로맨스"`. 지금 120개쯤이고 상영작이 바뀌면 달라짐
- `NOW_TAGS`: 영화코드 → 그 상영작에 붙은 태그 목록

지금의 `textTags`는 글에서 태그 화면 이름이나 `TEXT_WORDS` 표의 낱말을 그대로 찾는 방식임. 그래서 표에 없는 표현(예: 머리 비우고 볼 수 있는 거)은 태그를 못 읽고, 그때는 가까운 회차 순으로 추천함. 태그도 영화 한 편에 3~5개뿐이라 글의 분위기를 담기 어려움. 그래서 LLM은 태그를 거치지 않고 시놉시스를 보고 영화를 직접 고르게 함 (4번). 지금 방식은 LLM이 안 될 때 쓰는 대비책으로 남김

## 4. LLM 붙이기

### 할 일 한 줄 요약

적은 글과 상영작 시놉시스를 LLM에 보내 어울리는 영화 3편과 한 줄 이유를 받고, 그 3편을 줄글 추천 결과로 보여 주기

- 추천 화면은 원래 한 방법당 3편을 넘겨 보는 구조라(`app.js`의 `RECO_N=3`) 3편을 받으면 그대로 맞음
- 시놉시스는 이미 앱에 있음. `SCREENINGS[제목].plot` (KOBIS 시놉시스, 없으면 KMDb 줄거리. 가운데 길이 200자쯤, 없는 영화도 몇 편 있음)
- 예산과 회차 거르기는 지금처럼 앱이 먼저 하고, LLM은 그 안에서만 고름

### 지켜야 하는 것

- **LLM API 키를 저장소나 브라우저 코드에 넣지 않음.** 저장소가 공개이고, 브라우저 코드는 누구나 볼 수 있음. 키는 Supabase Edge Function의 secret에만 둠
- Supabase의 secret 키(`sb_secret_`, `service_role`)도 어디에도 넣지 않음
- LLM이 고른 영화가 보낸 후보 안에 있는지 앱에서 확인함. LLM은 없는 영화를 지어낼 수 있음
- LLM 호출이 실패하거나, 늦거나, 쓸 수 있는 영화가 하나도 안 돌아오면 지금의 낱말 찾기로 넘어감. LLM이 죽어도 추천은 나와야 함
- `node reco.test.js`가 계속 통과해야 함

### 순서

**1. Edge Function 만들기**

Supabase Edge Function 하나를 만듦 (이름 예: `text-pick`)

- 받는 것: `{ "text": "적은 글", "movies": [ { "code": "영화코드", "title": "제목", "genre": "장르", "plot": "시놉시스" }, ... ] }`
- 하는 일: LLM에 글과 후보 목록을 주고, 어울리는 순서로 3편과 편마다 한 줄 이유를 고르게 함
- 돌려주는 것: `{ "picks": [ { "code": "영화코드", "why": "한 줄 이유" }, ... ] }`

후보 목록을 함수 안에 두지 않고 요청으로 받는 이유는 상영작이 매일 바뀌고, 예산에 따라 후보가 달라지기 때문임

같이 챙길 것

- 영화는 제목 말고 `code`로 주고받음. 제목은 LLM이 글자를 조금씩 바꿔 돌려주는 일이 있음
- 프롬프트에 넣을 것: 후보 목록에 있는 영화만 고를 것, 3편, 이유는 한국어 한 문장으로 짧게(예: 40자 이내), 답은 정해진 JSON으로만
- LLM 응답을 JSON으로 읽지 못하면 `{ "picks": [] }`를 돌려줌
- 브라우저에서 부르므로 CORS 응답 머리(`Access-Control-Allow-Origin` 등)와 `OPTIONS` 요청 처리가 있어야 함
- 누구나 부를 수 있는 주소가 되므로 글 길이(예: 200자)와 후보 수(예: 150편)를 제한함. 제한이 없으면 남이 큰 요청을 계속 보내 사용량을 다 쓸 수 있음
- 요청 하나가 큼. 후보 100편에 시놉시스를 300자로 잘라 보내도 3만 자쯤이라, 싸고 빠른 모델을 고르고 응답이 몇 초 걸리는 것을 감안함

올리는 방법은 둘 중 하나

- 대시보드: Supabase 화면의 Edge Functions 메뉴에서 함수를 만들고 브라우저 편집기에서 바로 배포. LLM 키는 같은 메뉴의 Secrets에 넣음. 설치할 것이 없음
- CLI: PC에 Supabase CLI를 설치해 `supabase functions deploy`, 키는 `supabase secrets set`

대시보드에서 만들었더라도 완성된 함수 코드는 저장소의 `supabase/functions/함수이름/index.ts`에 복사해 올려 둠. 안 그러면 코드가 Supabase 안에만 남음

**2. 앱에서 부르기**

추천 계산(`reco.js`)은 기다림 없이 여러 번 불리는 함수들이라, LLM은 글을 보낼 때 한 번만 부르고 결과를 `state`에 넣어 두는 쪽이 고칠 곳이 제일 적음

- `app.js`의 `searchForm` submit에서
  - 후보 만들기: 예산 안에 회차가 남은 상영작. `reco.js`의 `candidates(state,'text')`가 같은 조건으로 거른 목록을 돌려주니 그 영화들에 `SCREENINGS[제목]`의 `code`, `genre`, `plot`을 붙여 보냄. `plot`은 300자쯤에서 자름
  - Edge Function을 부르고 기다리는 동안 보여 줄 표시를 띄움. 너무 늦으면(예: 8초) 끊고 지금 방식으로 넘어감
  - 돌아온 `picks` 중 보낸 후보에 있는 `code`만 남겨 `state`에 넣고 추천 화면으로 감
- `reco.js`의 `candidates(state,'text')`에서: `state`에 LLM이 고른 영화가 있으면 그 순서대로 앞에 두고, 나머지는 지금 순위대로 뒤에 붙임. 3편이 다 안 왔을 때 남은 자리가 지금 방식으로 채워짐
- `reco.js`의 `whyOf`에서: 그 영화가 LLM이 고른 것이면 LLM의 이유 문장을, 아니면 지금 문장을 씀
- 글이 바뀌면 전에 받아 둔 LLM 결과는 지움. 예산을 바꿔 후보에서 빠진 영화는 `candidates`의 예산 거르기에서 다시 걸러지게 함
- 부르는 주소는 `SUPABASE_URL + '/functions/v1/함수이름'`, 머리에 `apikey: SUPABASE_KEY`. `app.js`의 `rpc()`가 같은 방식으로 Supabase를 부르고 있으니 참고
- `SUPABASE_URL`이 없을 때(`config.js` 없이 파일을 더블클릭해서 열 때)는 LLM을 부르지 않고 지금 방식 그대로

Supabase 문서(API keys, Edge Functions auth)에 따르면 함수의 JWT 확인(`verify_jwt`, 기본으로 켜짐)은 `apikey` 머리에 실린 publishable 키를 받아 줌. 그래서 설정을 끄지 않고 위 방식 그대로 부르면 됨. 실제로 올려서 불러 본 것은 아니니 401이 나오면 이 부분부터 볼 것. 이 확인은 누가 부르는지를 가려 주지 않으므로(키가 공개라 누구나 부를 수 있음) 글 길이와 후보 수 제한은 함수 안에서 꼭 할 것

**3. 확인**

- `node reco.test.js` 통과
- `config.js` 없이 더블클릭으로 열어 줄글 추천이 예전처럼 나오는지
- 로컬 서버와 `config.js`로 열어, 낱말 찾기로는 못 읽던 글(예: 머리 비우고 볼 수 있는 거)에서 어울리는 영화 3편과 이유가 나오는지
- 예산을 5,000원처럼 낮게 잡았을 때 예산 밖 영화가 추천되지 않는지
- Edge Function을 꺼 둔 상태에서도 추천이 나오는지
- 주소 끝에 `?now=2026-11-20T10:00`처럼 붙이면 그 시각 기준 상영표로 볼 수 있음

**4. 올리기**

`main`에 push하면 끝. Edge Function은 Supabase에 따로 올리는 것이고 GitHub 배포와는 무관함

## 5. 계정 저장 (참고)

닉네임과 PIN 4자리로 가입하고, 설문 값(MBTI, 고른 영화, 예산)과 마이페이지 할인 조건이 Supabase `users` 표에 저장됨. 브라우저는 표를 직접 못 읽고 `data/supabase.sql`의 함수 4개(`cp_exists`, `cp_signup`, `cp_login`, `cp_save`)만 부름. LLM 작업에서 이 부분을 바꿀 일은 없음
