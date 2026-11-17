# 씨네픽

홍대 근처 영화관 상영작 중에서 취향과 예산에 맞는 영화를 추천하는 웹앱

- 사이트: https://nnroonjji.github.io/cinepick/
- 프레임워크 없이 HTML, CSS, JS. 빌드 과정 없음
- 계정 저장은 Supabase, 배포는 GitHub Pages

이 문서는 줄글 추천에 LLM을 붙일 사람이 읽는 설명서임. 앞쪽은 프로젝트를 돌리는 법, 뒤쪽은 LLM 작업의 결과물이 어때야 하는지

## 1. 시작하기

### 받아서 열기

준비물은 git 하나 (https://git-scm.com 에서 설치). 테스트를 돌리려면 Node.js도 필요함

1. 코드를 둘 폴더에서 터미널을 열고 내려받음. `cinepick` 폴더가 새로 생김

   ```
   git clone https://github.com/nnroonjji/cinepick.git
   cd cinepick
   ```

2. `movie-reco/index.html`을 더블클릭하면 앱이 바로 열림. 설치하거나 빌드할 것 없음
3. 서버로 열어야 할 때(`config.js`를 넣고 Supabase에 붙일 때 권함)는 `movie-reco` 폴더에서 아래를 실행하고 http://localhost:8000 을 엶

   ```
   cd movie-reco
   python -m http.server
   ```

### 고친 것 올리기

내려받기는 누구나 되지만 올리려면 초대 메일을 수락한 뒤부터 올릴 수 있음

1. 작업을 시작하기 전에 항상 최신 코드를 먼저 받음. 다른 사람도 같은 저장소에 올리고 있음

   ```
   git pull
   ```

2. 고친 뒤 테스트를 돌려 `ok`가 나오는지 확인

   ```
   cd movie-reco
   node reco.test.js
   ```

3. 올림. 처음 올릴 때 GitHub 로그인 창이 뜨면 초대받은 계정으로 로그인

   ```
   git add -A
   git commit -m "무엇을 바꿨는지 한 줄"
   git push
   ```

`git push`가 거절되면 그사이 다른 사람이 올린 것이니 `git pull`을 한 번 하고 다시 `git push`



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
| `supabase/functions/` | ~~Edge Function 코드를 둘 자리 (아직 없음)~~ **`recommend` Edge Function과 키 없는 서버 테스트** |
| `movie-reco/data/tags.js` | 태그 이름표와 상영작별 태그 (자동 생성) |
| `data/` | 상영표와 태그를 만드는 파이썬 스크립트. LLM 작업에서는 건드릴 일 없음 |
| `data/supabase.sql` | 계정 표와 함수 |
| `.github/workflows/deploy.yml` | 매일 갱신과 배포 |

## 3. 지금 줄글 추천이 도는 방식

**2026-11-17 코드 변경: ~~브라우저의 태그로 추천 확정~~ → Supabase `recommend` 함수가 OpenAI로 순서와 이유를 결정합니다. ~~서버 키 등록·함수 배포를 완료했으나 실제 요청은 OpenAI API 크레딧/할당량 부족으로 실패했습니다.~~ 크레딧 활성화 후 실제 후보 71편으로 원격 AI 추천과 브라우저의 추천 카드·예매·회차 연결을 확인했습니다. 공개 프런트엔드 배포는 아직 하지 않았습니다. [서버 설정·배포·검증 안내](supabase/README.md)를 먼저 확인하십시오.**

홈 화면에서 글을 적어 보내면 이 순서로 감

1. `app.js`의 submit이 `TextReco.create()`의 기본 HTTP 요청을 실행하고 대기 화면을 표시함
2. `candidates(state,'text')`가 예산·회차·이미 선택한 영화 조건을 통과한 후보를 만듦. 기존 태그 점수는 후보의 입력 순서에만 남음
3. `text-reco.js`가 글과 후보의 코드·제목·줄거리·장르를 `/functions/v1/recommend`로 보냄. **모의 응답으로 성공시키지 않음**
4. 함수가 입력·공개 키를 검증하고 서버의 `OPENAI_API_KEY`로 OpenAI Responses API를 부름. 최대 세 편의 후보 코드와 이유를 검증하여 반환함
5. 브라우저가 현재 예산·할인·회차로 다시 검사하고 응답 순서와 이유를 표시함. 실패·시간 초과에는 재시도 안내, 이탈 시 요청 취소

태그는 `data/tags.js`에 있음

- `TAGS`: 태그 → 화면 이름. 예: `"love story":"로맨스"`. 지금 120개쯤이고 상영작이 바뀌면 달라짐
- `NOW_TAGS`: 영화코드 → 그 상영작에 붙은 태그 목록

`textTags`는 기존 후보 정렬의 낱말 찾기 함수로 남아 있지만 최종 추천을 결정하지 않음. **최종 선택과 이유는 LLM 응답을 사용함.**

**요청 제한 추가: 방문자(IP)별 직전 60초 5회·하루 20회, 전체 하루 300회. 일일 기준은 한국시간 자정입니다.** ~~이 제한 변경의 원격 배포는 아직 완료하지 않았습니다.~~ **2026-11-17 SQL·Edge Function 배포를 완료했습니다. 실제 요청 6개 중 AI 추천 5개 성공·초과 1개 HTTP 429 차단과 한국시간 자정 경계를 확인했습니다. [서버 적용·검증 기록](supabase/RATE_LIMITS.md)을 참고하십시오.**

## 4. LLM 연결 요구사항과 남은 배포

**구현 파일은 `supabase/functions/recommend/`와 `movie-reco/text-reco.js`입니다. 아래는 인수 조건입니다. ~~실제 모델의 성공 응답 검증은 API 크레딧/할당량 문제 해결 후 진행해야 합니다.~~ 크레딧 활성화 후 실제 모델의 성공 응답과 브라우저 흐름을 검증했습니다.**

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
- Edge Function은 `apikey` 헤더로 publishable 키를 받음. `verify_jwt=false`와 핸들러의 공개 키 확인을 함께 사용함. **~~브라우저→로컬 HTTP→같은 핸들러는 검증하며, 원격 gateway는 배포 후 검증해야 함~~ 브라우저→원격 gateway→배포된 함수→실제 OpenAI 응답 경로까지 검증 완료**

### 지켜야 하는 것

- **LLM API 키를 저장소나 브라우저 코드에 넣지 않음.** 저장소가 공개이고, 브라우저 코드는 누구나 볼 수 있음. LLM은 Supabase Edge Function에서 부르고 키는 그 함수의 secret에만 둠
- Supabase의 secret 키(`sb_secret_`, `service_role`)도 어디에도 넣지 않음
- LLM이 후보에 없는 영화를 고르면 버림. LLM은 없는 영화를 지어낼 수 있음
- LLM이 실패하거나 너무 늦으면 잠시 뒤 다시 해 달라는 안내를 보여 줌. 화면이 멈춘 채로 있으면 안 됨
- Edge Function은 누구나 부를 수 있는 주소가 되므로 받는 글 길이와 영화 수를 함수 안에서 제한함
- Edge Function 코드는 저장소의 `supabase/functions/`에도 올려 둠. 안 그러면 코드가 Supabase 안에만 남음
- `node reco.test.js`가 통과해야 함. 낱말 찾기 방식(`textTags`)을 없애면 그 테스트도 같이 고침

### 다 됐는지 확인

- 어울리는 영화 3편과 이유가 나옴
- 예산을 5,000원처럼 낮게 잡아도 예산 밖 영화가 나오지 않음
- LLM이 실패했을 때(예: Edge Function 이름을 일부러 틀리게 해서 시험) 다시 해 달라는 안내가 뜸

주소 끝에 `?now=2026-11-20T10:00`처럼 붙이면 그 시각 기준 상영표로 볼 수 있음

## 5. 계정 저장 (참고)

닉네임과 PIN 4자리로 가입하고, 설문 값(MBTI, 고른 영화, 예산)과 마이페이지 할인 조건이 Supabase `users` 표에 저장됨. 브라우저는 표를 직접 못 읽고 `data/supabase.sql`의 함수 4개(`cp_exists`, `cp_signup`, `cp_login`, `cp_save`)만 부름. LLM 작업에서 이 부분을 바꿀 일은 없음
