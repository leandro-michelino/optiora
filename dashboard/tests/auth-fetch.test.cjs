/* global __dirname */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { setImmediate } = require('node:timers');

function loadAuthFetch(fetch) {
  const source = fs.readFileSync(path.join(__dirname, '../lib/auth-fetch.ts'), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports,
    fetch,
    require(name) {
      assert.equal(name, '@/lib/backend-url');
      return { backendUrl: (url) => `http://backend${url}` };
    },
  });
  return exports;
}

test('parallel expired requests share one refresh and retry with cookies', async () => {
  let refreshCalls = 0;
  let refreshed = false;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const api = loadAuthFetch(async (url, init) => {
    assert.equal(init.credentials, 'include');
    if (url.endsWith('/auth/refresh')) {
      refreshCalls++;
      await gate;
      refreshed = true;
      return { ok: true };
    }
    return { status: refreshed ? 200 : 401 };
  });
  const calls = ['/profile', '/organizations', '/organization'].map((url) => api.authorizedFetch(url));
  await new Promise(setImmediate);
  assert.equal(refreshCalls, 1);
  release();
  assert.deepEqual((await Promise.all(calls)).map((response) => response.status), [200, 200, 200]);
});

test('failed refresh preserves the original unauthorized response and can be retried later', async () => {
  let refreshCalls = 0;
  const unauthorized = { status: 401 };
  const api = loadAuthFetch(async (url) => {
    if (url.endsWith('/auth/refresh')) {
      refreshCalls++;
      return { ok: false };
    }
    return unauthorized;
  });
  assert.equal(await api.authorizedFetch('/profile'), unauthorized);
  assert.equal(await api.authorizedFetch('/profile'), unauthorized);
  assert.equal(refreshCalls, 2);
});

test('network failure during refresh returns false and releases the pending request', async () => {
  let calls = 0;
  const api = loadAuthFetch(async () => {
    calls++;
    throw new Error('offline');
  });
  assert.equal(await api.refreshAccessToken(), false);
  assert.equal(await api.refreshAccessToken(), false);
  assert.equal(calls, 2);
});
