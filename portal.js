// UV 포털 — 로그인 뒤 역할별 화면. 데이터 보호는 서버 RLS(sql/portal.sql)가 한다; 여기는 받은 만큼만 그린다.
import { roleOf, visiblePrograms, latestRelease, pickRelease, notesLines, cohortMatrix, fmtBytes, validUntilLabel, releaseFormErrors,
  focusPrograms, focusFromLocation } from './portal-logic.mjs';

// ★프로그램 전용 링크 — `?p=uv-global-reaction-editor`(또는 `#…`)로 들어오면 그 프로그램 하나만 보인다. 허브로 가는 단추는 없다.
//   (사용자 2026-09-14: 「그 링크가 독립적으로만 작동하면 돼. 별도 허브로 안 넘어오고 그 프로그램만 볼 수 있게」)
//   구글 로그인은 주소를 갈아 끼우며 돌아오므로(?p= 가 사라진다) 누르기 전에 코드를 기억해 두고, 돌아온 뒤 그 값으로 잇는다.
const FOCUS_KEY = 'uv-portal-focus';
const remembered = (() => { try { return sessionStorage.getItem(FOCUS_KEY) || ''; } catch { return ''; } })();
const FOCUS = focusFromLocation(location, remembered);
if (FOCUS && !location.search.includes('p=')) { try { history.replaceState(null, '', location.pathname + '?p=' + FOCUS); } catch {} }

// 공개 anon 키 — raion-admin·앱과 같은 프로젝트. 브라우저에 두라고 만든 키다(권한은 RLS 가 정한다).
const SUPABASE_URL = 'https://dnflcjpjzqmrybtcleqy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRuZmxjanBqenFtcnlidGNsZXF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM0NTIyMjUsImV4cCI6MjA4OTAyODIyNX0._g01argDVGK1Wmm0GT-ThidWu33ls--IR-7F20_zJF8';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: true, autoRefreshToken: true } });

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const msg = (id, text, kind = 'err') => { const el = $(id); el.className = text ? `msg ${kind}` : ''; el.textContent = text || ''; };

let me = null;          // portal_me() 답
let programs = [];      // RLS 가 걸러 준 프로그램(+판)
let cohorts = [];       // 관리자만: portal_cohorts() — 기수·회원 수
let links = [];         // 관리자만: uvengers_program_cohorts — 기수 × 프로그램

// ── 로그인 ──────────────────────────────────────────────────────────────────
$('btn-google').addEventListener('click', async () => {
  try { if (FOCUS) sessionStorage.setItem(FOCUS_KEY, FOCUS); else sessionStorage.removeItem(FOCUS_KEY); } catch {}
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
    .select('code,name,tagline,guide_url,landing_url,sort,active,uvengers_releases(version,tag,file_name,bytes,sha256,download_url,notes,notes_url,published_at,is_prerelease)')
    .order('sort');
  programs = error ? [] : (data || []);
  if (error) console.error('프로그램을 못 읽었습니다', error);
  if (roleOf(me) === 'admin') {
    const c = await sb.rpc('portal_cohorts');
    cohorts = c.error ? [] : (c.data || []);
    const l = await sb.from('uvengers_program_cohorts').select('program_code,cohort');
    links = l.error ? [] : (l.data || []);
    if (c.error || l.error) console.error('기수 표를 못 읽었습니다', c.error || l.error);
  }
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
  // ★프로그램 하나 = 카드 하나, 받을 것도 하나. 가장 새 판(후보 포함)을 내밀고 바뀐 점 두 줄을 붙인다. 나머지 판과 확인값(SHA)은 접는다.
  //   (사용자 2026-09-14 「같은 프로그램은 하나로 합쳐서… 뭘 받아야하는지 모르겠음」 「바뀐 점도 2줄 정도는 써줘」)
  // 배지: 내미는 판은 늘 「최신」, 판 이름에 RC 가 붙으면 그걸로 충분하다(사용자 2026-09-14 「뱃지도 왠 후보로 들어가있어?」). 지난 판은 정식/RC.
  const kindOf = (r) => (r.is_prerelease ? 'rc' : 'stable');
  const kindName = (r) => (r.is_prerelease ? 'RC' : '정식');
  const label = (r) => `${esc(r.version)}${r.is_prerelease ? ' ' + esc(r.tag.replace(/^v[\d.]+-rc\./, 'RC')) : ''}`;
  const notesList = (r, cls = 'notes') => { const ls = notesLines(r.notes); return ls.length ? `<ul class="${cls}">${ls.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''; };
  const histItem = (r) => `<li><span class="badge ${kindOf(r)}">${kindName(r)}</span> ${label(r)} · ${esc(String(r.published_at).slice(0, 10))} · ${esc(fmtBytes(r.bytes))} · <a href="${esc(r.download_url)}">받기</a></li>`;
  for (const p of mine) {
    const { pick, others } = pickRelease(p.uvengers_releases);
    const m = (me.memberships || []).find((x) => x.program_code === p.code);
    const card = document.createElement('div'); card.className = 'prog';
    card.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <p class="tagline">${esc(p.tagline || '')}</p>
      ${pick ? `
      <div class="ver"><span class="badge latest">최신</span><b>${label(pick)}</b><span class="faint">${esc(String(pick.published_at).slice(0, 10))}</span></div>
      ${notesList(pick)}
      <div class="meta">
        <span class="k">파일</span><code>${esc(pick.file_name)}</code>
        <span class="k">크기</span><span>${esc(fmtBytes(pick.bytes))}</span>
      </div>
      <div class="row">
        <a class="dl" href="${esc(pick.download_url)}">설치기 다운로드</a>
        ${p.guide_url ? `<a class="btn small" href="${esc(p.guide_url)}" target="_blank" rel="noopener">설치 안내</a>` : ''}
        ${pick.notes_url ? `<a class="btn small" href="${esc(pick.notes_url)}" target="_blank" rel="noopener">바뀐 점 전체</a>` : ''}
      </div>` : '<div class="faint">아직 배포된 판이 없습니다</div>'}
      <div class="meta"><span class="k">이용 기한</span><span>${esc(roleOf(me) === 'admin' && !m ? '관리자' : m?.via === 'cohort' ? `${m.cohort} 기수 · 기한 없음` : validUntilLabel(m?.valid_until))}</span></div>
      ${pick ? `<details class="hist"><summary>확인값${others.length ? ` · 지난 판 ${others.length}개` : ''}</summary>
        <div class="faint">SHA-256 <code>${esc(pick.sha256)}</code></div>
        ${others.length ? `<ul>${others.map(histItem).join('')}</ul>` : ''}</details>` : ''}`;
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
  $('admin-releases').innerHTML = `<thead><tr><th>게시일</th><th>프로그램</th><th>판</th><th>종류</th><th>바뀐 점</th><th>파일 · 크기</th><th>SHA-256</th><th></th></tr></thead><tbody>${hist.map((r) => `<tr>
      <td class="nw">${esc(String(r.published_at).slice(0, 10))}</td><td><b>${esc(r.program)}</b></td><td class="nw">${esc(r.version)} <code>${esc(r.tag)}</code></td>
      <td><span class="badge ${r.is_prerelease ? 'rc' : 'stable'}">${r.is_prerelease ? 'RC' : '정식'}</span></td>
      <td class="notes-cell">${notesLines(r.notes).length ? `<ul class="notes">${notesLines(r.notes).map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : '<span class="faint">없음</span>'}</td>
      <td><code>${esc(r.file_name)}</code><br><span class="faint">${esc(fmtBytes(r.bytes))}</span></td><td><code>${esc(String(r.sha256 || '').slice(0, 12))}…</code></td>
      <td class="nw"><a href="${esc(r.download_url)}">받기</a>${r.notes_url ? ` · <a href="${esc(r.notes_url)}" target="_blank" rel="noopener">노트</a>` : ''}</td>
    </tr>`).join('') || '<tr><td colspan="8" class="faint">아직 등록된 판이 없습니다</td></tr>'}</tbody>`;
  const sel = $('rel-program');
  sel.replaceChildren(...programs.map((p) => { const o = document.createElement('option'); o.value = p.code; o.textContent = p.name; return o; }));
  renderMatrix();
}

// ── 기수 × 프로그램(관리자) — 허브의 배포표를 가져온 것. 칸을 켜고 끄면 바로 저장된다 ──
function renderMatrix() {
  const rows = cohortMatrix(programs, cohorts, links);
  const head = programs.map((p) => `<th class="p"><span>${esc(p.name)}</span></th>`).join('');
  const body = rows.map((r) => `<tr>
      <td class="nw"><b>${esc(r.cohort)}</b></td><td class="nw faint">${r.members}명</td>
      ${r.cells.map((c) => `<td class="p"><input type="checkbox" data-code="${esc(c.code)}" data-cohort="${esc(r.cohort)}" ${c.on ? 'checked' : ''} aria-label="${esc(r.cohort)} · ${esc(c.name)}"></td>`).join('')}
    </tr>`).join('');
  $('cohort-matrix').innerHTML = `<thead><tr><th>기수</th><th>회원</th>${head}</tr></thead><tbody>${body || `<tr><td colspan="${programs.length + 2}" class="faint">기수가 없습니다</td></tr>`}</tbody>`;
}

$('cohort-matrix').addEventListener('change', async (e) => {
  const box = e.target.closest('input[type=checkbox][data-code]'); if (!box) return;
  const row = { program_code: box.dataset.code, cohort: box.dataset.cohort };
  box.disabled = true;
  const { error } = box.checked
    ? await sb.from('uvengers_program_cohorts').insert(row)
    : await sb.from('uvengers_program_cohorts').delete().match(row);
  box.disabled = false;
  if (error) { box.checked = !box.checked; msg('cohort-msg', '저장하지 못했습니다: ' + error.message); return; }
  msg('cohort-msg', `${row.cohort} 에 ${programs.find((p) => p.code === row.program_code)?.name || row.program_code} 을 ${box.checked ? '켰' : '껐'}습니다.`, 'ok');
  await load(); render();
});

$('btn-cohort-add').addEventListener('click', async () => {
  const name = $('cohort-new').value.trim();
  if (!name) { msg('cohort-msg', '기수 이름을 넣으세요'); return; }
  const { error } = await sb.from('uvengers_cohorts').insert({ name, sort: 100 + cohorts.length * 10 });
  if (error) { msg('cohort-msg', '추가하지 못했습니다: ' + (error.code === '23505' ? '이미 있는 기수입니다' : error.message)); return; }
  $('cohort-new').value = '';
  msg('cohort-msg', `${name} 을 추가했습니다.`, 'ok');
  await load(); render();
});

$('btn-rel-save').addEventListener('click', async () => {
  const f = {
    program_code: $('rel-program').value, version: $('rel-version').value.trim(), tag: $('rel-tag').value.trim(),
    file_name: $('rel-file').value.trim(), bytes: Number(String($('rel-bytes').value).replace(/[^0-9]/g, '')),
    sha256: $('rel-sha').value.trim().toLowerCase(), download_url: $('rel-url').value.trim(),
    notes: $('rel-notes-text').value.trim() || null,
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
