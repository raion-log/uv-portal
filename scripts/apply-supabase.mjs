// UV 포털 — Supabase 관리 API 로 sql/portal.sql 적용 + Auth Redirect URL 추가 + 결과 확인.
// 쓰는 법: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-supabase.mjs   (토큰은 파일·Git 에 안 남긴다)
// 여러 번 돌려도 안전하다(SQL 이 if not exists / on conflict, Redirect URL 은 있으면 안 더한다).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'dnflcjpjzqmrybtcleqy';
const PORTAL_URL = 'https://raion-log.github.io/uv-portal/';
const ANON_KEY = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'portal.js'), 'utf8')
  .match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token || !token.startsWith('sbp_')) { console.error('SUPABASE_ACCESS_TOKEN(sbp_...) 이 없습니다'); process.exit(2); }

const api = async (method, p, body) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}${p}`, {
    method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let json; try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
};

// 1) SQL
const sql = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql', 'portal.sql'), 'utf8');
const q = await api('POST', '/database/query', { query: sql });
console.log('SQL:', q.status, q.status === 201 ? 'OK' : JSON.stringify(q.json).slice(0, 400));
if (q.status !== 201) process.exit(1);

// 2) Auth Redirect URL — ★GET 이 제대로 왔을 때만 PATCH. 빈 목록으로 덮으면 같은 프로젝트의 앱·raion-admin 리디렉트가 사라진다(적대평가 2026-09-14).
const cfg = await api('GET', '/config/auth');
if (cfg.status !== 200 || typeof cfg.json?.uri_allow_list !== 'string') {
  console.error('Redirect URL: 현재 목록을 못 읽어 건드리지 않음', cfg.status, JSON.stringify(cfg.json).slice(0, 200));
} else {
  const list = cfg.json.uri_allow_list.split(',').map((s) => s.trim()).filter(Boolean);
  if (list.includes(PORTAL_URL) || list.includes(PORTAL_URL.replace(/\/$/, ''))) {
    console.log('Redirect URL: 이미 있음');
  } else {
    const p = await api('PATCH', '/config/auth', { uri_allow_list: [...list, PORTAL_URL].join(',') });
    console.log('Redirect URL:', p.status, p.status === 200 ? '추가됨' : JSON.stringify(p.json).slice(0, 300));
  }
}

// 3) 확인 — 표가 있고(postgres), anon 으로는 0행(RLS), 함수가 있다
const chk = await api('POST', '/database/query', { query:
  "select (select count(*) from public.uvengers_programs) as programs, (select count(*) from public.uvengers_releases) as releases, " +
  "(select count(*) from pg_proc where proname in ('portal_me','portal_can_see','portal_is_admin')) as funcs, " +
  "(select count(*) from pg_policies where tablename in ('uvengers_programs','uvengers_releases','uvengers_program_members','uvengers_cohorts','uvengers_program_cohorts')) as policies" });
console.log('표·함수·정책:', JSON.stringify(chk.json), '(정책 8 이어야)');
// ★확인 단계가 틀리면 실패로 끝낸다 — 로그만 찍고 exit 0 이면 아무도 안 본다(적대평가 2026-09-14)
let bad = 0;
const anon = await fetch(`https://${REF}.supabase.co/rest/v1/uvengers_programs?select=code`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } });
const rows = await anon.json();
const anonOk = anon.status === 401 || anon.status === 403 || (Array.isArray(rows) && rows.length === 0);
console.log('anon 조회:', anon.status, Array.isArray(rows) ? `${rows.length}행` : JSON.stringify(rows).slice(0, 120), anonOk ? 'OK' : '!! anon 이 읽는다');
if (!anonOk) bad++;
const me = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/portal_me`, { method: 'POST', headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' }, body: '{}' });
console.log('anon portal_me:', me.status, me.status === 401 || me.status === 403 ? 'OK' : '!! anon 이 실행한다');
if (!(me.status === 401 || me.status === 403)) bad++;
if (chk.json?.[0]?.policies !== 8) { console.log('!! 정책 수가 8 이 아님'); bad++; }
if (bad) { console.error(`확인 실패 ${bad}건`); process.exit(1); }
