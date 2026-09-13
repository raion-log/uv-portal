// UV 포털 — 로그인 뒤 역할별 화면. 데이터 보호는 서버 RLS(sql/portal.sql)가 한다; 여기는 받은 만큼만 그린다.
import { roleOf, visiblePrograms, latestRelease, fmtBytes, validUntilLabel, releaseFormErrors } from './portal-logic.mjs';

// 공개 anon 키 — raion-admin·앱과 같은 프로젝트. 브라우저에 두라고 만든 키다(권한은 RLS 가 정한다).
const SUPABASE_URL = 'https://dnflcjpjzqmrybtcleqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZmxjanBqenFtcnlidGNsZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTIyMjUsImV4cCI6MjA4OTAyODIyNX0._g01argDVGK1Wmm0GT-ThidWu33ls--IR-7F20_zJF8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (id, text, kind = 'err') => { const el = $(id); el.className = text ? `msg ${kind}` : ''; el.textContent = text || ''; };

let me = null;          // portal_me() 답
let programs = [];      // RLS 가 걸러 준 프로그램(+판)

// ── 로그인 ──────────────────────────────────────────────────────────────────
$('btn-google').addEventListener('click', async () => {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } });
  if (error) msg('login-msg', '구글 로그인을 열지 못했습니다: ' + error.message);
});
$('btn-email').addEventListener('click', async () => {
  msg('login-msg', '');
  const { error } = await sb.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-pw').value });
  if (error) msg('login-msg', '로그인하지 못했습니다. 이메일과 비밀번호를 확인해 주세요.');
});
$('login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-email').click(); });
$('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

sb.auth.onAuthStateChange((_event, session) => { if (session) enter(session); else leave(); });
const { data: { session } } = await sb.auth.getSession();
if (session) enter(session); else leave();

function leave() {
  $('view-login').classList.remove('hidden'); $('view-app').classList.add('hidden');
  $('btn-logout').classList.add('hidden'); $('who').textContent = '';
}

async function enter(session) {
  $('view-login').classList.add('hidden'); $('view-app').classList.remove('hidden'); $('btn-logout').classList.remove('hidden');
  const { data, error } = await sb.rpc('portal_me');
  me = error ? { is_admin: false, memberships: [], email: session.user?.email } : data;
  $('who').textContent = `${me.email || session.user?.email || ''}${roleOf(me) === 'admin' ? ' · 관리자' : ''}`;
  $('tab-admin').classList.toggle('hidden', roleOf(me) !== 'admin');
  await load();
  render();
}

async function load() {
  const { data, error } = await sb.from('uvengers_programs')
    .select('code,name,tagline,guide_url,landing_url,sort,active,uvengers_releases(version,tag,file_name,bytes,sha256,download_url,notes_url,published_at,is_prerelease)')
    .order('sort');
  programs = error ? [] : (data || []);
  if (error) console.error('프로그램을 못 읽었습니다', error);
}

// ── 탭 ──────────────────────────────────────────────────────────────────────
$('tabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]'); if (!b) return;
  for (const x of $('tabs').querySelectorAll('[data-tab]')) x.classList.toggle('on', x === b);
  $('pane-mine').classList.toggle('hidden', b.dataset.tab !== 'mine');
  $('pane-admin').classList.toggle('hidden', b.dataset.tab !== 'admin');
});

// ── 내 프로그램 ─────────────────────────────────────────────────────────────
function render() {
  const mine = visiblePrograms(programs, me);
  const grid = $('mine-grid'); grid.replaceChildren();
  $('mine-empty').classList.toggle('hidden', mine.length > 0);
  for (const p of mine) {
    const rel = latestRelease(p.uvengers_releases);
    const m = (me.memberships || []).find((x) => x.program_code === p.code);
    const card = document.createElement('div'); card.className = 'prog';
    card.innerHTML = `
      <h3>${esc(p.name)} ${rel ? `<span class="badge ${rel.is_prerelease ? 'rc' : 'stable'}">${rel.is_prerelease ? '후보 ' : ''}${esc(rel.version)}${rel.is_prerelease ? ' ' + esc(rel.tag.replace(/^v[\d.]+-rc\./, 'RC')) : ''}</span>` : ''}</h3>
      <div class="muted">${esc(p.tagline || '')}</div>
      ${rel ? `<div class="meta">
        <span class="k">파일</span><code>${esc(rel.file_name)}</code>
        <span class="k">크기</span><span>${esc(fmtBytes(rel.bytes))}</span>
        <span class="k">게시일</span><span>${esc(String(rel.published_at).slice(0, 10))}</span>
        <span class="k">SHA-256</span><code>${esc(rel.sha256)}</code>
      </div>` : '<div class="faint">아직 배포된 판이 없습니다</div>'}
      <div class="meta"><span class="k">이용 기한</span><span>${esc(roleOf(me) === 'admin' && !m ? '관리자' : validUntilLabel(m?.valid_until))}</span></div>
      <div class="row">
        ${rel ? `<a class="btn primary" href="${esc(rel.download_url)}">설치기 다운로드</a>` : ''}
        ${p.guide_url ? `<a class="btn" href="${esc(p.guide_url)}" target="_blank" rel="noopener">설치 안내</a>` : ''}
        ${rel?.notes_url ? `<a class="btn small" href="${esc(rel.notes_url)}" target="_blank" rel="noopener">바뀐 점</a>` : ''}
      </div>`;
    grid.append(card);
  }
  if (roleOf(me) === 'admin') renderAdmin();
}

// ── 프로그램 관리 ───────────────────────────────────────────────────────────
function renderAdmin() {
  const t = $('admin-table');
  const rows = programs.map((p) => {
    const rel = latestRelease(p.uvengers_releases);
    const stable = latestRelease(p.uvengers_releases, { includePrerelease: false });
    return `<tr>
      <td><b>${esc(p.name)}</b><br><code>${esc(p.code)}</code>${p.active === false ? ' <span class="badge">은퇴</span>' : ''}</td>
      <td>${rel ? `${esc(rel.version)} <span class="badge ${rel.is_prerelease ? 'rc' : 'stable'}">${esc(rel.tag)}</span><br><span class="faint">${esc(String(rel.published_at).slice(0, 10))} · ${esc(fmtBytes(rel.bytes))}</span>` : '<span class="faint">없음</span>'}</td>
      <td>${stable ? `${esc(stable.version)} <span class="faint">${esc(stable.tag)}</span>` : '<span class="faint">없음</span>'}</td>
      <td>${rel ? `<code>${esc(rel.sha256.slice(0, 12))}…</code><br><a href="${esc(rel.download_url)}">받기</a>` : ''}</td>
      <td>${(p.uvengers_releases || []).length}개</td>
    </tr>`;
  });
  t.innerHTML = `<thead><tr><th>프로그램</th><th>최신 판</th><th>정식 판</th><th>파일</th><th>판 수</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  const sel = $('rel-program');
  sel.replaceChildren(...programs.map((p) => { const o = document.createElement('option'); o.value = p.code; o.textContent = p.name; return o; }));
}

$('btn-rel-save').addEventListener('click', async () => {
  const f = {
    program_code: $('rel-program').value, version: $('rel-version').value.trim(), tag: $('rel-tag').value.trim(),
    file_name: $('rel-file').value.trim(), bytes: Number(String($('rel-bytes').value).replace(/[^0-9]/g, '')),
    sha256: $('rel-sha').value.trim().toLowerCase(), download_url: $('rel-url').value.trim(),
    notes_url: $('rel-notes').value.trim() || null, published_at: $('rel-date').value, is_prerelease: $('rel-pre').checked,
  };
  const errors = releaseFormErrors(f);
  if (errors.length) { msg('rel-msg', errors.join(' · ')); return; }
  $('btn-rel-save').disabled = true;
  const { error } = await sb.from('uvengers_releases').insert({ ...f, published_at: f.published_at + 'T00:00:00+09:00' });
  $('btn-rel-save').disabled = false;
  if (error) { msg('rel-msg', '등록하지 못했습니다: ' + (error.code === '23505' ? '같은 태그가 이미 있습니다' : error.message)); return; }
  msg('rel-msg', `${f.tag} 을 등록했습니다.`, 'ok');
  await load(); render();
});

$('btn-prg-save').addEventListener('click', async () => {
  const row = { code: $('prg-code').value.trim(), name: $('prg-name').value.trim(), tagline: $('prg-tagline').value.trim() || null,
    guide_url: $('prg-guide').value.trim() || null };
  if (!/^[a-z0-9-]+$/.test(row.code) || !row.name) { msg('prg-msg', '코드는 영문 소문자·숫자·하이픈, 이름은 비울 수 없습니다'); return; }
  const { error } = await sb.from('uvengers_programs').insert(row);
  if (error) { msg('prg-msg', '추가하지 못했습니다: ' + error.message); return; }
  msg('prg-msg', `${row.name} 을 추가했습니다.`, 'ok');
  await load(); render();
});
