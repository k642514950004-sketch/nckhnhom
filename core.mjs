// Lõi backend: không phụ thuộc Netlify, nhận "store" từ bên ngoài để dễ kiểm thử.
import { pbkdf2Sync, randomBytes, createHmac, timingSafeEqual } from 'node:crypto';

export const MEMBERS = { ca: 'chauanh', bn: 'bichngoc', td: 'thuyduong', tg: 'thuydung' };
export const LEADER = 'ca';
const USER2M = Object.fromEntries(Object.entries(MEMBERS).map(([m, u]) => [u, m]));
const COLS = ['items', 'learn', 'sources', 'links', 'settings'];
const ID_RE = /^[A-Za-z0-9._-]{1,60}$/;
const DAYS30 = 30 * 24 * 3600 * 1000;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase().replace(/[^a-z0-9]/g, '');
const hashPw = (pw, saltHex) => pbkdf2Sync(pw, Buffer.from(saltHex, 'hex'), 100000, 32, 'sha256').toString('hex');
const clip = (v, n = 2000) => (typeof v === 'string' ? v.slice(0, n) : v);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function clean(v, depth = 0) {
  if (depth > 4) return null;
  if (typeof v === 'string') return clip(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return v;
  if (Array.isArray(v)) return v.slice(0, 60).map((x) => clean(x, depth + 1));
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).slice(0, 60)) { if (/^[A-Za-z0-9_.-]{1,40}$/.test(k)) o[k] = clean(v[k], depth + 1); }
    return o;
  }
  return null;
}

export function makeHandler(store, env = {}) {
  async function secret() {
    let s = await store.get('meta/secret', { type: 'json' });
    if (!s) { s = { v: randomBytes(32).toString('hex') }; await store.setJSON('meta/secret', s); }
    return s.v;
  }
  async function sign(m) {
    const body = Buffer.from(JSON.stringify({ m, exp: Date.now() + DAYS30 })).toString('base64url');
    const sig = createHmac('sha256', await secret()).update(body).digest('base64url');
    return body + '.' + sig;
  }
  async function verify(req) {
    const h = req.headers.get('authorization') || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const [body, sig] = t.split('.');
    if (!body || !sig) return null;
    const exp = createHmac('sha256', await secret()).update(body).digest('base64url');
    const a = Buffer.from(sig), b = Buffer.from(exp);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (!MEMBERS[p.m] || p.exp < Date.now()) return null;
      return p.m;
    } catch { return null; }
  }
  async function ensureAccounts() {
    const have = await store.get('accounts/ca', { type: 'json' });
    if (have) return true;
    const pw = env.INITIAL_PASSWORD;
    if (!pw || String(pw).length < 6) return false;
    for (const m of Object.keys(MEMBERS)) {
      const salt = randomBytes(16).toString('hex');
      await store.setJSON('accounts/' + m, { salt, hash: hashPw(String(pw), salt), must: true });
    }
    return true;
  }
  async function listDocs(prefix, filter) {
    const { blobs } = await store.list({ prefix });
    const keys = blobs.map((b) => b.key).filter((k) => !filter || filter(k.slice(prefix.length)));
    const docs = await Promise.all(keys.map((k) => store.get(k, { type: 'json' })));
    const out = {};
    keys.forEach((k, i) => { if (docs[i]) out[k.slice(prefix.length)] = docs[i]; });
    return out;
  }
  const newId = () => new Date().toISOString().replace(/[:.]/g, '-') + '_' + randomBytes(3).toString('hex');

  return async function handle(req) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
    try {
      if (path === 'ping') return json({ ok: true, ready: await ensureAccounts() });
      if (path === 'login' && req.method === 'POST') {
        const b = await req.json();
        if (!(await ensureAccounts())) return json({ error: 'setup', msg: 'Chưa đặt INITIAL_PASSWORD trong Netlify.' }, 503);
        const m = USER2M[norm(b.user)];
        const acc = m && (await store.get('accounts/' + m, { type: 'json' }));
        const okPw = acc && hashPw(String(b.pw || ''), acc.salt) === acc.hash;
        if (!okPw) { await sleep(700); return json({ error: 'bad' }, 401); }
        return json({ token: await sign(m), m, must: !!acc.must });
      }
      const me = await verify(req);
      if (!me) return json({ error: 'auth' }, 401);

      if (path === 'state') {
        const cs = url.searchParams.get('cs') || '', ns = url.searchParams.get('ns') || '';
        const out = {};
        await Promise.all(COLS.map(async (c) => { out[c] = await listDocs(c + '/'); }));
        out.comments = await listDocs('comments/', (id) => id > cs);
        out.notifs = await listDocs('notifs/' + me + '/', (id) => id > ns);
        return json(out);
      }
      if (path === 'put' && req.method === 'POST') {
        const { col, id, patch } = await req.json();
        if (!ID_RE.test(String(id || '')) || typeof patch !== 'object' || !patch) return json({ error: 'invalid' }, 400);
        let key;
        let p = clean(patch);
        if (col === 'notifs') { key = `notifs/${me}/${id}`; p = { read: !!p.read }; }
        else if (COLS.includes(col)) {
          key = `${col}/${id}`;
          if (col === 'settings' && me !== LEADER) return json({ error: 'forbidden' }, 403);
          if (col === 'learn' && id !== me) return json({ error: 'forbidden' }, 403);
          if (col === 'items') {
            const allowed = ['status', 'ticks', 'link', 'note', 'submittedAt', 'submittedBy', 'checkedBy', 'approvedBy', 'doneAt', 'dl', 'dueOk'];
            for (const k of Object.keys(p)) if (!allowed.includes(k)) delete p[k];
            if (me !== LEADER) { delete p.dl; delete p.dueOk; }
          }
          p.by = me;
        } else return json({ error: 'invalid' }, 400);
        const cur = (await store.get(key, { type: 'json' })) || {};
        const merged = Object.assign({}, cur, p);
        if (JSON.stringify(merged).length > 20000) return json({ error: 'too_big' }, 413);
        await store.setJSON(key, merged);
        return json({ ok: true, doc: merged });
      }
      if (path === 'add' && req.method === 'POST') {
        const { col, data } = await req.json();
        const d = clean(data) || {};
        const id = newId();
        if (col === 'comments') {
          await store.setJSON('comments/' + id, { itemId: String(d.itemId || '').slice(0, 40), from: me, text: String(d.text || '').slice(0, 2000), at: new Date().toISOString(), mentions: (Array.isArray(d.mentions) ? d.mentions : []).filter((m) => MEMBERS[m]) });
        } else if (col === 'notifs') {
          if (!MEMBERS[d.to]) return json({ error: 'invalid' }, 400);
          await store.setJSON(`notifs/${d.to}/${id}`, { to: d.to, from: me, type: String(d.type || 'info').slice(0, 20), itemId: String(d.itemId || '').slice(0, 40), text: String(d.text || '').slice(0, 400), at: new Date().toISOString(), read: false });
        } else return json({ error: 'invalid' }, 400);
        return json({ ok: true, id });
      }
      if (path === 'pw' && req.method === 'POST') {
        const b = await req.json();
        const acc = await store.get('accounts/' + me, { type: 'json' });
        if (!acc || hashPw(String(b.old || ''), acc.salt) !== acc.hash) { await sleep(700); return json({ error: 'bad' }, 401); }
        if (String(b.new || '').length < 8) return json({ error: 'short' }, 400);
        const salt = randomBytes(16).toString('hex');
        await store.setJSON('accounts/' + me, { salt, hash: hashPw(String(b.new), salt), must: false });
        return json({ ok: true });
      }
      if (path === 'resetpw' && req.method === 'POST') {
        if (me !== LEADER) return json({ error: 'forbidden' }, 403);
        const b = await req.json();
        if (!MEMBERS[b.m]) return json({ error: 'invalid' }, 400);
        const alpha = 'abcdefghjkmnpqrstuvwxyz23456789';
        const pw = Array.from(randomBytes(10)).map((x) => alpha[x % alpha.length]).join('');
        const salt = randomBytes(16).toString('hex');
        await store.setJSON('accounts/' + b.m, { salt, hash: hashPw(pw, salt), must: true });
        return json({ ok: true, pw });
      }
      return json({ error: 'notfound' }, 404);
    } catch (e) {
      return json({ error: 'server', msg: String(e && e.message || e) }, 500);
    }
  };
}
