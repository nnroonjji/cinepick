# 씨네픽 추천 Edge Function

`POST /functions/v1/recommend`는 `{text,candidates:[{code,title,plot,genre}]}`를 받아 추천 순서의 `[{code,reason}]`을 반환합니다. 서버만 OpenAI Responses API를 호출합니다. 브라우저에는 기존 Supabase publishable 키만 둡니다.

## 파일과 설정

- `functions/recommend/index.ts`: Deno 진입점.
- `functions/recommend/handler.mjs`: 입력·공개 키·CORS 검증, 공급자 호출, 응답 검증.
- **`functions/recommend/rate-limit.mjs`: 방문자 식별값 HMAC과 공유 DB 예약. [5/20/300 제한·적용 순서](RATE_LIMITS.md).**
- `functions/recommend/handler.test.mjs`: 외부 연결 없는 Node 테스트. Node 24 이상을 사용합니다.
- `config.toml`: `recommend`의 `verify_jwt=false`. 앱의 닉네임/PIN 계정은 Supabase Auth JWT를 발급하지 않으므로 gateway JWT 대신 핸들러에서 프로젝트의 공개 키를 확인합니다.

| 서버 환경변수 | 값 |
| --- | --- |
| `OPENAI_API_KEY` | 필수. 프로젝트 Owner/Administrator가 Edge Function Secrets에 등록합니다. 저장소·브라우저·GitHub Pages에 넣지 않습니다. |
| `OPENAI_MODEL` | 선택. 기본 `gpt-5.4-mini`. Responses API와 strict JSON Schema를 지원하는 모델을 지정합니다. |
| `ALLOWED_ORIGINS` | 선택. 쉼표로 구분한 origin 목록. 기본은 `https://nnroonjji.github.io,http://localhost:8000,http://127.0.0.1:8000`. 값을 지정하면 기본 목록을 대체합니다. 경로나 끝 슬래시는 넣지 않습니다. |
| `SUPABASE_PUBLISHABLE_KEYS` | Supabase가 주입하는 공개 키 JSON 사전. 기본 키와 추가 공개 키를 허용합니다. |
| `SUPABASE_ANON_KEY` | Supabase가 주입하는 legacy anon 키. 호환용으로만 허용합니다. |
| **`SUPABASE_URL`, `SUPABASE_SECRET_KEYS`** | **횟수 제한용 서버 RPC에 필요합니다. 런타임이 주입한 `default` secret 키를 서버에서만 사용합니다.** |

~~서비스 역할 키, Supabase secret 키, 계정 표, PIN은 사용하지 않습니다.~~ **Supabase secret 키의 서비스 역할 권한은 서버에서만 횟수 예약 RPC에 사용합니다. 계정 표와 PIN은 사용하지 않습니다.** 불필요한 요청 필드도 공급자에게 전달하지 않습니다. 입력 문장과 후보 줄거리는 OpenAI에 전송되며 `store:false`로 요청합니다. 이는 OpenAI의 모든 로그 보관을 비활성화한다는 뜻은 아닙니다.

## 배포 전후

2026-11-17 상태: ~~키 등록, 원격 함수 배포, 실제 OpenAI 호출은 수행하지 않았습니다~~ **서버 키 등록과 `recommend` 원격 배포를 완료했습니다. 크레딧 활성화 전에는 HTTP 429 `MODEL_QUOTA_EXCEEDED`였으나, 활성화 후 실제 후보 71편으로 HTTP 200과 추천 3편을 확인했습니다. Chromium에서 실제 배포 서버를 호출해 추천 이유·모바일 카드·예산·예매·회차 연결도 검증했습니다.** 공개 GitHub Pages 프런트엔드는 아직 이 브랜치로 배포하지 않았습니다.

1. Owner/Administrator가 [씨네픽 Secrets](https://supabase.com/dashboard/project/sbmgfvesieaeccmizdzi/functions/secrets)에 `OPENAI_API_KEY`를 등록합니다.
2. Supabase CLI를 사용할 경우 설치된 버전에서 `supabase --help`, `supabase functions --help`, `supabase functions deploy --help`로 프로젝트 지정·배포 옵션을 확인합니다. 대상은 **`sbmgfvesieaeccmizdzi`**, 함수 이름은 **`recommend`**입니다. 로컬 디렉터리 식별자인 `project_id="cinepick"`를 원격 프로젝트 ref로 오인하지 마십시오.
3. ~~`index.ts`와 `handler.mjs` 두 파일 배포만으로 충분하며 SQL migration은 필요하지 않습니다.~~ **[요청 제한 SQL](migrations/20261117094106_recommend_request_limits.sql)을 먼저 적용하고, [공식 배포 절차](https://supabase.com/docs/guides/functions/deploy)에 따라 `index.ts`, `handler.mjs`, `rate-limit.mjs` 세 파일과 `config.toml` 설정을 함께 배포합니다. SQL 미적용 시 새 함수는 비용 보호를 위해 503으로 차단합니다.**
4. 함수 배포를 확인한 뒤 프런트엔드를 배포합니다. 기존 GitHub Pages workflow는 **Edge Function을 배포하지 않습니다**. 프런트엔드만 먼저 배포하면 줄글 추천은 오류 안내를 표시합니다.
5. 기존 `movie-reco/data/config.js`에 씨네픽 프로젝트 URL과 publishable 키가 있어야 합니다. 배포본은 GitHub Secrets `SUPABASE_URL`, `SUPABASE_KEY`로 이 파일을 생성합니다. 예제는 `movie-reco/data/config.example.js`입니다.
6. 허용 origin에서 0/1/2/3편, 낮은 예산, 재시도, 시간 초과를 확인하고 실제 추천 품질·지연을 평가합니다.

공개 키 검사는 사용자 인증이나 남용 방지가 아닙니다. CORS도 브라우저 밖의 호출을 차단하지 않습니다. ~~분산 rate limit·전역 사용량 제한이 없습니다.~~ **공유 Postgres 예약으로 IP별 직전 60초 5회·한국 날짜별 20회, 전체 한국 날짜별 300회를 제한하는 코드를 추가했습니다. 실제 서버 활성화에는 SQL과 Edge 재배포가 필요하며 현재 원격 미적용 상태입니다.** 실제 가격·남은 회차는 브라우저가 현재 상영표로 재검증하며, 서버는 클라이언트 후보의 진위/예산을 독립적으로 증명하지 않습니다.

## 한도와 오류

| 항목 | 한도 |
| --- | --- |
| 글 | 비어 있지 않은 문자열, 최대 1,000 UTF-16 코드 단위 |
| 후보 | 최대 200편, 중복 코드 금지 |
| 후보 필드 | 코드 32, 제목 200, 줄거리 2,000, 장르 100 UTF-16 코드 단위 |
| 요청 본문 | UTF-8 128KiB, Content-Length가 없어도 실제 수신량 검사 |
| 모델 응답 본문 | 64KiB |
| 추천 | 최대 3편, 후보 코드만, 중복·빈 이유·300자 초과 이유 제거 |
| 대기 | ~~서버 모델 요청·본문 수신 15초~~ **서버 DB 예약·모델 요청·본문 수신 전체 15초(DB 예약 자체 최대 3초)**, 브라우저 20초 |

후보 없음은 모델을 호출하지 않고 `200 []`를 반환합니다. 유효 후보가 있는데 모델의 유효 추천이 없으면 `502`입니다. 오류 본문은 `{error:{code}}`이며 공급자 오류 원문이나 키를 포함하지 않습니다.

| HTTP | 의미 |
| --- | --- |
| 400 / 413 / 415 | 입력 형식 / 본문 크기 / Content-Type 오류 |
| 401 / 403 / 405 | 공개 키 / origin / 메서드 오류 |
| 429 | `MODEL_RATE_LIMITED`: 요청량 제한(`Retry-After: 60`). `MODEL_QUOTA_EXCEEDED`: 크레딧/할당량 부족. `MODEL_SPEND_LIMIT`: 조직/프로젝트 지출·사용 한도 도달. |
| **429** | **`VISITOR_MINUTE_LIMIT` / `VISITOR_DAY_LIMIT` / `GLOBAL_DAY_LIMIT`: 5/20/300 제한. `retry_after`와 `Retry-After` 제공.** |
| 499 | 요청 취소 |
| 502 | 모델 오류·거절·미완료·응답 검증 실패 |
| 503 | 서버 키 설정 누락·잘못된 공개 키 설정. **`RATE_LIMIT_UNAVAILABLE`: 방문자 식별/DB 예약 불가로 AI 호출 차단.** |
| 504 | 모델 시간 초과 |

브라우저는 실패를 추천 성공으로 대체하지 않으며 재시도 안내를 표시합니다. HTTP 504는 시간 초과 안내로 분류합니다.

## 키 없는 검증

저장소 루트에서 실행합니다.

```powershell
node movie-reco/reco.test.js
node --test supabase/functions/recommend/handler.test.mjs supabase/functions/recommend/rate-limit.test.mjs
npm ci --prefix supabase/tests --ignore-scripts
npm --prefix supabase/tests test
node movie-reco/text-reco.browser.test.js
```

브라우저 테스트에는 Playwright/Chromium이 필요합니다. 저장소 밖 설치 경로는 `PLAYWRIGHT_MODULE`, Chromium 실행 경로는 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`로 지정합니다. 임시 포트 두 개에서 정적 앱과 API 서버를 열고 브라우저→cross-origin HTTP→실제 handler를 검증합니다. ~~외부 OpenAI 요청만 테스트 응답으로 교체~~ **외부 DB 예약과 OpenAI 요청만 대체하며, SQL 자체는 별도 PGlite 테스트로 검증**하므로 실제 키·비용이 필요하지 않습니다.

Node 테스트의 Deno 진입점 검사는 등록 코드를 모사합니다. Supabase Edge Runtime에서의 기동·gateway 통과, 실제 키 권한과 모델 품질·지연 검증을 대신하지 않습니다.

2026-11-17 원격 검증: gateway·핸들러 기동 확인, OPTIONS 204, 빈 후보 200, 잘못된 공개 키 401, 차단 origin 403, 잘못된 입력 400. 실제 상영작 후보 71편 요청과 후보 3편 진단 요청 모두 429였으며, 두 번째 요청에서 크레딧/할당량 부족을 구분했습니다. OpenAI 키 원문은 읽거나 출력하지 않았습니다. ~~OpenAI API Billing 및 해당 조직/프로젝트 한도 확인 후 다시 검증해야 합니다.~~ **크레딧 활성화 후 후보 71편 요청이 200으로 성공했습니다. 기본 클라이언트에서 약 6.5초, 로컬 원본 화면→원격 함수→실제 OpenAI→추천 카드 흐름에서 약 5.1초가 걸렸습니다. 화면에는 패터슨·원스·사랑은 낙엽을 타고가 추천 이유와 함께 표시됐고 모두 예산 10,000원 이내였으며, 카드 탐색과 예매·회차 연결에 추가 모델 호출이나 JavaScript 오류가 없었습니다. 공개 사이트의 프런트엔드 버전은 아직 이전 상태입니다.**

문서 근거: [Supabase 함수 인증](https://supabase.com/docs/guides/functions/auth), [Secret과 권한](https://supabase.com/docs/guides/functions/secrets), [함수별 설정](https://supabase.com/docs/guides/functions/function-configuration), [OpenAI 구조화 출력](https://developers.openai.com/api/docs/guides/structured-outputs).
