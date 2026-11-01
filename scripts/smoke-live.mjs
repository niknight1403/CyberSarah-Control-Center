// Smoke-Test: wichtigster echter Nutzerfluss gegen das LIVE-Deploy.
// Prueft Ready-Kette (App+DB), strukturierte Login-Antwort (Routing+DB+scrypt)
// und die Web-Wurzel. Exit 0 = gruen, Exit 1 = rot.
const BASE = process.env.SMOKE_BASE_URL || 'https://app.cybersarah-ki.com';
let failed = 0;
const check = (name, ok, info = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${info ? ' — ' + info : ''}`);
  if (!ok) failed++;
};
const timeout = (ms) => AbortSignal.timeout(ms);

const ready = await fetch(`${BASE}/api/ready`, { signal: timeout(30000) }).then((r) => r.json()).catch(() => null);
check('Ready-Kette (App+DB)', !!ready?.ok && ready?.checks?.database === true, `ready=${ready?.ok} db=${ready?.checks?.database}`);

const login = await fetch(`${BASE}/api/trpc/account.login?batch=1`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: timeout(30000),
  body: JSON.stringify({ '0': { json: { email: 'smoke@test.local', password: 'falsch-smoke' } } })
}).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })).catch(() => null);
const unauthorized = login?.status === 401 && login?.body?.[0]?.error?.json?.data?.code === 'UNAUTHORIZED';
check('Login-Kette (strukturierte 401-Antwort)', unauthorized, `status=${login?.status}`);

const root = await fetch(`${BASE}/`, { signal: timeout(30000) }).then((r) => ({ status: r.status, type: r.headers.get('content-type') || '' })).catch(() => null);
check('Web-Wurzel erreichbar', root?.status === 200 && (root?.type || '').includes('text/html'), `status=${root?.status}`);

console.log(failed === 0 ? 'SMOKE-GRUEN: Alle Nutzerfluss-Pruefungen bestanden.' : `SMOKE-ROT: ${failed} Pruefung(en) fehlgeschlagen.`);
process.exit(failed === 0 ? 0 : 1);
