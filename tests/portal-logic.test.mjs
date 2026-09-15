import assert from 'node:assert/strict';
import test from 'node:test';
import { roleOf, membershipAlive, visiblePrograms, latestRelease, fmtBytes, validUntilLabel, releaseFormErrors,
  focusPrograms, focusFromLocation } from '../portal-logic.mjs';

const NOW = new Date('2026-09-14T00:00:00+09:00');
const PROGRAMS = [
  { code: 'uv-global-reaction-editor', name: 'UV 글로벌 반응 편집기', active: true },
  { code: 'uv-vrewauto', name: 'VrewAuto', active: true },
  { code: 'uv-old', name: '은퇴', active: false },
];

test('관리자는 살아 있는 프로그램을 전부 본다, 은퇴한 것은 아무도 못 본다', () => {
  const me = { is_admin: true, memberships: [] };
  assert.deepEqual(visiblePrograms(PROGRAMS, me, NOW).map((p) => p.code), ['uv-global-reaction-editor', 'uv-vrewauto']);
});

test('수강생은 자격이 살아 있는 프로그램만 본다', () => {
  const me = { is_admin: false, memberships: [
    { program_code: 'uv-global-reaction-editor', status: 'approved', valid_until: '2027-01-31T00:00:00+09:00' },
    { program_code: 'uv-vrewauto', status: 'approved', valid_until: '2026-01-01T00:00:00+09:00' },   // 만료
  ] };
  assert.deepEqual(visiblePrograms(PROGRAMS, me, NOW).map((p) => p.code), ['uv-global-reaction-editor']);
  assert.equal(roleOf(me), 'student');
});

test('자격 판정 — 기한 없음은 산다, 거절·정지는 죽는다', () => {
  assert.equal(membershipAlive({ status: 'approved', valid_until: null }, NOW), true);
  assert.equal(membershipAlive({ status: 'rejected', valid_until: null }, NOW), false);
  assert.equal(membershipAlive({ status: 'suspended', valid_until: '2027-01-01' }, NOW), false);
  assert.equal(membershipAlive(null, NOW), false);
});

test('최신 판은 게시일 기준이고 후보를 뺄 수 있다', () => {
  const rel = [
    { version: '1.3.0', tag: 'v1.3.0', published_at: '2026-09-08T16:09:46Z', is_prerelease: false },
    { version: '1.3.3', tag: 'v1.3.3-rc.6', published_at: '2026-09-13T10:00:00Z', is_prerelease: true },
  ];
  assert.equal(latestRelease(rel).tag, 'v1.3.3-rc.6');
  assert.equal(latestRelease(rel, { includePrerelease: false }).tag, 'v1.3.0');
  assert.equal(latestRelease([]), null);
});

test('크기·기한 표기는 랜딩페이지와 같은 꼴이다', () => {
  assert.equal(fmtBytes(670338555), '639MB (670,338,555 바이트)');
  assert.equal(fmtBytes('x'), '');
  assert.equal(validUntilLabel('2027-01-31T00:00:00+09:00', NOW), '2027. 1. 31. 까지 (139일 남음)');
  assert.equal(validUntilLabel(null), '기한 없음');
  assert.match(validUntilLabel('2026-01-01T00:00:00+09:00', NOW), /만료$/);
});

test('프로그램 전용 링크(?p=코드)로 들어오면 그 프로그램 하나만 보인다', () => {
  const me = { is_admin: false, memberships: [
    { program_code: 'uv-global-reaction-editor', status: 'approved', valid_until: null },
    { program_code: 'uv-vrewauto', status: 'approved', valid_until: null },
  ] };
  const mine = visiblePrograms(PROGRAMS, me, NOW);
  assert.deepEqual(focusPrograms(mine, 'uv-vrewauto').map((p) => p.code), ['uv-vrewauto']);
  assert.deepEqual(focusPrograms(mine, '').map((p) => p.code), ['uv-global-reaction-editor', 'uv-vrewauto']);   // 링크 없으면 전부
  // 자격 없는 프로그램 링크로 들어오면 빈 목록 — 화면은 「이 계정에 열려 있지 않은 프로그램」을 보인다
  assert.deepEqual(focusPrograms(mine, 'uv-old'), []);
  assert.equal(focusFromLocation({ search: '?p=uv-vrewauto', hash: '' }), 'uv-vrewauto');
  assert.equal(focusFromLocation({ search: '', hash: '#uv-global-reaction-editor' }), 'uv-global-reaction-editor');
  assert.equal(focusFromLocation({ search: '?p=Bad%20Code!', hash: '' }), '');                      // 코드 모양이 아니면 무시
});


test('판 등록 폼은 빈 것과 틀린 모양을 한국어로 짚는다', () => {
  const ok = { program_code: 'uv-global-reaction-editor', version: '1.3.3', tag: 'v1.3.3-rc.6',
    file_name: 'UV-Global-Reaction-Editor_1.3.3_x64-setup.exe', bytes: 670338555,
    sha256: 'fe28374388f3f4acc5fbb23ac1f4e9263d4da6162b4faa5bd9a288681cf70ed0',
    download_url: 'https://github.com/raion-log/uv-global-reaction-editor-releases/releases/download/v1.3.3-rc.6/x.exe',
    published_at: '2026-09-13' };
  assert.deepEqual(releaseFormErrors(ok), []);
  const bad = releaseFormErrors({ ...ok, tag: '1.3.3', sha256: 'abc', bytes: 0 });
  assert.equal(bad.length, 3, bad.join(' / '));
});

test('수강생 카드에는 정식 최신과 그보다 새 후보가 따로 보이고, 지난 판은 기록으로 남는다', async () => {
  const { releaseLines } = await import('../portal-logic.mjs');
  const rel = [
    { version: '1.3.0', tag: 'v1.3.0', published_at: '2026-09-08T16:09:46Z', is_prerelease: false },
    { version: '1.3.3', tag: 'v1.3.3-rc.6', published_at: '2026-09-13T10:00:00Z', is_prerelease: true },
    { version: '1.2.2', tag: 'v1.2.2', published_at: '2026-08-28T00:00:00Z', is_prerelease: false },
  ];
  const l = releaseLines(rel);
  assert.equal(l.stable.tag, 'v1.3.0');                 // 정식 최신
  assert.equal(l.candidate.tag, 'v1.3.3-rc.6');         // 정식보다 새 후보만
  assert.deepEqual(l.history.map((r) => r.tag), ['v1.3.3-rc.6', 'v1.3.0', 'v1.2.2']);   // 전부, 새 것부터
  // 정식이 후보보다 새면 후보 줄은 없다
  const l2 = releaseLines([rel[1], { version: '1.3.3', tag: 'v1.3.3', published_at: '2026-09-20T00:00:00Z', is_prerelease: false }]);
  assert.equal(l2.stable.tag, 'v1.3.3');
  assert.equal(l2.candidate, null);
  // 후보만 있으면 정식 줄은 없고 후보가 보인다
  const l3 = releaseLines([rel[1]]);
  assert.equal(l3.stable, null);
  assert.equal(l3.candidate.tag, 'v1.3.3-rc.6');
  assert.deepEqual(releaseLines([]), { stable: null, candidate: null, history: [] });
});

const OK_FORM = { program_code: 'uv-global-reaction-editor', version: '1.3.3', tag: 'v1.3.3-rc.6',
  file_name: 'UV-Global-Reaction-Editor_1.3.3_x64-setup.exe', bytes: 670338555,
  sha256: 'fe28374388f3f4acc5fbb23ac1f4e9263d4da6162b4faa5bd9a288681cf70ed0',
  download_url: 'https://github.com/raion-log/uv-global-reaction-editor-releases/releases/download/v1.3.3-rc.6/x.exe',
  published_at: '2026-09-13' };

test('카드는 가장 새 판 하나를 받으라고 내밀고 나머지는 지난 판으로 접는다', async () => {
  const { pickRelease } = await import('../portal-logic.mjs');
  const rel = [
    { version: '1.3.0', tag: 'v1.3.0', published_at: '2026-09-08T16:09:46Z', is_prerelease: false },
    { version: '1.3.3', tag: 'v1.3.3-rc.6', published_at: '2026-09-13T10:00:00Z', is_prerelease: true },
  ];
  const { pick, others } = pickRelease(rel);
  assert.equal(pick.tag, 'v1.3.3-rc.6');                       // 후보라도 가장 새 것 하나 — 「뭘 받아야 하는지」가 하나여야 한다
  assert.deepEqual(others.map((r) => r.tag), ['v1.3.0']);
  assert.deepEqual(pickRelease([]), { pick: null, others: [] });
});

test('바뀐 점은 비워도 되고 600자 안이어야 한다(rc.6 의 CHANGELOG 제목 다섯 줄 338자가 들어가야 한다)', () => {
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes: '두 줄\n요약' }), []);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes: '' }), []);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes: 'x'.repeat(338) }), []);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes: 'x'.repeat(601) }), ['바뀐 점은 600자 안으로 줄여 주세요']);
});

test('바뀐 점은 줄마다 한 항목 — 앞의 - · • 는 떼고 빈 줄은 버린다', async () => {
  const { notesLines } = await import('../portal-logic.mjs');
  assert.deepEqual(notesLines('- AI 응답이 멈춰도 전체가 멈추지 않음\n• 발음 사전\n\n  나레이션 분량 ↑  '), ['AI 응답이 멈춰도 전체가 멈추지 않음', '발음 사전', '나레이션 분량 ↑']);
  assert.deepEqual(notesLines(null), []);
});

test('기수 × 프로그램 표 — 기수마다 한 줄, 프로그램마다 켜짐/꺼짐 칸, 회원 수', async () => {
  const { cohortMatrix } = await import('../portal-logic.mjs');
  const cohorts = [{ name: '빈이파파 1기', sort: 10, members: 0 }, { name: '유벤져스 1기', sort: 60, members: 98 }];
  const programs = [{ code: 'flow', name: 'RAION Flow Pro' }, { code: 'uv-global-reaction-editor', name: 'UV 글로벌 반응 편집기' }];
  const links = [{ program_code: 'flow', cohort: '빈이파파 1기' }];
  const rows = cohortMatrix(programs, cohorts, links);
  assert.deepEqual(rows.map((r) => r.cohort), ['빈이파파 1기', '유벤져스 1기']);
  assert.deepEqual(rows[0].cells.map((c) => [c.code, c.on]), [['flow', true], ['uv-global-reaction-editor', false]]);
  assert.equal(rows[1].members, 98);
  assert.deepEqual(rows[1].cells.map((c) => c.on), [false, false]);
});

test('구글 로그인 뒤 주소에서 ?p= 가 사라져도 기억해 둔 전용 링크 코드로 돌아온다', () => {
  assert.equal(focusFromLocation({ search: '', hash: '' }, 'flow'), 'flow');                 // 주소에 없으면 기억한 것
  assert.equal(focusFromLocation({ search: '?p=grok', hash: '' }, 'flow'), 'grok');          // 주소가 이긴다
  assert.equal(focusFromLocation({ search: '?code=abc', hash: '' }, 'flow'), 'flow');        // OAuth 가 붙인 ?code= 는 무시
  assert.equal(focusFromLocation({ search: '', hash: '' }, 'Bad Code!'), '');                // 기억한 것도 모양 검사
  assert.equal(focusFromLocation({ search: '', hash: '' }), '');
});

// ── 적대평가(2026-09-14) 뒤 — 검토자가 짚은 반대 사례들 ──
test('구글 로그인이 #access_token=… 을 달고 돌아와도 기억한 전용 링크 코드를 쓴다(암묵 흐름)', () => {
  assert.equal(focusFromLocation({ search: '', hash: '#access_token=abc&refresh_token=def' }, 'flow'), 'flow');
  assert.equal(focusFromLocation({ search: '', hash: '#access_token=abc' }), '');
});

test('게시일은 한국 날짜로 — UTC 로 온 timestamptz 가 하루 앞서 찍히면 안 된다', async () => {
  const { fmtDate } = await import('../portal-logic.mjs');
  assert.equal(fmtDate('2026-09-08T16:09:46+00:00'), '2026-09-09');     // 1.3.0 은 9월 9일 01:09 KST 에 나갔다
  assert.equal(fmtDate('2026-09-13T00:00:00+09:00'), '2026-09-13');
  assert.equal(fmtDate(null), '');
});

test('같은 게시일이면 나중에 등록한 판(id 큰 것)이 최신이다', () => {
  const rel = [
    { id: 1, version: '1.3.3', tag: 'v1.3.3-rc.6', published_at: '2026-09-13T00:00:00+09:00', is_prerelease: true },
    { id: 2, version: '1.3.3', tag: 'v1.3.3-rc.7', published_at: '2026-09-13T00:00:00+09:00', is_prerelease: true },
  ];
  assert.equal(latestRelease(rel).tag, 'v1.3.3-rc.7');
  assert.equal(latestRelease([rel[1], rel[0]]).tag, 'v1.3.3-rc.7');
});

test('판 이름은 RC 번호가 있을 때만 붙인다 — 태그가 v2.1.2 인 시험판에 태그를 통째로 붙이지 않는다', async () => {
  const { versionLabel } = await import('../portal-logic.mjs');
  assert.equal(versionLabel({ version: '1.3.3', tag: 'v1.3.3-rc.6', is_prerelease: true }), '1.3.3 RC6');
  assert.equal(versionLabel({ version: '2.1.2', tag: 'v2.1.2', is_prerelease: true }), '2.1.2');
  assert.equal(versionLabel({ version: '1.3.0', tag: 'v1.3.0', is_prerelease: false }), '1.3.0');
});

test('판 등록 폼은 zip·msi·dmg 도 받고, 노트 링크는 https 여야 한다', () => {
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, file_name: 'raion-flow-pro-v1.2.3.zip' }), []);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, file_name: 'x.txt' }), ['파일 이름은 exe·zip·msi·dmg 로 끝나야 합니다']);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes_url: 'javascript:alert(1)' }), ['릴리스 노트 링크는 https:// 로 시작해야 합니다']);
  assert.deepEqual(releaseFormErrors({ ...OK_FORM, notes_url: '' }), []);
});

test('카드의 자격 줄은 살아 있는 자격을 고른다 — 만료된 member 행이 앞에 있어도 기수 자격이 있으면 그것', async () => {
  const { pickMembership } = await import('../portal-logic.mjs');
  const ms = [
    { program_code: 'flow', status: 'approved', valid_until: '2026-01-01T00:00:00+09:00', via: 'member', cohort: null },
    { program_code: 'flow', status: 'approved', valid_until: null, via: 'cohort', cohort: '빈이파파 1기' },
  ];
  assert.equal(pickMembership(ms, 'flow', NOW).via, 'cohort');
  assert.equal(pickMembership(ms, 'grok', NOW), null);
  // 편집기 회원의 valid_until NULL 은 앱과 같이 「미승인」 — 살아 있는 자격이 아니다
  assert.equal(membershipAlive({ status: 'approved', valid_until: null, via: 'editor' }, NOW), false);
});

// ── 로그인은 편집기 앱과 같은 규칙(app/src/js/auth.js: toGmail·validGmailLocal·PW_MIN=6) ──
test('아이디는 @ 앞부분만 받아 gmail 로 만든다 — 전체 주소를 붙여 넣어도 앞부분만, 소문자로', async () => {
  const { toGmail, validGmailLocal } = await import('../portal-logic.mjs');
  assert.equal(toGmail(' UvGood2026 '), 'uvgood2026@gmail.com');
  assert.equal(toGmail('uvgood2026@gmail.com'), 'uvgood2026@gmail.com');
  assert.equal(toGmail('someone@naver.com'), 'someone@gmail.com');       // 앱과 같이 다른 도메인은 gmail 로 강제
  assert.equal(toGmail(''), '');
  assert.equal(validGmailLocal('uv.good_2026+a'), true);
  assert.equal(validGmailLocal('한글'), false);
  assert.equal(validGmailLocal(''), false);
});

test('새 비밀번호는 길이만 본다(6자 이상) — 앱·서버 정책과 같다', async () => {
  const { passwordProblem } = await import('../portal-logic.mjs');
  assert.equal(passwordProblem('abcde'), '비밀번호는 6자 이상이어야 합니다.');
  assert.equal(passwordProblem('abcdef'), '');
});

// ── 가입(앱과 같은 절차)과 릴리스 등록 스크립트의 순수 부분 ──
test('가입 폼 검사 — 이메일 아이디·비밀번호(6자)·성함·연락처 끝 4자리 모두 필수(앱과 같다)', async () => {
  const { signupErrors, PHONE_MSG } = await import('../portal-logic.mjs');
  const ok = { idInput: 'uvgood2026', password: 'abcdef', name: '홍길동', phone_last4: '1234', cohort: '유유스 1기', referral_code: '' };
  assert.deepEqual(signupErrors(ok), []);
  // ★끝 4자리는 미리 올린 명단과 맞춰 자동 승인하는 열쇠다 — 비우면 명단에 있어도 승인 대기로 간다(2026-09-15)
  assert.deepEqual(signupErrors({ ...ok, phone_last4: '' }), [PHONE_MSG]);
  assert.deepEqual(signupErrors({ ...ok, phone_last4: '12a' }), [PHONE_MSG]);
  assert.deepEqual(signupErrors({ ...ok, phone_last4: '12345' }), [PHONE_MSG]);
  assert.deepEqual(signupErrors({ ...ok, name: '' }), ['성함을 넣어 주세요']);
  assert.deepEqual(signupErrors({ ...ok, password: 'abc' }), ['비밀번호는 6자 이상이어야 합니다.']);
  assert.deepEqual(signupErrors({ ...ok, idInput: '한글' }), ['이메일 아이디(@ 앞부분)만 입력해 주세요']);
});

test('연락처 칸은 숫자만 끝 4자리까지 — 전화번호를 통째로 붙여 넣으면 끝 4자리(앱과 같다)', async () => {
  const { lastFourDigits } = await import('../portal-logic.mjs');
  assert.equal(lastFourDigits('010-1234-5678', { paste: true }), '5678');
  assert.equal(lastFourDigits('12a3'), '123');
  assert.equal(lastFourDigits('123456'), '1234');   // 치는 중에는 앞 네 자리에서 멈춘다(앱 keepFour)
  assert.equal(lastFourDigits(''), '');
});

// ── 사이트·앱 어디서 가입해도 된다(사용자 2026-09-15 「둘 다 허용」) — 승인 대기 중에도 설치기는 받는다 ──
test('편집기 승인 대기 회원도 편집기 카드(설치기)를 본다 — 앱은 승인 전엔 안 열리므로 미리 설치해 둔다', async () => {
  const { pickMembership, isPendingEditor } = await import('../portal-logic.mjs');
  const pending = { program_code: 'uv-global-reaction-editor', status: 'pending', valid_until: null, via: 'editor' };
  const me = { is_admin: false, memberships: [pending] };
  assert.deepEqual(visiblePrograms(PROGRAMS, me, NOW).map((p) => p.code), ['uv-global-reaction-editor']);
  assert.equal(isPendingEditor(pickMembership(me.memberships, 'uv-global-reaction-editor', NOW)), true);
  // 자격이 살아 있다는 뜻은 아니다 — 기한 줄은 여전히 승인 대기
  assert.equal(membershipAlive(pending, NOW), false);
});

test('승인 대기로 여는 것은 편집기뿐이다 — 차단·거절·다른 프로그램의 pending 은 안 보인다', async () => {
  const me = (m) => ({ is_admin: false, memberships: [m] });
  const ed = { program_code: 'uv-global-reaction-editor', valid_until: null, via: 'editor' };
  assert.deepEqual(visiblePrograms(PROGRAMS, me({ ...ed, status: 'blocked' }), NOW), []);
  assert.deepEqual(visiblePrograms(PROGRAMS, me({ ...ed, status: 'rejected' }), NOW), []);
  assert.deepEqual(visiblePrograms(PROGRAMS, me({ program_code: 'uv-vrewauto', status: 'pending', valid_until: null, via: 'member' }), NOW), []);
});

test('포털 SQL 의 편집기 판정도 승인 대기를 연다 — 화면만 열고 서버(RLS)가 0행을 주면 카드가 안 뜬다', async () => {
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../sql/portal.sql', import.meta.url), 'utf8');
  const fn = sql.split('create or replace function public.portal_can_see')[1].split('$$;')[0];
  assert.match(fn, /lower\(coalesce\(e\.status, ''\)\) = 'pending'/);
});

test('CHANGELOG 의 그 판 절에서 ### 제목만 뽑아 바뀐 점 항목으로 쓴다', async () => {
  const { changelogNotes } = await import('../portal-logic.mjs');
  const md = `# 바뀐 점\n\n## [1.3.3-rc.7] - 2026-09-15\n\n### 첫 번째 변화 (rc.2)\n\n설명\n\n### 두 번째 변화\n\n## [1.3.3-rc.6] - 2026-09-13\n\n### 옛 변화\n`;
  assert.deepEqual(changelogNotes(md, '1.3.3-rc.7'), ['첫 번째 변화', '두 번째 변화']);
  assert.deepEqual(changelogNotes(md, '9.9.9'), []);
});
