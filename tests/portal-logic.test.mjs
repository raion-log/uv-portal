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
