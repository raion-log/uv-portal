// UV 포털 — 로그인 뒤 역할별 화면. 데이터 보호는 서버 RLS(sql/portal.sql)가 한다; 여기는 받은 만큼만 그린다.
import { roleOf, visiblePrograms, latestRelease, pickRelease, notesLines, cohortMatrix, fmtBytes, fmtDate, versionLabel, pickMembership,
  validUntilLabel, releaseFormErrors, focusPrograms, focusFromLocation, toGmail, validGmailLocal, passwordProblem } from './portal-logic.mjs';

// ★프로그램 전용 링크 — `?p=uv-global-reaction-editor`(또는 `#…`)로 들어오면 그 프로그램 하나만 보인다. 허브로 가는 단추는 없다.
//   (사용자 2026-09-14: 「그 링크가 독립적으로만 작동하면 돼. 별도 허브로 안 넘어오고 그 프로그램만 볼 수 있게」)
//   구글 로그인은 주소를 갈아 끼우며 돌아오므로(?p= 가 사라진다) 누르기 전에 코드를 기억해 두고, 돌아온 길에서만 그 값으로 잇는다.
//   기억한 값은 한 번 쓰고 지운다 — 같은 탭에서 포털 주소를 새로 쳤을 때 달라붙지 않게(적대평가 2026-09-14).
const FOCUS_KEY = 'uv-portal-focus';
const RETURNING = /access_token=|[?&]code=/.test(location.hash + location.search);   // 암묵 흐름 #access_token= / PKCE ?code=
const remembered = (() => { try { const v = RETURNING ? (sessionStorage.getItem(FOCUS_KEY) || '') : ''; sessionStorage.removeItem(FOCUS_KEY); return v; } catch { return ''; } })();
const FOCUS = focusFromLocation(location, remembered);

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

// ── 로그인 — 편집기 앱과 같은 방식(Google 이메일 아이디 + 비밀번호). 구글 로그인 단추는 뺐다(사용자 2026-09-14) ──
// 단추 연타 막기 — 도는 동안 잠그고 끝나면 푼다(적대평가 2026-09-14)
const busy = async (btn, fn) => { if (btn.disabled) return; btn.disabled = true; try { await fn(); } finally { btn.disabled = false; } };
$('btn-email').addEventListener('click', () => busy($('btn-email'), async () => {
  msg('login-msg', '');
  const idInput = $('login-email').value.trim(), password = $('login-pw').value;
  if (!idInput || !password) { msg('login-msg', '이메일 아이디와 비밀번호를 입력해 주세요.'); return; }
  if (!validGmailLocal(idInput)) { msg('login-msg', '이메일 아이디(@ 앞부분)만 입력해 주세요.'); return; }
  const { error } = await sb.auth.signInWithPassword({ email: toGmail(idInput), password });
  $('login-pw').value = '';   // 앱과 같이 비밀번호 칸은 바로 비운다
  if (error) msg('login-msg', '이메일 아이디 또는 비밀번호가 올바르지 않습니다. 자동으로 채워진 비밀번호라면 지난 것일 수 있으니 직접 입력해 보세요.');
}));
$('login-pw').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-email').click(); });
$('btn-logout').addEventListener('click', async () => { await sb.auth.signOut(); location.reload(); });

// ── 비밀번호 재설정 — 앱과 같은 방식: 메일의 8자리 코드로 확인한 뒤 새 비밀번호를 정한다(리디렉트 없음) ──
const showReset = (on) => { $('view-reset').classList.toggle('hidden', !on); $('view-login').classList.toggle('hidden', on); msg('reset-msg', ''); };
$('btn-forgot').addEventListener('click', () => { $('reset-email').value = $('login-email').value.trim(); showReset(true); });
$('btn-reset-back').addEventListener('click', (e) => { e.preventDefault(); showReset(false); });
$('btn-reset-send').addEventListener('click', () => busy($('btn-reset-send'), async () => {
  const idInput = $('reset-email').value.trim();
  if (!validGmailLocal(idInput)) { msg('reset-msg', '이메일 아이디(@ 앞부분)만 입력해 주세요.'); return; }
  const { error } = await sb.auth.resetPasswordForEmail(toGmail(idInput));
  if (error) { msg('reset-msg', '코드를 보내지 못했습니다: ' + error.message); return; }
  $('reset-step2').classList.remove('hidden');
  msg('reset-msg', `${toGmail(idInput)} 으로 8자리 코드를 보냈습니다. 1시간 안에 아래에 넣어 주세요.`, 'ok');
}));
$('btn-reset-apply').addEventListener('click', () => busy($('btn-reset-apply'), async () => {
  const idInput = $('reset-email').value.trim(), code = $('reset-code').value.replace(/\D/g, ''), pw = $('reset-pw').value;
  const problem = passwordProblem(pw);
  if (problem) { msg('reset-msg', problem); return; }
  if (code.length !== 8) { msg('reset-msg', '메일로 온 8자리 코드를 넣어 주세요.'); return; }
  const v = await sb.auth.verifyOtp({ email: toGmail(idInput), token: code, type: 'recovery' });
  if (v.error) { msg('reset-msg', '코드가 맞지 않거나 만료됐습니다. 다시 보내서 새 코드로 시도해 주세요.'); return; }
  const u = await sb.auth.updateUser({ password: pw });
  $('reset-pw').value = '';
  if (u.error) { msg('reset-msg', '비밀번호를 바꾸지 못했습니다: ' + u.error.message); return; }
  location.reload();   // 코드 확인으로 이미 로그인된 상태 — 새 비밀번호로 들어온 화면을 그린다
}));

// ★enter 는 사람마다 한 번 — INITIAL_SESSION·SIGNED_IN·TOKEN_REFRESHED 가 같은 세션을 거듭 넘겨도 화면(폼·표)을 다시 지우지 않는다
let entered = '';
sb.auth.onAuthStateChange((_event, session) => {
  if (!session) { entered = ''; leave(); return; }
  if (session.user?.id && session.user.id === entered) return;
  enter(session);
});
const { data: { session } } = await sb.auth.getSession();
if (session) { if (session.user?.id !== entered) enter(session); } else leave();

function leave() {
  $('view-login').classList.remove('hidden'); $('view-app').classList.add('hidden');
  $('btn-logout').classList.add('hidden'); $('who').textContent = '';
}

async function enter(session) {
  entered = session.user?.id || 'x';
  $('view-login').classList.add('hidden'); $('view-app').classList.remove('hidden'); $('btn-logout').classList.remove('hidden');
  // 로그인이 끝난 뒤에야 주소를 정리한다 — 그 전에 hash 를 지우면 supabase 가 토큰을 못 읽는다
  if (FOCUS && !/[?&]p=/.test(location.search)) { try { history.replaceState(null, '', location.pathname + '?p=' + FOCUS); } catch {} }
  const { data, error } = await sb.rpc('portal_me');
  me = error ? { is_admin: false, memberships: [], email: session.user?.email } : data;
  msg('load-msg', error ? '계정 정보를 못 읽었습니다: ' + error.message + ' — 새로고침해 보세요' : '');
  $('who').textContent = `${me.email || session.user?.email || ''}${roleOf(me) === 'admin' ? ' · 관리자' : ''}`;
  $('tab-admin').classList.toggle('hidden', roleOf(me) !== 'admin');
  await load();
  render();
}

async function load() {
  const { data, error } = await sb.from('uvengers_programs')
    .select('code,name,tagline,guide_url,landing_url,sort,active,uvengers_releases(id,version,tag,file_name,bytes,sha256,download_url,notes,notes_url,published_at,is_prerelease)')
    .order('sort');
  programs = error ? [] : (data || []);
  // ★서버 오류를 「열린 프로그램이 없습니다」로 둔갑시키지 않는다(적대평가 2026-09-14)
  if (error) msg('load-msg', '프로그램 목록을 못 읽었습니다: ' + error.message + ' — 새로고침해 보세요');
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
  for (const x of $('tabs').querySelectorAll('[data-tab]')) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b ? 'true' : 'false'); }
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
  const label = (r) => esc(versionLabel(r));
  const notesList = (r, cls = 'notes') => { const ls = notesLines(r.notes); return ls.length ? `<ul class="${cls}">${ls.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>` : ''; };
  const histItem = (r) => `<li><span class="badge ${kindOf(r)}">${kindName(r)}</span> ${label(r)} · ${esc(fmtDate(r.published_at))} · ${esc(fmtBytes(r.bytes))} · <a href="${esc(r.download_url)}">받기</a></li>`;
  // 자격 줄: 관리자(자격 없음) → 「관리자」, 기수 자격 → 「○○ 기수 · 기한 없음」, 편집기인데 기한이 없으면 「승인 대기」, 나머지는 기한
  const untilLabel = (m) => (roleOf(me) === 'admin' && !m) ? '관리자'
    : m?.via === 'cohort' ? `${m.cohort} 기수 · 기한 없음`
    : (m?.via === 'editor' && !m.valid_until) ? '승인 대기'
    : validUntilLabel(m?.valid_until);
  for (const p of mine) {
    const { pick, others } = pickRelease(p.uvengers_releases);
    const m = pickMembership(me.memberships, p.code);
    const card = document.createElement('div'); card.className = 'prog';
    card.innerHTML = `
      <h3>${esc(p.name)}</h3>
      <p class="tagline">${esc(p.tagline || '')}</p>
      ${pick ? `
      <div class="ver"><span class="badge latest">최신</span><b>${label(pick)}</b><span class="faint">${esc(fmtDate(pick.published_at))}</span></div>
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
      <div class="meta"><span class="k">이용 기한</span><span>${esc(untilLabel(m))}</span></div>
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
      <td>${rel ? `${esc(rel.version)} <span class="badge ${rel.is_prerelease ? 'rc' : 'stable'}">${esc(rel.tag)}</span><br><span class="faint">${esc(fmtDate(rel.published_at))} · ${esc(fmtBytes(rel.bytes))}</span>` : '<span class="faint">없음</span>'}</td>
      <td>${stable ? `${esc(stable.version)} <span class="faint">${esc(stable.tag)}</span>` : '<span class="faint">없음</span>'}</td>
      <td>${rel ? `<code>${esc(rel.sha256.slice(0, 12))}…</code><br><a href="${esc(rel.download_url)}">받기</a>` : ''}</td>
      <td>${(p.uvengers_releases || []).length}개</td>
    </tr>`;
  });
  t.innerHTML = `<thead><tr><th>프로그램</th><th>최신 판</th><th>정식 판</th><th>파일</th><th>판 수</th></tr></thead><tbody>${rows.join('')}</tbody>`;
  // 배포 기록 — 프로그램 가리지 않고 전부, 새 것부터
  const hist = programs.flatMap((p) => (p.uvengers_releases || []).map((r) => ({ ...r, program: p.name })))
    .sort((a, b) => (new Date(b.published_at) - new Date(a.published_at)) || ((Number(b.id) || 0) - (Number(a.id) || 0)));
  $('admin-releases').innerHTML = `<thead><tr><th>게시일</th><th>프로그램</th><th>판</th><th>종류</th><th>바뀐 점</th><th>파일 · 크기</th><th>SHA-256</th><th></th></tr></thead><tbody>${hist.map((r) => `<tr>
      <td class="nw">${esc(fmtDate(r.published_at))}</td><td><b>${esc(r.program)}</b></td><td class="nw">${esc(r.version)} <code>${esc(r.tag)}</code></td>
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
  // 저장하는 동안 표 전체를 잠근다 — 두 칸을 연달아 누르면 먼저 온 답의 재렌더가 뒤 칸을 되돌리던 것(적대평가 2026-09-14)
  const t = $('cohort-matrix'); t.classList.add('saving');
  const { error } = box.checked
    ? await sb.from('uvengers_program_cohorts').insert(row)
    : await sb.from('uvengers_program_cohorts').delete().match(row);
  t.classList.remove('saving');
  if (error) { box.checked = !box.checked; msg('cohort-msg', '저장하지 못했습니다: ' + error.message); return; }
  // 서버가 받아 준 그 칸만 화면 기록에 반영한다(전체 재로딩 없음)
  links = box.checked ? [...links, row] : links.filter((l) => !(l.program_code === row.program_code && l.cohort === row.cohort));
  msg('cohort-msg', `${row.cohort} 에 ${programs.find((p) => p.code === row.program_code)?.name || row.program_code} 을 ${box.checked ? '켰' : '껐'}습니다.`, 'ok');
  renderMatrix();
});

$('btn-cohort-add').addEventListener('click', () => busy($('btn-cohort-add'), async () => {
  const name = $('cohort-new').value.trim();
  if (!name) { msg('cohort-msg', '기수 이름을 넣으세요'); return; }
  const { error } = await sb.from('uvengers_cohorts').insert({ name, sort: 100 + cohorts.length * 10 });
  if (error) { msg('cohort-msg', '추가하지 못했습니다: ' + (error.code === '23505' ? '이미 있는 기수입니다' : error.message)); return; }
  $('cohort-new').value = '';
  msg('cohort-msg', `${name} 을 추가했습니다.`, 'ok');
  await load(); render();
}));

$('btn-rel-save').addEventListener('click', () => busy($('btn-rel-save'), async () => {
  const f = {
    program_code: $('rel-program').value, version: $('rel-version').value.trim(), tag: $('rel-tag').value.trim(),
    file_name: $('rel-file').value.trim(), bytes: Number(String($('rel-bytes').value).replace(/[^0-9]/g, '')),
    sha256: $('rel-sha').value.trim().toLowerCase(), download_url: $('rel-url').value.trim(),
    notes: $('rel-notes-text').value.trim() || null,
    notes_url: $('rel-notes').value.trim() || null, published_at: $('rel-date').value, is_prerelease: $('rel-pre').checked,
  };
  const errors = releaseFormErrors(f);
  if (errors.length) { msg('rel-msg', errors.join(' · ')); return; }
  // 게시일은 날짜만 받으므로 같은 날 두 판이면 등록 순(id)이 최신을 정한다 — 시각은 지금 시각으로
  const { error } = await sb.from('uvengers_releases').insert({ ...f, published_at: f.published_at + 'T' + new Date().toTimeString().slice(0, 8) + '+09:00' });
  if (error) { msg('rel-msg', '등록하지 못했습니다: ' + (error.code === '23505' ? '같은 태그가 이미 있습니다' : error.message)); return; }
  msg('rel-msg', `${f.tag} 을 등록했습니다.`, 'ok');
  for (const id of ['rel-version', 'rel-tag', 'rel-file', 'rel-bytes', 'rel-date', 'rel-sha', 'rel-url', 'rel-notes-text', 'rel-notes']) $(id).value = '';
  await load(); render();
}));

$('btn-prg-save').addEventListener('click', () => busy($('btn-prg-save'), async () => {
  const row = { code: $('prg-code').value.trim(), name: $('prg-name').value.trim(), tagline: $('prg-tagline').value.trim() || null,
    guide_url: $('prg-guide').value.trim() || null };
  if (!/^[a-z0-9-]+$/.test(row.code) || !row.name) { msg('prg-msg', '코드는 영문 소문자·숫자·하이픈, 이름은 비울 수 없습니다'); return; }
  if (row.guide_url && !/^https:\/\//.test(row.guide_url)) { msg('prg-msg', '안내 링크는 https:// 로 시작해야 합니다'); return; }
  const { error } = await sb.from('uvengers_programs').insert(row);
  if (error) { msg('prg-msg', '추가하지 못했습니다: ' + (error.code === '23505' ? '이미 있는 코드입니다' : error.message)); return; }
  msg('prg-msg', `${row.name} 을 추가했습니다.`, 'ok');
  for (const id of ['prg-code', 'prg-name', 'prg-tagline', 'prg-guide']) $(id).value = '';
  await load(); render();
}));
