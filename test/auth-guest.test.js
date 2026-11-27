const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');
const jwt = require('jsonwebtoken');

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return 'http://127.0.0.1:' + server.address().port;
}

test('sign-up creates a linked account, acts on database errors and denies anonymous private requests', async t => {
  let accountActive = true;
  let currentRole = 'medecin';
  let lastProfile;
  let user;
  let failLookup = false;
  let rejectAccount = false;
  let cleanup = 0;
  let calls = 0;
  const database = createServer(async (req, res) => {
    calls++;
    const url = new URL(req.url, 'http://localhost');
    const table = url.pathname.split('/').at(-1);
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET' && table === 'users') {
      if (failLookup) {
        res.statusCode = 401;
        return res.end(JSON.stringify({ code: '42501', message: 'test database rejection' }));
      }
      if (url.searchParams.get('id')) {
        return res.end(JSON.stringify(accountActive ? [{ role: currentRole, session_version: 0 }] : []));
      }
      return res.end('[]');
    }
    if (req.method === 'DELETE' && table === 'medecins') {
      cleanup++;
      res.statusCode = 204;
      return res.end();
    }
    let text = '';
    for await (const chunk of req) text += chunk;
    const record = JSON.parse(text || '{}');
    if (req.method === 'POST' && table === 'medecins') {
      lastProfile = record;
      res.statusCode = 201;
      return res.end(JSON.stringify({ id: 'test-profile' }));
    }
    if (req.method === 'POST' && table === 'users') {
      if (rejectAccount) {
        res.statusCode = 409;
        return res.end(JSON.stringify({ code: '23505', message: 'test duplicate' }));
      }
      user = record;
      const { password_hash, ...publicUser } = record;
      res.statusCode = 201;
      return res.end(JSON.stringify(publicUser));
    }
    res.statusCode = 500;
    res.end('{"message":"unexpected test request"}');
  });
  process.env.SUPABASE_URL = await listen(t, database);
  process.env.SUPABASE_SERVICE_KEY = 'test-only';
  process.env.JWT_SECRET = 'test-only-signing-secret';
  const app = require('../api/server');
  const base = await listen(t, createServer(app));
  const payload = { username: 'doctor-test', role: 'medecin', password: 'test-password', nom: 'Test', prenom: 'Doctor', email: 'doctor@example.invalid', profile: { nom: 'Cabinet test' } };
  const post = (body, route = '/api/auth/register') => fetch(base + route, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const home = await (await fetch(base)).text();
  assert.match(home, /id="guest-continue"/);
  assert.match(home, /class="container hidden" id="app-root"/);
  for (const [method, route] of [
    ['GET', '/api/team'], ['POST', '/api/team'], ['PATCH', '/api/team/invalid'], ['GET', '/api/ordonnances'], ['GET', '/api/pharmacies'], ['GET', '/api/laboratoires'],
    ['GET', '/api/auth/me'], ['GET', '/api/evidence/topics'],
    ['GET', '/api/evidence?topic=diabetes&mode=standard'],
    ['POST', '/api/ordonnances'], ['POST', '/api/confirmations/pharmacie'],
    ['POST', '/api/confirmations/labo'], ['POST', '/api/paiements/initier'],
    ['POST', '/api/assurances/verifier'], ['POST', '/api/notify/test'],
  ]) {
    assert.equal((await fetch(base + route, { method })).status, 401, route);
  }
  assert.equal(calls, 0);

  const bad = await post({ ...payload, prenom: '' });
  assert.equal(bad.status, 400);
  assert.equal(calls, 0);

  const saved = await post(payload);
  assert.equal(saved.status, 201);
  const result = await saved.json();
  assert.equal(jwt.verify(result.token, process.env.JWT_SECRET).sub, user.id);
  assert.equal(user.profile_id, 'test-profile');
  assert.equal(lastProfile.cabinet, 'Cabinet test');
  assert.ok(user.password_hash.startsWith('$2'));
  assert.equal(result.user.password_hash, undefined);

  const headers = { Authorization: 'Bearer ' + result.token };
  const doctorMenu = await fetch(base + '/api/evidence/topics', { headers });
  assert.equal(doctorMenu.status, 200);
  assert.equal((await doctorMenu.json()).role, 'medecin');
  assert.equal((await fetch(base + '/api/admin/users', { headers })).status, 403);
  currentRole = 'patient';
  assert.equal((await fetch(base + '/api/evidence/topics', { headers })).status, 401);
  const sessionHeaders = role => ({
    Authorization: 'Bearer ' + jwt.sign({ sub: user.id, role }, process.env.JWT_SECRET),
  });
  const patientHeaders = sessionHeaders('patient');
  assert.equal((await fetch(base + '/api/team', { headers: patientHeaders })).status, 403);
  const patientMenu = await fetch(base + '/api/evidence/topics', { headers: patientHeaders });
  assert.equal(patientMenu.status, 200);
  assert.ok((await patientMenu.json()).questions.some(question => question.id === 'patient-sleep'));
  assert.equal((await fetch(base + '/api/evidence?topic=diabetes&mode=standard', { headers: patientHeaders })).status, 400);
  const adminHeaders = sessionHeaders('super_admin');
  assert.equal((await fetch(base + '/api/admin/users', { headers: adminHeaders })).status, 401);
  currentRole = 'super_admin';
  assert.equal((await fetch(base + '/api/admin/users', { headers: adminHeaders })).status, 200);
  accountActive = false;
  assert.equal((await fetch(base + '/api/admin/users', { headers: adminHeaders })).status, 401);
  assert.equal((await fetch(base + '/api/evidence/topics', { headers: adminHeaders })).status, 401);

  failLookup = true;
  const unavailable = await post({ ...payload, username: 'outage-test' });
  assert.equal(unavailable.status, 503);
  assert.match((await unavailable.json()).error, /continuer sans compte/i);

  failLookup = false;
  rejectAccount = true;
  assert.equal((await post({ ...payload, username: 'duplicate-test' })).status, 409);
  assert.equal(cleanup, 1);

  const dbCalls = calls;
  delete process.env.JWT_SECRET;
  assert.equal((await post({ ...payload, username: 'missing-secret-test' })).status, 503);
  assert.equal(calls, dbCalls);
});
