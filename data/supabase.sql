-- 씨네픽 계정 저장 (닉네임 + PIN 4자리, 설문과 마이페이지 값)
-- 쓰는 법: Supabase 프로젝트 → SQL Editor에 이 파일 전체를 붙여넣고 Run. 여러 번 돌려도 됨
-- 브라우저는 users 표를 직접 못 읽고(RLS 켜고 정책 없음) 아래 함수 4개만 부름. PIN은 해시로만 저장
-- 앱 쪽: movie-reco/app.js의 rpc(), 주소와 키는 movie-reco/data/config.js (GitHub에는 secret으로)

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.users (
  nickname   text primary key check (nickname ~ '^[가-힣a-zA-Z0-9_]{2,12}$'),
  pin_hash   text not null,
  data       jsonb not null default '{}' check (pg_column_size(data) < 8192),  -- {mbti, picked, price, disc}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.users enable row level security;

-- 있는 닉네임인지 (로그인인지 가입인지 가르는 데 씀)
create or replace function public.cp_exists(p_nick text) returns boolean
language sql security definer set search_path = '' as $$
  select exists (select 1 from public.users where nickname = p_nick);
$$;

-- 가입. 이미 있는 닉네임이면 false
create or replace function public.cp_signup(p_nick text, p_pin text) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  if p_pin !~ '^[0-9]{4}$' then return false; end if;
  insert into public.users (nickname, pin_hash)
  values (p_nick, extensions.crypt(p_pin, extensions.gen_salt('bf')))
  on conflict do nothing;
  return found;
end $$;

-- 로그인. PIN이 맞으면 저장된 값(없으면 {}), 틀리면 null
create or replace function public.cp_login(p_nick text, p_pin text) returns jsonb
language sql security definer set search_path = '' as $$
  select data from public.users
  where nickname = p_nick and pin_hash = extensions.crypt(p_pin, pin_hash);
$$;

-- 저장. PIN이 맞을 때만 보낸 칸을 덮어씀 (안 보낸 칸은 그대로)
create or replace function public.cp_save(p_nick text, p_pin text, p_data jsonb) returns boolean
language plpgsql security definer set search_path = '' as $$
begin
  update public.users set data = data || (p_data - 'pin'), updated_at = now()
  where nickname = p_nick and pin_hash = extensions.crypt(p_pin, pin_hash);
  return found;
end $$;

revoke all on function public.cp_exists(text), public.cp_signup(text, text), public.cp_login(text, text), public.cp_save(text, text, jsonb) from public;
grant execute on function public.cp_exists(text), public.cp_signup(text, text), public.cp_login(text, text), public.cp_save(text, text, jsonb) to anon, authenticated;

-- ── 기록: 추천받은 영화를 어디까지 봤는지 (앱의 logClick) ──
-- 한 줄이 행동 한 번. action: synopsis(포스터를 눌러 시놉시스를 봄), detail(지도와 예약 화면까지 감), book(예약 바로가기를 누름)
-- 보는 곳: Table Editor의 clicks(한 줄씩), clicks_summary(방식별 횟수와 사람 수)
create table if not exists public.clicks (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  action      text not null,          -- synopsis, detail, book
  session_id  text,                   -- 브라우저마다 임의 번호 (로그인 안 한 사람도 같은 사람으로 셈)
  nickname    text,                   -- 로그인한 닉네임, 게스트면 비움
  method      text,                   -- match(MBTI와 좋아하는 영화), text(줄글), budget(예산으로 고르기)
  rank        int,                    -- 몇 번째 추천이었는지 (1부터). budget은 비움
  movie_code  text,
  movie_title text,
  theater     text,
  show_date   text,                   -- 상영표 표기 그대로 (11.20)
  show_time   text,                   -- 19:30
  price       int,                    -- 그 회차 가격 (할인 반영)
  budget      int                     -- 그때 설정한 예산
);
alter table public.clicks enable row level security;

-- 기록 넣기만 함. 브라우저는 표를 읽지 못함
create or replace function public.cp_click(p jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.clicks (action, session_id, nickname, method, rank, movie_code, movie_title, theater, show_date, show_time, price, budget)
  values (left(p->>'action', 20), left(p->>'session_id', 40), left(p->>'nickname', 12), left(p->>'method', 20), (p->>'rank')::int,
          left(p->>'movie_code', 20), left(p->>'movie_title', 100), left(p->>'theater', 40), left(p->>'show_date', 10), left(p->>'show_time', 10),
          (p->>'price')::int, (p->>'budget')::int);
$$;
revoke all on function public.cp_click(jsonb) from public;
grant execute on function public.cp_click(jsonb) to anon, authenticated;

-- 행동과 방식별로 몇 번, 몇 명인지
create or replace view public.clicks_summary with (security_invoker = true) as
  select action, method, count(*) as clicks, count(distinct session_id) as people, max(created_at) as last_at
  from public.clicks group by action, method order by action, method;
