import { test } from 'node:test';
import assert from 'node:assert/strict';
let createRateLimiter;
try { ({ createRateLimiter } = await import('./rate-limit.mjs')); } catch (error) { if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error; }
test('durable request limiter is available', () => assert.equal(typeof createRateLimiter, 'function'));
const options = { skip: !createRateLimiter };
const key = 'sb_secret_fake_test_only';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SECRET_KEYS: JSON.stringify({ default: key }) };
const req = headers => new Request('https://example.supabase.co/functions/v1/recommend', { headers: { 'cf-connecting-ip': '203.0.113.7', ...headers } });
const limiter = extra => createRateLimiter({ env: name => env[name], ...extra });

test('managed IP is HMACed, forwarded spoofing is ignored, and only hash reaches service RPC', options, async () => {
  const sent = [];
  const take = limiter({ fetchImpl: async (url, init) => { sent.push({ url, init }); return Response.json({ allowed: true }); } });
  assert.deepEqual(await take(req()), { allowed: true });
  await take(req({ 'x-forwarded-for': '198.51.100.2', 'x-real-ip': '198.51.100.3' }));
  await take(req({ 'cf-connecting-ip': '203.0.113.8' }));
  const payloads = sent.map(call => JSON.parse(call.init.body));
  assert.match(payloads[0].p_visitor_hash, /^[a-f0-9]{64}$/);
  assert.equal(payloads[0].p_visitor_hash, payloads[1].p_visitor_hash);
  assert.notEqual(payloads[0].p_visitor_hash, payloads[2].p_visitor_hash);
  assert.equal(Object.keys(payloads[0]).length, 1);
  assert.equal(sent[0].url, env.SUPABASE_URL + '/rest/v1/rpc/cp_take_recommendation_slot');
  assert.equal(sent[0].init.headers.apikey, key);
  assert(!('Authorization' in sent[0].init.headers), 'opaque secret keys are not JWTs');
  assert(!sent[0].init.body.includes('203.0.113.7'));
});
test('IPv6 canonical forms share a quota and ambiguous or absent client IP fails closed', options, async () => {
  const hashes = [];
  const take = limiter({ fetchImpl: async (_, init) => { hashes.push(JSON.parse(init.body).p_visitor_hash); return Response.json({ allowed: true }); } });
  await take(req({ 'cf-connecting-ip': '2001:db8::1' }));
  await take(req({ 'cf-connecting-ip': '2001:0DB8:0:0:0:0:0:1' }));
  assert.equal(hashes[0], hashes[1]);
  for (const value of ['', 'unknown', '1.2.3.999', '203.0.113.7,198.51.100.2', '203.0.113.7:1234']) {
    await assert.rejects(take(req({ 'cf-connecting-ip': value })));
  }
  assert.equal(hashes.length, 2, 'No reservation for unavailable managed IP');
});
test('only valid reservation results are accepted and errors/timeouts never fail open', options, async () => {
  for (const value of [{ allowed: false, code: 'VISITOR_MINUTE_LIMIT', retry_after: 42 }, { allowed: false, code: 'VISITOR_DAY_LIMIT', retry_after: 600 }, { allowed: false, code: 'GLOBAL_DAY_LIMIT', retry_after: 600 }]) {
    const out = await limiter({ fetchImpl: async () => Response.json(value) })(req());
    assert.deepEqual(out, { allowed: false, code: value.code, retryAfter: value.retry_after });
  }
  for (const value of [{}, [], null, { allowed: true, code: 'GLOBAL_DAY_LIMIT' }, { allowed: false, code: 'OTHER', retry_after: 1 }, { allowed: false, code: 'VISITOR_DAY_LIMIT', retry_after: -1 }]) {
    await assert.rejects(limiter({ fetchImpl: async () => Response.json(value) })(req()));
  }
  await assert.rejects(limiter({ fetchImpl: async () => new Response('private database error', { status: 500 }) })(req()));
  await assert.rejects(limiter({ timeoutMs: 5, fetchImpl: () => new Promise(() => {}) })(req()));
});
test('missing service credentials and cancelled requests cannot reserve a slot', options, async () => {
  for (const settings of [{}, { ...env, SUPABASE_SECRET_KEYS: '{' }, { ...env, SUPABASE_URL: '' }]) {
    await assert.rejects(limiter({ env: name => settings[name], fetchImpl: () => assert.fail('no request with invalid config') })(req()));
  }
  const controller = new AbortController(); controller.abort();
  await assert.rejects(limiter({ fetchImpl: () => assert.fail('cancelled reservation') })(req(), { signal: controller.signal }));
});
