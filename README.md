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
| `movie-reco/data/schedule.js` | 상영표, 극장, 상영작 정보 (자동 생성) |
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

지금의 `textTags`는 글에서 태그 화면 이름이나 `TEXT_WORDS` 표의 낱말을 그대로 찾는 방식임. 그래서 표에 없는 표현(예: 머리 비우고 볼 수 있는 거)은 태그를 못 읽고, 그때는 가까운 회차 순으로 추천함. LLM이 필요한 곳이 여기

## 4. LLM 붙이기

### 할 일 한 줄 요약

적은 글을 LLM에 보내 `TAGS`에 있는 태그 중 어울리는 것을 골라 받고, 그 결과를 `textTags` 자리에 넣기. 순위 매기기와 이유 문장은 지금 코드가 그대로 함

LLM에게 영화를 직접 고르게 하지 않고 태그만 고르게 하는 이유

- 예산과 회차 거르기, 순위, 이유 문장이 이미 태그 기준으로 만들어져 있어서 바꿀 곳이 한 군데임
- LLM이 목록에 없는 영화나 태그를 지어내도 `TAGS`에 있는 것만 남기면 걸러짐

### 지켜야 하는 것

- **LLM API 키를 저장소나 브라우저 코드에 넣지 않음.** 저장소가 공개이고, 브라우저 코드는 누구나 볼 수 있음. 키는 Supabase Edge Function의 secret에만 둠
- Supabase의 secret 키(`sb_secret_`, `service_role`)도 어디에도 넣지 않음
- LLM 호출이 실패하거나 늦으면 지금의 낱말 찾기로 넘어가게 함. LLM이 죽어도 추천은 나와야 함
- `node reco.test.js`가 계속 통과해야 함

### 순서

**1. Edge Function 만들기**

Supabase Edge Function 하나를 만듦 (이름 예: `text-tags`). 하는 일은 이것뿐임

- 받는 것: `{ "text": "적은 글", "tags": { "태그": "화면 이름", ... } }`
- 하는 일: LLM에 글과 태그 목록을 주고 어울리는 태그를 최대 5개쯤 고르게 함
- 돌려주는 것: `{ "tags": ["love story", "feel-good"] }`

태그 목록을 함수 안에 적어 두지 않고 요청으로 받는 이유는 `TAGS`가 매일 바뀔 수 있어서임

같이 챙길 것

- 브라우저에서 부르므로 CORS 응답 머리(`Access-Control-Allow-Origin` 등)와 `OPTIONS` 요청 처리가 있어야 함
- LLM 키는 `supabase secrets set`으로 넣고 함수 안에서 환경변수로 읽음
- 누구나 부를 수 있는 주소가 되므로 글 길이를 제한함 (예: 200자). 길이 제한이 없으면 남이 긴 글을 계속 보내 사용량을 다 쓸 수 있음
- LLM 응답은 JSON으로만 받게 하고, 파싱이 안 되면 빈 목록을 돌려줌

**2. 앱에서 부르기**

`textTags`는 추천을 계산하는 동안 여러 번, 기다림 없이 불림. 그래서 LLM은 글을 보낼 때 한 번만 부르고 결과를 `state`에 넣어 두는 쪽이 고칠 곳이 제일 적음

- `app.js`의 `searchForm` submit에서: Edge Function을 부르고, 돌아온 태그 중 `TAGS`에 있는 것만 남겨 `state`에 넣은 뒤 추천 화면으로 감. 기다리는 동안 보여 줄 표시가 필요함
- `reco.js`의 `textTags`를 쓰는 두 곳(`candidates`, `whyOf`)에서: `state`에 LLM 태그가 있으면 그것을, 없으면 지금의 `textTags(state.text)`를 씀
- 부르는 주소는 `SUPABASE_URL + '/functions/v1/함수이름'`, 머리에 `apikey: SUPABASE_KEY`. `app.js`의 `rpc()`가 같은 방식으로 Supabase를 부르고 있으니 참고
- `SUPABASE_URL`이 없을 때(`config.js` 없이 파일을 더블클릭해서 열 때)는 LLM을 부르지 않고 지금 방식 그대로

Edge Function이 publishable 키만으로 불리는지, JWT 확인 설정을 꺼야 하는지는 확인해 보지 않았음. 401이 나오면 함수의 JWT 확인 설정부터 볼 것

**3. 확인**

- `node reco.test.js` 통과
- `config.js` 없이 더블클릭으로 열어 줄글 추천이 예전처럼 나오는지
- 로컬 서버와 `config.js`로 열어, 표에 없는 표현(예: 머리 비우고 볼 수 있는 거)에서 태그를 읽는지
- Edge Function을 꺼 둔 상태에서도 추천이 나오는지
- 주소 끝에 `?now=2026-11-20T10:00`처럼 붙이면 그 시각 기준 상영표로 볼 수 있음

**4. 올리기**

`main`에 push하면 끝. Edge Function은 Supabase에 따로 올리는 것이고 GitHub 배포와는 무관함

## 5. 계정 저장 (참고)

닉네임과 PIN 4자리로 가입하고, 설문 값(MBTI, 고른 영화, 예산)과 마이페이지 할인 조건이 Supabase `users` 표에 저장됨. 브라우저는 표를 직접 못 읽고 `data/supabase.sql`의 함수 4개(`cp_exists`, `cp_signup`, `cp_login`, `cp_save`)만 부름. LLM 작업에서 이 부분을 바꿀 일은 없음
