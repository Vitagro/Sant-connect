const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { once } = require('node:events');

async function listen(t, server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => server.close());
  return 'http://127.0.0.1:' + server.address().port;
}

test('recovery codes are hashed, single-use and revoke previous sessions', async t => {
  const { hash } = require('bcrypt');
  const originalPassword = 'initial-synthetic-password';
  const resetPassword = 'new-synthetic-password';
  const changedPassword = 'changed-synthetic-password';
  const row = {
    id: 'test-id', username: 'account-test', role: 'patient', is_active: true,
    password_hash: await hash(originalPassword, 12),
    session_version: 0, recovery_code_hash: null, recovery_expires_at: null,
  };
  const db = createServer(async (req, res) => {
    const query = new URL(req.url, 'http://localhost').searchParams;
    const readFields = (query.get('select') || '').split(',');
    const matches = [...query].every(([key, filter]) => {
      if (key === 'select') return true;
      if (filter === 'is.null') return row[key] === null;
      if (filter.startsWith('eq.')) return String(row[key]) === filter.slice(3);
      if (filter.startsWith('gt.')) return (row[key] || '') > filter.slice(3);
      return false;
    });
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'PATCH') {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      if (matches) Object.assign(row, JSON.parse(raw));
      return res.end(JSON.stringify(matches ? { id: row.id } : null));
    }
    const value = readFields.includes('*') ? row :
      Object.fromEntries(readFields.map(key => [key, row[key]]));
    res.end(JSON.stringify(matches ? [value] : []));
  });

  process.env.SUPABASE_URL = await listen(t, db);
  process.env.SUPABASE_SERVICE_KEY = 'test-only';
  process.env.JWT_SECRET = 'test-only-signing-secret';
  const app = require('../api/server');
  const base = await listen(t, createServer(app));

  const post = (path, body, token) => fetch(base + '/api/auth/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: JSON.stringify(body),
  });
  const open = async password => {
    const response = await post('login', { username: row.username, password });
    assert.equal(response.status, 200);
    return (await response.json()).token;
  };
  const me = token => fetch(base + '/api/auth/me', { headers: { Authorization: 'Bearer ' + token } });

  const originalSession = await open(originalPassword);
  const first = await post('recovery-code', { currentPassword: originalPassword }, originalSession);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('cache-control'), 'no-store');
  const { code: replacedCode } = await first.json();
  assert.match(replacedCode, /^[A-Za-z0-9_-]{32}$/);
  assert.match(row.recovery_code_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(row.recovery_code_hash, replacedCode);

  const second = await post('recovery-code', { currentPassword: originalPassword }, originalSession);
  assert.equal(second.status, 200);
  const { code } = await second.json();
  assert.notEqual(code, replacedCode);
  const recovery = { username: row.username, code, newPassword: resetPassword };
  assert.equal((await post('reset-password', { ...recovery, code: replacedCode })).status, 400);
  assert.equal((await post('reset-password', recovery)).status, 200);
  assert.equal(row.recovery_code_hash, null);
  assert.equal(row.session_version, 1);
  assert.equal((await post('reset-password', recovery)).status, 400);
  assert.equal((await me(originalSession)).status, 401);
  assert.equal((await post('login', { username: row.username, password: originalPassword })).status, 401);

  const afterReset = await open(resetPassword);
  assert.equal((await post('change-password', { currentPassword: resetPassword, newPassword: changedPassword }, afterReset)).status, 200);
  assert.equal(row.session_version, 2);
  assert.ok(await open(changedPassword));
});
