-- Shared reservations for all recommend isolates. No raw IPs or prompt content.
create schema if not exists cinepick_private;
revoke all on schema cinepick_private from public, anon, authenticated;
grant usage on schema cinepick_private to service_role;

create table if not exists cinepick_private.recommendation_requests (
  id bigint generated always as identity primary key,
  visitor_hash text not null check (visitor_hash ~ '^[a-f0-9]{64}$'),
  requested_at timestamptz not null
);
create index if not exists recommendation_requests_time_idx
  on cinepick_private.recommendation_requests (requested_at);
create index if not exists recommendation_requests_visitor_time_idx
  on cinepick_private.recommendation_requests (visitor_hash, requested_at);
alter table cinepick_private.recommendation_requests enable row level security;
revoke all on cinepick_private.recommendation_requests from public, anon, authenticated;
grant select, insert, delete on cinepick_private.recommendation_requests to service_role;
grant usage on sequence cinepick_private.recommendation_requests_id_seq to service_role;

-- Private clock-injected core; only the service role can execute it.
-- The public RPC never accepts client time and passes NULL for database wall time.
create or replace function cinepick_private.reserve_recommendation(p_visitor_hash text, p_at timestamptz)
returns jsonb
language plpgsql volatile security invoker
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  v_now timestamptz;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_global integer;
  v_daily integer;
  v_minute integer;
  v_oldest timestamptz;
  v_retry integer;
begin
  if p_visitor_hash is null or p_visitor_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'Invalid visitor identifier';
  end if;

  -- One transaction lock guards checking and inserting, including across isolates.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cinepick:recommend-limits:v1', 0));
  v_now := coalesce(p_at, pg_catalog.clock_timestamp());
  v_day_start := pg_catalog.date_trunc('day', v_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  v_day_end := v_day_start + interval '24 hours';
  v_retry := greatest(1, ceil(extract(epoch from v_day_end - v_now))::integer);

  delete from cinepick_private.recommendation_requests where requested_at < v_day_start - interval '24 hours';
  select count(*) into v_global from cinepick_private.recommendation_requests
    where requested_at >= v_day_start and requested_at < v_day_end;
  if v_global >= 300 then
    return pg_catalog.jsonb_build_object('allowed', false, 'code', 'GLOBAL_DAY_LIMIT', 'retry_after', v_retry);
  end if;

  select count(*) filter (where requested_at >= v_day_start and requested_at < v_day_end),
         count(*) filter (where requested_at > v_now - interval '60 seconds'),
         min(requested_at) filter (where requested_at > v_now - interval '60 seconds')
    into v_daily, v_minute, v_oldest
    from cinepick_private.recommendation_requests where visitor_hash = p_visitor_hash;
  if v_daily >= 20 then
    return pg_catalog.jsonb_build_object('allowed', false, 'code', 'VISITOR_DAY_LIMIT', 'retry_after', v_retry);
  end if;
  if v_minute >= 5 then
    return pg_catalog.jsonb_build_object('allowed', false, 'code', 'VISITOR_MINUTE_LIMIT',
      'retry_after', greatest(1, ceil(extract(epoch from v_oldest + interval '60 seconds' - v_now))::integer));
  end if;

  insert into cinepick_private.recommendation_requests(visitor_hash, requested_at) values (p_visitor_hash, v_now);
  return pg_catalog.jsonb_build_object('allowed', true);
end;
$$;
revoke all on function cinepick_private.reserve_recommendation(text, timestamptz) from public, anon, authenticated;
grant execute on function cinepick_private.reserve_recommendation(text, timestamptz) to service_role;

create or replace function public.cp_take_recommendation_slot(p_visitor_hash text)
returns jsonb
language sql volatile security invoker
set search_path = ''
as $$
  select cinepick_private.reserve_recommendation(p_visitor_hash, null::timestamptz);
$$;
revoke all on function public.cp_take_recommendation_slot(text) from public, anon, authenticated;
grant execute on function public.cp_take_recommendation_slot(text) to service_role;
notify pgrst, 'reload schema';
