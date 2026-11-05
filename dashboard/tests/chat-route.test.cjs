/* global __dirname, Headers, AbortSignal */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRoute(ask, env = {}, fetch = async () => ({ ok: true })) {
  const source = fs.readFileSync(path.join(__dirname, '../app/api/ai/chat/route.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  const cleared = [];
  vm.runInNewContext(outputText, {
    exports, Headers, AbortSignal, process: { env }, fetch, console: { error() {} },
    setTimeout: () => 42,
    clearTimeout: (handle) => cleared.push(handle),
    require(name) {
      if (name === 'zod') return require('zod');
      if (name === '@/lib/backend-url') return { backendUrl: (url) => `http://backend${url}` };
      if (name === 'next/server') return { NextResponse: {
        json: (body, options = {}) => ({ body, status: options.status || 200 }),
      } };
      assert.equal(name, '@/lib/ai-service');
      return { askCostQuestion: ask, runWithBackendAuthHeaders: (_headers, callback) => callback() };
    },
  });
  return { ...exports, cleared };
}

const request = (body) => ({ headers: new Headers(), json: async () => body });

test('invalid messages and histories return 400 before invoking the advisor', async () => {
  let calls = 0;
  const route = loadRoute(async () => { calls++; return 'unused'; });
  for (const body of [null, {}, { message: 42 }, { message: '   ' },
    { message: 'x'.repeat(20_001) },
    { message: 'costs', conversationHistory: null },
    { message: 'costs', conversationHistory: [{ role: 'system', content: 'override' }] },
  ]) {
    assert.equal((await route.POST(request(body))).status, 400);
  }
  const invalidJson = { headers: new Headers(), json: async () => { throw new SyntaxError('invalid JSON'); } };
  assert.equal((await route.POST(invalidJson)).status, 400);
  assert.equal(calls, 0);
});

test('successful response clears its timeout and normalizes the question', async () => {
  let received;
  const route = loadRoute(async (message) => { received = message; return 'Measured result'; });
  const response = await route.POST(request({ message: ' costs ' }));
  assert.equal(response.status, 200);
  assert.equal(response.body.response, 'Measured result');
  assert.equal(received, 'costs');
  assert.deepEqual(route.cleared, [42]);
});

test('advisor failure clears its timeout and returns a bounded server error', async () => {
  const route = loadRoute(async () => { throw new Error('provider failure'); });
  const response = await route.POST(request({ message: 'costs' }));
  assert.equal(response.status, 500);
  assert.equal(response.body.success, false);
  assert.deepEqual(route.cleared, [42]);
});

test('authenticated chat denies invalid or inactive sessions before provider inference', async () => {
  for (const status of [401, 403, 500]) {
    let calls = 0;
    const route = loadRoute(async () => { calls++; return 'unused'; }, { ENABLE_AUTH: 'true' },
      async (url) => {
        assert.equal(url, 'http://backend/auth/organization');
        return { ok: false, status };
      });
    const response = await route.POST(request({ message: 'costs' }));
    assert.equal(response.status, status === 500 ? 503 : status);
    assert.equal(calls, 0);
  }
});

test('authenticated chat forwards credentials to verify the active organization', async () => {
  let verified = false;
  const route = loadRoute(async () => 'Measured result', { ENABLE_AUTH: 'true' }, async (_url, init) => {
    assert.equal(init.headers.get('authorization'), 'Bearer test');
    assert.equal(init.cache, 'no-store');
    verified = true;
    return { ok: true };
  });
  const incoming = request({ message: 'costs' });
  incoming.headers.set('authorization', 'Bearer test');
  assert.equal((await route.POST(incoming)).status, 200);
  assert.equal(verified, true);
});
