# 씨네픽

홍대 근처 영화관 상영작 중에서 취향과 예산에 맞는 영화를 추천하는 웹앱

- 사이트: https://nnroonjji.github.io/cinepick/
- 프레임워크 없이 HTML, CSS, JS. 빌드 과정 없음
- 계정 저장은 Supabase, 배포는 GitHub Pages

이 문서는 줄글 추천에 LLM을 붙일 사람이 읽는 설명서임. 앞쪽은 프로젝트를 돌리는 법, 뒤쪽은 LLM 작업의 결과물이 어때야 하는지

## 1. 시작하기

### 받아서 열기

```
git clone https://github.com/nnroonjji/cinepick.git
```

`movie-reco/index.html`을 더블클릭하면 바로 열림. 서버가 필요하면 `movie-reco` 폴더에서 `python -m http.server` 실행 후 http://localhost:8000



Supabase 키를 따로 받을 필요는 없음. 앱이 쓰는 주소와 publishable 키는 공개용이고 배포된 사이트의 https://nnroonjji.github.io/cinepick/data/config.js 에 그대로 있음

### 내 PC에서 Supabase에 붙이기 (선택)

`movie-reco/data/config.example.js`를 같은 폴더에 `config.js`로 복사하고, [위 주소](https://nnroonjji.github.io/cinepick/data/config.js)의 내용을 그대로 넣음. `config.js`는 git에 올라가지 않음. 이 파일이 없으면 계정이 그 브라우저에만 저장되고 나머지는 똑같이 동작함

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

만드는 방법은 맡김. 아래는 다 됐을 때 어떻게 동작해야 하는지와 지켜야 하는 것

### 다 됐을 때의 모습

홈 화면에서 글을 적어 보내면

- LLM이 적은 글과 상영작 시놉시스를 보고 어울리는 영화 3편을 고름
- 추천 화면에 그 3편이 LLM이 고른 순서대로 나옴 (추천 화면은 원래 3편을 넘겨 보는 구조. `app.js`의 `RECO_N=3`)
- 편마다 추천 이유 자리에 LLM이 쓴 한 줄 이유가 나옴
- 3편 모두 지금 예산 안에 회차가 남아 있는 상영작임
- 기다리는 동안 화면에 기다리는 표시가 보임

쓸 수 있는 재료

- 시놉시스는 이미 앱에 있음: `SCREENINGS[제목].plot` (가운데 길이 200자쯤, 없는 영화도 몇 편 있음). 같은 자리에 `code`(영화코드), `genre`도 있음
- 예산 안에 회차가 남은 상영작 목록은 `reco.js`의 `candidates(state,'text')`가 걸러 줌
- Supabase를 부르는 방식은 `app.js`의 `rpc()` 참고. Edge Function도 `apikey` 머리에 publishable 키를 실어 부르면 됨 (Supabase 문서 기준. 실제로 불러 본 것은 아님)

### 지켜야 하는 것

- **LLM API 키를 저장소나 브라우저 코드에 넣지 않음.** 저장소가 공개이고, 브라우저 코드는 누구나 볼 수 있음. LLM은 Supabase Edge Function에서 부르고 키는 그 함수의 secret에만 둠
- Supabase의 secret 키(`sb_secret_`, `service_role`)도 어디에도 넣지 않음
- LLM이 후보에 없는 영화를 고르면 버림. LLM은 없는 영화를 지어낼 수 있음
- LLM이 실패하거나, 너무 늦거나, 3편을 다 못 채우면 남은 자리는 지금의 낱말 찾기 방식으로 채움. LLM이 죽어도 추천은 나와야 함
- `config.js` 없이 파일을 더블클릭해서 열었을 때는 LLM 없이 지금처럼 동작함
- Edge Function은 누구나 부를 수 있는 주소가 되므로 받는 글 길이와 영화 수를 함수 안에서 제한함
- Edge Function 코드는 저장소의 `supabase/functions/`에도 올려 둠. 안 그러면 코드가 Supabase 안에만 남음
- `node reco.test.js`가 계속 통과해야 함

### 다 됐는지 확인

- 낱말 찾기로는 못 읽던 글(예: 머리 비우고 볼 수 있는 거)에서 어울리는 영화 3편과 이유가 나옴
- 예산을 5,000원처럼 낮게 잡아도 예산 밖 영화가 나오지 않음
- Edge Function을 꺼 둔 상태에서도 추천이 나옴
- `config.js` 없이 더블클릭으로 열어도 줄글 추천이 예전처럼 나옴

주소 끝에 `?now=2026-11-20T10:00`처럼 붙이면 그 시각 기준 상영표로 볼 수 있음

## 5. 계정 저장 (참고)

닉네임과 PIN 4자리로 가입하고, 설문 값(MBTI, 고른 영화, 예산)과 마이페이지 할인 조건이 Supabase `users` 표에 저장됨. 브라우저는 표를 직접 못 읽고 `data/supabase.sql`의 함수 4개(`cp_exists`, `cp_signup`, `cp_login`, `cp_save`)만 부름. LLM 작업에서 이 부분을 바꿀 일은 없음
