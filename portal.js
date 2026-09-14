// UV 포털 — 로그인 뒤 역할별 화면. 데이터 보호는 서버 RLS(sql/portal.sql)가 한다; 여기는 받은 만큼만 그린다.
import { roleOf, visiblePrograms, latestRelease, releaseLines, fmtBytes, validUntilLabel, releaseFormErrors,
  focusPrograms, focusFromLocation } from './portal-logic.mjs';

// ★프로그램 전용 링크 — `?p=uv-global-reaction-editor`(또는 `#…`)로 들어오면 그 프로그램 하나만 보인다. 허브로 가는 단추는 없다.
//   (사용자 2026-09-14: 「그 링크가 독립적으로만 작동하면 돼. 별도 허브로 안 넘어오고 그 프로그램만 볼 수 있게」)
const FOCUS = focusFromLocation(location);

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
  const all = visiblePrograms(programs, me);
  const mine = focusPrograms(all, FOCUS);
  const grid = $('mine-grid'); grid.replaceChildren();
  // 전용 링크인데 자격이 없으면 「열려 있지 않은 프로그램」, 링크 없이 자격이 하나도 없으면 「열린 프로그램 없음」
  $('focus-empty').classList.toggle('hidden', !(FOCUS && mine.length === 0));
  $('mine-empty').classList.toggle('hidden', !!FOCUS || mine.length > 0);
  // ★판은 정식 최신과 그보다 새 후보를 따로 그린다. 최신 하나만 그리면 정식 판이 숨는다(사용자 2026-09-14 「하나만 보이는 거 같아」).
  const line = (r, kind) => `<div class="rel ${kind}">
        <div class="rel-head"><span class="badge ${kind}">${kind === 'stable' ? '정식' : '후보'}</span><b>${esc(r.version)}${kind === 'rc' ? ' ' + esc(r.tag.replace(/^v[\d.]+-rc\./, 'RC')) : ''}</b><span class="faint">${esc(r.tag)} · ${esc(String(r.published_at).slice(0, 10))}</span></div>
        <div class="meta">
          <span class="k">파일</span><code>${esc(r.file_name)}</code>
          <span class="k">크기</span><span>${esc(fmtBytes(r.bytes))}</span>
          <span class="k">SHA-256</span><code>${esc(r.sha256)}</code>
        </div>
        <div class="row">
          <a class="dl" href="${esc(r.download_url)}">${kind === 'stable' ? '정식 판' : '후보 판'} 설치기 다운로드</a>
          ${r.notes_url ? `<a class="btn small" href="${esc(r.notes_url)}" target="_blank" rel="noopener">바뀐 점</a>` : ''}
        </div>
      </div>`;
  const histItem = (r) => `<li><span class="badge ${r.is_prerelease ? 'rc' : 'stable'}">${r.is_prerelease ? '후보' : '정식'}</span> ${esc(r.version)} <code>${esc(r.tag)}</code> · ${esc(String(r.published_at).slice(0, 10))} · ${esc(fmtBytes(r.bytes))} · <a href="${esc(r.download_url)}">받기</a></li>`;
  for (const p of mine) {
    const L = releaseLines(p.uvengers_releases);
    const m = (me.memberships || []).find((x) => x.program_code === p.code);
    const card = document.createElement('div'); card.className = 'prog';
    card.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <p class="tagline">${esc(p.tagline || '')}</p>
      ${L.stable ? line(L.stable, 'stable') : ''}
      ${L.candidate ? line(L.candidate, 'rc') : ''}
      ${!L.stable && !L.candidate ? '<div class="faint">아직 배포된 판이 없습니다</div>' : ''}
      <div class="meta" style="margin-top:14px"><span class="k">이용 기한</span><span>${esc(roleOf(me) === 'admin' && !m ? '관리자' : validUntilLabel(m?.valid_until))}</span></div>
      ${p.guide_url ? `<div class="row"><a class="btn" href="${esc(p.guide_url)}" target="_blank" rel="noopener">설치 안내</a></div>` : ''}
      ${L.history.length > 1 ? `<details class="hist"><summary>모든 판 ${L.history.length}개</summary><ul>${L.history.map(histItem).join('')}</ul></details>` : ''}`;
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
  // 배포 기록 — 프로그램 가리지 않고 전부, 새 것부터
  const hist = programs.flatMap((p) => (p.uvengers_releases || []).map((r) => ({ ...r, program: p.name })))
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  $('admin-releases').innerHTML = `<thead><tr><th>게시일</th><th>프로그램</th><th>판</th><th>종류</th><th>파일</th><th>크기</th><th>SHA-256</th><th></th></tr></thead><tbody>${hist.map((r) => `<tr>
      <td class="nw">${esc(String(r.published_at).slice(0, 10))}</td><td><b>${esc(r.program)}</b></td><td class="nw">${esc(r.version)} <code>${esc(r.tag)}</code></td>
      <td><span class="badge ${r.is_prerelease ? 'rc' : 'stable'}">${r.is_prerelease ? '후보' : '정식'}</span></td>
      <td><code>${esc(r.file_name)}</code></td><td>${esc(fmtBytes(r.bytes))}</td><td><code>${esc(String(r.sha256 || '').slice(0, 12))}…</code></td>
      <td><a href="${esc(r.download_url)}">받기</a>${r.notes_url ? ` · <a href="${esc(r.notes_url)}" target="_blank" rel="noopener">노트</a>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="faint">아직 등록된 판이 없습니다</td></tr>'}</tbody>`;
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
