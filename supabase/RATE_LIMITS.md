# 추천 요청 횟수 제한

| 범위 | 제한 | 초기화 |
| --- | --- | --- |
| 방문자(IP) | 직전 60초에 5회 | 가장 오래된 요청이 60초 구간을 벗어나면 허용 |
| 방문자(IP) | 하루 20회 | 한국시간 자정 |
| 씨네픽 전체 | 하루 300회 | 한국시간 자정 |

한 번에 영화 3편을 추천받는 것을 요청 1회로 센다. 카드 이전/다음 이동은 추가 요청이 아니다. 유효한 후보가 있고 OpenAI 호출을 시작하려 할 때 DB에 한 자리를 예약한다. OpenAI 실패·시간 초과·취소는 비용이 발생할 수 있어 예약을 되돌리지 않는다. 잘못된 입력, 빈 후보, OPTIONS, 이미 제한된 요청은 예약하지 않는다.

## 저장과 동시 요청

`cinepick_private.recommendation_requests`에 HMAC 방문자 식별값과 예약 시각만 기록한다. 원문 IP, 사용자 문장, 후보 줄거리, 계정, PIN은 저장하지 않는다. 현재·직전 한국 날짜의 기록을 유지하고, 이후 예약 시 그보다 오래된 기록을 정리한다. 요청이 전혀 없으면 마지막 정리 이후 기록은 다음 요청까지 남는다.

DB 트랜잭션 advisory lock이 한도 확인과 INSERT를 함께 보호한다. 인스턴스별 메모리나 브라우저 localStorage 카운터를 사용하지 않는다. DB 시간과 `Asia/Seoul`로 일일 경계를 계산한다. 자정이 되어 일일 횟수가 초기화돼도 직전 60초 제한은 유지한다.

익명·일반 로그인 사용자는 테이블을 읽거나 RPC를 호출할 수 없다. 테이블의 RLS를 켜고, 별도의 `SECURITY DEFINER` 권한 승격 없이 service_role만 RPC와 테이블을 사용할 수 있게 한다. 시간 인자는 비공개 core 함수에만 있고 공개 RPC는 DB 시간을 사용한다.

## 방문자 식별의 전제

표준 관리형 Supabase 주소의 Cloudflare ingress가 제공하는 `CF-Connecting-IP`만 사용한다. 비어 있거나 형식이 잘못되면 AI를 호출하지 않고 503으로 차단한다. 임의 `X-Forwarded-For`, `X-Real-IP`, 브라우저 UUID로 대체하지 않는다. IPv6 표기 차이는 정규화한다.

이 식별은 로그인 인증이 아니다. 같은 와이파이/NAT 이용자는 한도를 공유하며, VPN·네트워크 변경·분산 호출을 완전히 막지 못한다. 전체 일일 300회 제한은 방문자 식별값과 별개로 공유한다. 대시보드 도메인/프록시가 바뀌면 managed IP 헤더의 보장도 다시 확인해야 한다.

방문자 HMAC은 `SUPABASE_SECRET_KEYS.default`를 서버에서만 사용한다. 이 키를 회전하면 개인 식별값이 바뀌어 기존 개인 한도가 새로 시작할 수 있지만 전체 일일 사용량은 유지된다. 키 원문은 응답·로그·저장소에 기록하지 않는다.

## 적용 순서

대상: `sbmgfvesieaeccmizdzi`, 함수: `recommend`. **main 병합이나 GitHub Pages 배포만으로 아래 서버 변경이 적용되지는 않는다.**

1. [씨네픽 SQL 편집기](https://supabase.com/dashboard/project/sbmgfvesieaeccmizdzi/sql/new)에서 [요청 제한 migration](migrations/20261117094106_recommend_request_limits.sql)을 실행한다. 기존 계정/상영표 테이블은 변경하지 않는다. 재실행해도 기존 카운터를 지우지 않는다.
2. RPC 실행 권한이 service_role만인지 확인한다. 일반 공개 키로 `cp_take_recommendation_slot`을 호출하면 거절되어야 한다.
3. Edge Functions의 기본 서버 환경변수 `SUPABASE_URL`, `SUPABASE_SECRET_KEYS` 안의 `default` secret 키가 제공되는지 확인한다. 키 원문을 브라우저 설정이나 저장소로 복사하지 않는다. 별도의 Redis 가입이나 신규 OpenAI 키는 필요하지 않다.
4. [함수 편집기](https://supabase.com/dashboard/project/sbmgfvesieaeccmizdzi/functions/recommend/code)에서 `index.ts`, `handler.mjs`, **`rate-limit.mjs`까지 세 파일**을 함께 배포한다. 기존 `verify_jwt=false`와 핸들러의 공개 키 검사를 유지한다.
5. 표준 주소에서 ~~정상 요청과 위조 `CF-Connecting-IP` 헤더를 보내도 같은 방문자로 집계되는지~~ **정상 요청이 집계되고, 위조 `CF-Connecting-IP`·`X-Forwarded-For` 헤더로 개인 한도를 우회할 수 없는지** 확인한다. 원문 IP를 응답으로 반환하거나 로그에 출력하지 않는다. 관찰한 공개 경로 검증은 향후 모든 프록시 구성의 신뢰를 보장하지 않는다.
6. AI 호출을 만들지 않는 격리된 SQL 테스트로 5/20/300 경계와 자정 초기화를 확인하고, 배포된 함수에서도 429와 `Retry-After`를 확인한다. 실제 운영 카운터를 초기화하거나 전체 300회를 소진하는 테스트는 하지 않는다.

DB/RPC가 없거나 시간 초과/응답 검증에 실패하면 **503으로 차단하고 유료 AI를 호출하지 않는다.** 따라서 SQL보다 Edge 코드를 먼저 배포하면 추천이 중단된다. RPC 예약이 커밋된 후 네트워크가 끊긴 경우에도 예약은 남을 수 있다.

## 응답과 화면

제한 응답은 HTTP 429와 `{error:{code,retry_after}}`, `Retry-After`를 반환한다. 일일 제한에서는 다음 한국시간 자정까지의 초를 반환한다.

| 코드 | 화면 |
| --- | --- |
| `VISITOR_MINUTE_LIMIT` | 1분 5회 안내와 잠시 후 재시도 |
| `VISITOR_DAY_LIMIT` | 하루 20회 안내와 한국시간 자정 이후 이용 |
| `GLOBAL_DAY_LIMIT` | 전체 하루 300회 안내와 한국시간 자정 이후 이용 |
| `RATE_LIMIT_UNAVAILABLE` (503) | 일반 오류·재시도 안내. 모델 호출 없음 |

OpenAI의 월 지출 하드 한도와 크레딧 만료는 별도 운영 설정이다. 이번 코드 변경은 결제 설정이나 월 한도를 변경하지 않는다. 하루 300회는 달러 단위의 비용 상한이 아니다. 12월 3일 이후 자동 차단하는 기능도 추가하지 않았다.

## 검증

```sh
node movie-reco/reco.test.js
node --test supabase/functions/recommend/handler.test.mjs supabase/functions/recommend/rate-limit.test.mjs
npm ci --prefix supabase/tests --ignore-scripts
npm --prefix supabase/tests test
```

SQL 테스트는 PGlite의 실제 PostgreSQL 엔진으로 실행한다. 권한/RLS·트랜잭션 잠금 보유·KST 경계·다른 DB 시간대와 DST·독립 핸들러의 공유 예약을 검사한다. PGlite는 단일 연결이므로 관리형 DB의 다중 세션 동시성/부하 검증을 대체하지 않는다. HTTP 외부 경계만 대체하며 OpenAI 유료 호출은 하지 않는다. 브라우저 회귀는 `movie-reco/text-reco.browser.test.js`와 기존 Playwright 실행 방법을 사용한다.

~~원격 SQL/Edge 변경 및 실제 제한 활성화는 아직 미확인이다.~~ **2026-11-17 한국시간 19:57 기준, 씨네픽 프로젝트에 SQL과 Edge Function을 적용하고 다음 검증을 완료했다.**

- **실제 DB: 카운터 테이블 존재·RLS 활성화·anon/authenticated의 RPC 실행 불가·service_role 실행 가능을 확인했다. 공개 키로 RPC를 호출한 HTTP 요청도 401로 거절됐다.**
- **실제 DB에서 격리된 트랜잭션으로 5/20/300 경계·한국시간 자정 초기화·자정 직후에도 유지되는 직전 60초 제한을 확인하고 롤백했다. 합성 테스트 기록은 남기지 않았고 운영 카운터도 초기화하지 않았다.**
- **실제 함수: 1개 요청 뒤 5개를 병렬로 보내 총 6개 중 AI 추천 5개 HTTP 200, 초과 1개 `VISITOR_MINUTE_LIMIT` HTTP 429를 확인했다. 차단 응답의 `Retry-After`와 JSON `retry_after`는 모두 56초였다.**
- **각 요청의 임의 `X-Forwarded-For`를 바꿔도 개인 한도를 우회하지 못했다. 위조 `CF-Connecting-IP`를 넣은 비유료 요청은 Cloudflare ingress에서 HTTP 403으로 거절됐다. 이는 해당 공개 경로에서 관찰한 거절 결과이며, 헤더 덮어쓰기나 향후 다른 프록시 경로까지 증명하지는 않는다.**
- **분당 제한 구간이 지난 뒤 로컬 미리보기에서 실제 추천 HTTP 200·추천 이유·10,000원 카드 표시·JavaScript 오류 없음을 확인했다. 유료 모델 요청을 발생시키는 20회/300회 소진 검증은 하지 않았다.**
- **서버 제한은 활성화했다. `main`은 병합하지 않았으며 공식 프런트엔드 배포도 수행하지 않았다.**

근거: [Supabase rate limiting](https://supabase.com/docs/guides/functions/examples/rate-limiting), [서버 환경변수](https://supabase.com/docs/guides/functions/secrets), [Cloudflare IP 헤더](https://developers.cloudflare.com/fundamentals/reference/http-headers/).
