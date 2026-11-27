const { test } = require('node:test');
const assert = require('node:assert/strict');
const { evidenceHandler } = require('../lib/evidence');
const { evidenceTopics } = require('../lib/evidence-topics');

const quote = 'The findings varied substantially across the included studies.';
const row = {
  source: 'MED', id: '1234', pmcid: 'PMC1234', isOpenAccess: 'Y', license: 'cc by',
  title: 'Example paper', abstractText: quote, pubTypeList: { pubType: ['Systematic Review'] },
};
const query = { topic: 'diabetes', mode: 'standard' };
const env = {
  EVIDENCE_AI_ENABLED: 'true', OPENAI_API_KEY: 'test', EVIDENCE_MODEL: 'test',
  EVIDENCE_PILOT_USER_IDS: 'pilot',
};
const completion = content => ({ choices: [{ message: { content: JSON.stringify(content) } }] });
const response = value => ({ ok: true, json: async () => value });
const records = (...result) => response({ resultList: { result } });

async function call(handler, options = {}) {
  const result = { status: 200, headers: {} };
  const res = {
    setHeader(name, value) { result.headers[name] = value; },
    status(status) { result.status = status; return this; },
    json(value) { result.body = value; },
  };
  await handler({ method: 'GET', query, user: { sub: 'pilot', role: 'medecin' }, ...options }, res);
  return result;
}

test('rejects arbitrary fields, topics, and request methods before any provider call', async () => {
  let calls = 0;
  const handler = evidenceHandler({ fetcher: async () => { calls++; } });
  assert.equal((await call(handler, { query: { ...query, text: 'test' } })).status, 400);
  assert.equal((await call(handler, { query: { ...query, topic: '__proto__' } })).status, 400);
  assert.equal((await call(handler, { method: 'POST' })).status, 405);
  assert.equal(calls, 0);
});

test('deep research tolerates a failed branch, removes duplicates and filters rights and retractions', async () => {
  let searches = 0;
  const handler = evidenceHandler({ env: {}, fetcher: async url => {
    searches++;
    if (url.searchParams.get('query').includes('practice guideline')) throw new Error('offline');
    return records(row, { ...row, id: '2', license: 'cc by-nc' },
      { ...row, id: '3', pubTypeList: { pubType: ['Retracted Publication'] } });
  } });
  const result = await call(handler, { query: { ...query, mode: 'deep' } });
  assert.equal(searches, 3);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal(result.body.partial, true);
  assert.deepEqual(result.body.sources.map(source => source.url), ['https://europepmc.org/articles/PMC1234']);
  assert.equal(result.body.sources[0].abstract, undefined);
});

test('synthesis requires the pilot account, a known source, a literal quote and an independent approval', async () => {
  let modelCalls = 0;
  const handler = evidenceHandler({ env, fetcher: async (url, options) => {
    if (typeof url !== 'string') return records(row);
    modelCalls++;
    const payload = JSON.parse(options.body);
    const input = JSON.parse(payload.messages[1].content);
    assert.equal(payload.store, false);
    assert.equal(options.headers.Authorization, 'Bearer test');
    if (!input.claims) return response(completion({ claims: [
      { id: '1234', text: 'Résultats hétérogènes.', quote },
      { id: '1234', text: 'Affirmation rejetée par la revue.', quote },
      { id: '1234', text: 'Citation fabriquée.', quote: 'This exact wording is absent from the cited abstract.' },
      { id: '99', text: 'Source fabriquée.', quote },
    ] }));
    assert.equal(input.claims.length, 2);
    assert.ok(!options.body.includes('pilot'));
    return response(completion({ approved: [0] }));
  } });
  assert.equal((await call(handler, { user: { sub: 'other', role: 'medecin' } })).body.synthesis, 'disabled');
  assert.equal(modelCalls, 0);
  const result = await call(handler);
  assert.equal(modelCalls, 2);
  assert.equal(result.body.synthesis, 'reviewed');
  assert.deepEqual(result.body.claims, [{ id: '1234', text: 'Résultats hétérogènes.', quote }]);
});

test('model or retrieval failure returns bibliography only or an explicit upstream error', async () => {
  const handler = evidenceHandler({ env, fetcher: async url => {
    if (typeof url !== 'string') return records(row);
    throw new Error('model offline');
  } });
  assert.deepEqual((await call(handler)).body.claims, []);
  assert.equal((await call(handler)).body.synthesis, 'unavailable');
  const offline = evidenceHandler({ fetcher: async () => { throw new Error('catalogue offline'); } });
  assert.equal((await call(offline)).status, 502);
});

test('each account receives its own questions and can only submit its own topic IDs', async () => {
  const firstTopics = {
    medecin: 'diabetes', patient: 'patient-sleep', pharmacie: 'pharmacy-adherence',
    labo: 'lab-preanalytics', assistant: 'assistant-appointments', infirmier: 'nurse-handovers', assurance: 'insurance-access', super_admin: 'admin-data-quality',
  };
  const providerQueries = [];
  const handler = evidenceHandler({ env: {}, fetcher: async url => {
    providerQueries.push(url.searchParams.get('query'));
    return records(row);
  } });
  for (const [role, id] of Object.entries(firstTopics)) {
    const user = { sub: 'any-user', role };
    const list = evidenceTopics({ user }, { json: value => value });
    assert.equal(list.role, role);
    assert.ok(list.questions.length >= 3);
    assert.equal(list.questions[0].id, id);
    assert.deepEqual(Object.keys(list.questions[0]), ['id', 'label']);
    assert.equal((await call(handler, { user, query: { topic: id, mode: 'standard' } })).status, 200);
    const foreignTopic = role === 'medecin' ? 'patient-sleep' : 'diabetes';
    assert.equal((await call(handler, { user, query: { topic: foreignTopic, mode: 'standard' } })).status, 400);
  }
  assert.equal(new Set(providerQueries).size, Object.keys(firstTopics).length);
  assert.equal((await call(handler, { user: { role: 'guest' } })).status, 403);
});

test('a non-medical account cannot use the synthesis pilot', async () => {
  const handler = evidenceHandler({ env, fetcher: async url => {
    assert.ok(url instanceof URL);
    return records(row);
  } });
  const result = await call(handler, {
    user: { sub: 'pilot', role: 'patient' }, query: { topic: 'patient-sleep', mode: 'standard' },
  });
  assert.equal(result.body.synthesis, 'disabled');
  assert.deepEqual(result.body.claims, []);
});
