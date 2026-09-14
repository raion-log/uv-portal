// UV 포털 — 화면이 쓰는 순수 계산. 서버(RLS)가 이미 걸러 준 행을 받아 「무엇을 어떻게 보일까」만 정한다.
// 시험: tests/portal-logic.test.mjs (node --test)

/** portal_me() 답 → 'admin' | 'student' */
export function roleOf(me) {
  return me && me.is_admin === true ? 'admin' : 'student';
}

/** 회원 자격이 살아 있나 — status 가 approved/active 이고 이용 기한이 안 지났으면 참 */
export function membershipAlive(m, now = new Date()) {
  if (!m) return false;
  const status = String(m.status || '').toLowerCase();
  if (status && !['approved', 'active', 'member'].includes(status)) return false;
  if (!m.valid_until) return true;
  const until = new Date(m.valid_until);
  return !Number.isNaN(until.getTime()) && until.getTime() >= now.getTime();
}

/** 수강생에게 보일 프로그램 — 자격이 살아 있는 프로그램만. 관리자는 전부. */
export function visiblePrograms(programs, me, now = new Date()) {
  const list = (programs || []).filter((p) => p && p.active !== false);
  if (roleOf(me) === 'admin') return list;
  const alive = new Set((me?.memberships || []).filter((m) => membershipAlive(m, now)).map((m) => m.program_code));
  return list.filter((p) => alive.has(p.code));
}

/** 최신 판 — 게시일 내림차순 첫 행. prerelease 를 뺄 수 있다. */
export function latestRelease(releases, { includePrerelease = true } = {}) {
  const rows = (releases || []).filter((r) => r && r.published_at && (includePrerelease || !r.is_prerelease));
  rows.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  return rows[0] || null;
}

/** 바이트 → 「639MB (670,338,555 바이트)」 — 랜딩페이지와 같은 꼴 */
export function fmtBytes(n) {
  const v = Number(n);
  if (!Number.isFinite(v) || v <= 0) return '';
  const mb = Math.floor(v / 1048576);
  return `${mb}MB (${v.toLocaleString('en-US')} 바이트)`;
}

/** 이용 기한 → 「2027. 1. 31. 까지 (140일 남음)」 / 「기한 없음」 / 「만료」 */
export function validUntilLabel(valid_until, now = new Date()) {
  if (!valid_until) return '기한 없음';
  const until = new Date(valid_until);
  if (Number.isNaN(until.getTime())) return '';
  const days = Math.ceil((until.getTime() - now.getTime()) / 86400000);
  const date = `${until.getFullYear()}. ${until.getMonth() + 1}. ${until.getDate()}.`;
  return days < 0 ? `${date} 만료` : `${date} 까지 (${days}일 남음)`;
}

/** 프로그램 전용 링크 — `?p=코드` 또는 `#코드`. 코드 모양(영문 소문자·숫자·하이픈)이 아니면 빈 문자열 */
export function focusFromLocation(loc) {
  const q = new URLSearchParams(loc?.search || '').get('p') || String(loc?.hash || '').replace(/^#/, '');
  const code = String(q || '').trim();
  return /^[a-z0-9-]+$/.test(code) ? code : '';
}

/** 전용 링크면 그 프로그램만, 아니면 그대로. 자격이 없는 코드면 빈 목록(화면이 「열려 있지 않은 프로그램」을 보인다) */
export function focusPrograms(programs, focus) {
  if (!focus) return programs || [];
  return (programs || []).filter((p) => p && p.code === focus);
}

/** 판 등록 폼 검사 — 빈 것·모양이 틀린 것을 한국어로 돌려준다. 통과면 [] */
export function releaseFormErrors(f) {
  const e = [];
  if (!f.program_code) e.push('프로그램을 고르세요');
  if (!/^\d+\.\d+\.\d+$/.test(String(f.version || ''))) e.push('판은 1.3.3 꼴이어야 합니다');
  if (!/^v\d+\.\d+\.\d+(-rc\.\d+)?$/.test(String(f.tag || ''))) e.push('태그는 v1.3.3 또는 v1.3.3-rc.6 꼴이어야 합니다');
  if (!String(f.file_name || '').toLowerCase().endsWith('.exe')) e.push('파일 이름은 .exe 로 끝나야 합니다');
  if (!(Number(f.bytes) > 0)) e.push('크기(바이트)를 숫자로 넣으세요');
  if (!/^[0-9a-f]{64}$/.test(String(f.sha256 || '').toLowerCase())) e.push('SHA-256 은 64자리 16진수여야 합니다');
  if (!/^https:\/\//.test(String(f.download_url || ''))) e.push('다운로드 링크는 https:// 로 시작해야 합니다');
  if (!f.published_at) e.push('게시일을 넣으세요');
  if (String(f.notes || '').length > 240) e.push('바뀐 점은 240자 안으로 줄여 주세요');
  return e;
}

/** 카드가 내미는 판 하나(가장 새 것, 후보 포함)와 나머지(새 것부터). 받을 것이 하나여야 헷갈리지 않는다(사용자 2026-09-14). */
export function pickRelease(releases) {
  const { history } = releaseLines(releases);
  return { pick: history[0] || null, others: history.slice(1) };
}

/** 카드에 보일 판 줄 — 정식 최신, 그보다 새 후보(없으면 null), 전체 기록(새 것부터).
 *  사용자 2026-09-14 「하나만 보이는 거 같아」: 최신 하나만 그리면 정식 판이 숨는다. 정식·후보를 따로 보이고 지난 판은 접어 둔다. */
export function releaseLines(releases) {
  const history = (releases || []).filter((r) => r && r.published_at).slice()
    .sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
  const stable = history.find((r) => !r.is_prerelease) || null;
  const cand = history.find((r) => r.is_prerelease) || null;
  const candidate = cand && (!stable || new Date(cand.published_at) > new Date(stable.published_at)) ? cand : null;
  return { stable, candidate, history };
}
