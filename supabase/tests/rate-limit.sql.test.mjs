import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

let db;
const visitor = 'a'.repeat(64), other = 'b'.repeat(64);
const reserve = async (key, at) => (await db.query('select cinepick_private.reserve_recommendation($1,$2::timestamptz) as result', [key, at])).rows[0].result;
before(async () => {
  db = new PGlite();
  await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
  const files = (await readdir(new URL('../migrations/', import.meta.url))).filter(file => file.endsWith('_recommend_request_limits.sql'));
  assert.equal(files.length, 1);
  await db.exec(await readFile(new URL('../migrations/' + files[0], import.meta.url), 'utf8'));
});
beforeEach(async () => {
  await db.exec('reset role;');
  const exists = (await db.query("select to_regclass('cinepick_private.recommendation_requests') as name")).rows[0].name;
  if (exists) await db.exec('truncate cinepick_private.recommendation_requests;');
});
after(async () => { await db?.close(); });

test('SQL migration creates a service-only reservation function', async () => {
  assert((await db.query("select to_regprocedure('public.cp_take_recommendation_slot(text)') as name")).rows[0].name);
});
test('sixth request is denied until the oldest of five leaves rolling 60 seconds', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await reserve(visitor, '2026-12-02T14:59:30Z')).allowed, true);
  assert.deepEqual(await reserve(visitor, '2026-12-02T14:59:59Z'), { allowed: false, code: 'VISITOR_MINUTE_LIMIT', retry_after: 31 });
  assert.deepEqual(await reserve(visitor, '2026-12-02T15:00:00Z'), { allowed: false, code: 'VISITOR_MINUTE_LIMIT', retry_after: 30 });
  assert.equal((await reserve(visitor, '2026-12-02T15:00:30Z')).allowed, true);
});
test('visitor twentieth is allowed, twenty-first denied, and KST midnight resets the day', async () => {
  for (let i = 0; i < 20; i++) assert.equal((await reserve(visitor, new Date(Date.parse('2026-12-02T14:00:00Z') + i * 61000).toISOString())).allowed, true);
  assert.deepEqual(await reserve(visitor, '2026-12-02T14:59:00Z'), { allowed: false, code: 'VISITOR_DAY_LIMIT', retry_after: 60 });
  assert.equal((await reserve(other, '2026-12-02T14:59:00Z')).allowed, true, 'A different visitor retains their daily quota');
  assert.equal((await reserve(visitor, '2026-12-02T15:00:00Z')).allowed, true);
});
test('global 300th is allowed, 301st denied; reset follows Seoul regardless of DB timezone', async () => {
  await db.exec("set time zone 'America/Los_Angeles';");
  await db.exec("insert into cinepick_private.recommendation_requests(visitor_hash,requested_at) select lpad(i::text,64,'0'),'2026-12-02T14:00:00Z'::timestamptz from generate_series(1,299) as i;");
  assert.equal((await reserve(visitor, '2026-12-02T14:59:00Z')).allowed, true);
  assert.deepEqual(await reserve(other, '2026-12-02T14:59:00Z'), { allowed: false, code: 'GLOBAL_DAY_LIMIT', retry_after: 60 });
  assert.equal((await reserve(other, '2026-12-02T15:00:00Z')).allowed, true);
});
test('denied attempts reserve no slot and two-day retention removes old hashed events', async () => {
  await db.query('insert into cinepick_private.recommendation_requests(visitor_hash,requested_at) values ($1,$2)', [other, '2026-11-29T00:00:00Z']);
  for (let i = 0; i < 5; i++) await reserve(visitor, '2026-12-02T12:00:00Z');
  assert.equal((await reserve(visitor, '2026-12-02T12:00:01Z')).allowed, false);
  assert.equal((await db.query('select count(*)::int as count from cinepick_private.recommendation_requests')).rows[0].count, 5);
});
test('anonymous/authenticated roles cannot read events or invoke public RPC', async () => {
  for (const role of ['anon', 'authenticated']) {
    await db.exec('set role ' + role);
    await assert.rejects(db.query('select * from cinepick_private.recommendation_requests'), error => error.code === '42501');
    await assert.rejects(db.query('select public.cp_take_recommendation_slot($1)', [visitor]), error => error.code === '42501');
    await db.exec('reset role;');
  }
  const rls = await db.query("select relrowsecurity from pg_class where oid='cinepick_private.recommendation_requests'::regclass");
  assert.equal(rls.rows[0].relrowsecurity, true);
  await db.exec('set role service_role;');
  assert.equal((await db.query('select public.cp_take_recommendation_slot($1) as result', [visitor])).rows[0].result.allowed, true);
});
test('reservation rejects missing or raw IP visitor identifiers', async () => {
  for (const key of [null, '', '203.0.113.5', 'x'.repeat(64)]) {
    await assert.rejects(reserve(key, '2026-12-02T12:00:00Z'), error => error.code === '22023');
  }
});

test('KST day length remains 24 hours even when database timezone crosses DST', async () => {
  await db.exec("set time zone 'America/New_York';");
  await db.exec("insert into cinepick_private.recommendation_requests(visitor_hash,requested_at) select lpad(i::text,64,'0'),'2026-03-08T14:58:00Z'::timestamptz from generate_series(1,300) as i;");
  assert.deepEqual(await reserve(other, '2026-03-08T14:59:00Z'), { allowed: false, code: 'GLOBAL_DAY_LIMIT', retry_after: 60 });
});
test('reservation transaction retains its exclusive global lock until completion', async () => {
  await db.exec('begin;');
  try {
    await reserve(visitor, '2026-12-02T12:00:00Z');
    const locks = await db.query("select count(*)::int as count from pg_locks where locktype='advisory' and mode='ExclusiveLock' and granted and pid=pg_backend_pid()");
    assert.equal(locks.rows[0].count, 1);
  } finally { await db.exec('rollback;'); }
});
test('separate handlers share SQL reservations, so concurrent sixth request starts no model call', async () => {
  const { createHandler } = await import('../functions/recommend/handler.ts');
  const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEYS: JSON.stringify({ default: 'sb_publishable_test' }), SUPABASE_SECRET_KEYS: JSON.stringify({ default: 'sb_secret_sql_test_only' }), OPENAI_API_KEY: 'fake-model-key' };
  let modelCalls = 0;
  const fetchImpl = async (url, init) => {
    if (url.endsWith('/rest/v1/rpc/cp_take_recommendation_slot')) {
      const result = await db.query('select public.cp_take_recommendation_slot($1) as result', [JSON.parse(init.body).p_visitor_hash]);
      return Response.json(result.rows[0].result);
    }
    assert.equal(url, 'https://api.openai.com/v1/responses'); modelCalls++;
    return Response.json({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ recommendations: [{ code: '1', reason: '추천 이유' }] }) }] }] });
  };
  const handlers = [createHandler({ env: key => env[key], fetchImpl }), createHandler({ env: key => env[key], fetchImpl })];
  const responses = await Promise.all(Array.from({ length: 6 }, (_, i) => handlers[i % 2](new Request(env.SUPABASE_URL + '/functions/v1/recommend', {
    method: 'POST', headers: { apikey: 'sb_publishable_test', 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.8' },
    body: JSON.stringify({ text: '따뜻한 영화', candidates: [{ code: '1', title: '영화', plot: '', genre: '' }] })
  }))));
  assert.equal(responses.filter(response => response.status === 200).length, 5);
  assert.equal(responses.filter(response => response.status === 429).length, 1);
  assert.equal(modelCalls, 5);
  const blocked = await responses.find(response => response.status === 429).json();
  assert.equal(blocked.error.code, 'VISITOR_MINUTE_LIMIT');
});
