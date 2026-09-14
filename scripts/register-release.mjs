// UV 포털 — 릴리스 한 판을 포털에 등록한다(관리자 폼을 대신한다 — 사용자 2026-09-14 「내가 직접할 일은 없어서」).
//
// 쓰는 법(릴리스 절차의 `gh release create/upload` 뒤):
//   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/register-release.mjs --tag v1.3.3-rc.7 --sha256 <64자리> \
//        --changelog ../uv-global-reaction-editor/CHANGELOG.md [--program uv-global-reaction-editor] [--repo raion-log/...]
//        [--installer <설치기 경로>: sha256 을 직접 잰다] [--notes-file <줄마다 한 항목>] [--dry-run]
//
// 무엇을 어디서 가져오나(손으로 옮겨 적지 않는다):
//   파일 이름·크기·다운로드 링크·게시 시각·RC 여부 → `gh release view`(GitHub 릴리스가 정본)
//   SHA-256 → --sha256(굽기 로그 CANDIDATE_READY 값) 또는 --installer 로 직접 잼. 둘 다 있으면 같아야 한다.
//   바뀐 점 → CHANGELOG 의 `## [판]` 절의 `### ` 제목들(줄마다 한 항목). --notes-file 이 있으면 그것.
// 같은 태그를 다시 돌리면 값을 갱신한다(스크립트가 정본이다). 토큰은 환경변수로만.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { changelogNotes, NOTES_MAX } from '../portal-logic.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REF = 'dnflcjpjzqmrybtcleqy';
const REPOS = { 'uv-global-reaction-editor': 'raion-log/uv-global-reaction-editor-releases' };   // 프로그램 코드 → GitHub 릴리스 저장소

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => {
  if (x.startsWith('--')) a.push([x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]);
  return a;
}, []));
const program = args.program || 'uv-global-reaction-editor';
const repo = args.repo || REPOS[program];
const tag = args.tag;
if (!tag || !/^v\d+\.\d+\.\d+(-rc\.\d+)?$/.test(tag)) { console.error('--tag v1.3.3-rc.7 꼴이 필요합니다'); process.exit(2); }
if (!repo) { console.error(`--repo 가 필요합니다(프로그램 ${program} 의 릴리스 저장소를 모릅니다)`); process.exit(2); }
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!args['dry-run'] && !(token && token.startsWith('sbp_'))) { console.error('SUPABASE_ACCESS_TOKEN(sbp_...) 이 없습니다'); process.exit(2); }

// 1) GitHub 릴리스에서 파일·크기·링크·게시 시각·RC 여부
const rel = JSON.parse(execFileSync('gh', ['release', 'view', tag, '-R', repo, '--json', 'assets,publishedAt,isPrerelease,url,tagName'], { encoding: 'utf8' }));
const asset = (rel.assets || []).find((a) => /\.(exe|zip|msi|dmg)$/i.test(a.name));
if (!asset) { console.error(`릴리스 ${tag} 에 설치 파일(exe/zip/msi/dmg) 자산이 없습니다`); process.exit(1); }
const version = tag.replace(/^v/, '').replace(/-rc\.\d+$/, '');

// 2) SHA-256 — 굽기 로그 값과 실제 파일 해시가 둘 다 있으면 같아야 한다
let sha = String(args.sha256 || '').toLowerCase();
if (args.installer) {
  const h = crypto.createHash('sha256').update(fs.readFileSync(args.installer)).digest('hex');
  if (sha && sha !== h) { console.error(`SHA-256 불일치: --sha256 ${sha.slice(0, 12)}… vs 파일 ${h.slice(0, 12)}…`); process.exit(1); }
  sha = h;
}
if (!/^[0-9a-f]{64}$/.test(sha)) { console.error('--sha256(64자리) 또는 --installer 가 필요합니다'); process.exit(2); }

// 3) 바뀐 점 — CHANGELOG 절 제목(줄마다 한 항목) 또는 --notes-file
let notes = null;
if (args['notes-file']) notes = fs.readFileSync(args['notes-file'], 'utf8').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).join('\n');
else if (args.changelog) notes = changelogNotes(fs.readFileSync(args.changelog, 'utf8'), tag.replace(/^v/, '')).join('\n') || null;
if (notes && notes.length > NOTES_MAX) { console.error(`바뀐 점이 ${NOTES_MAX}자를 넘습니다(${notes.length}자) — --notes-file 로 줄여 주세요`); process.exit(1); }

const row = {
  program_code: program, version, tag, file_name: asset.name, bytes: asset.size, sha256: sha,
  download_url: asset.url || asset.browser_download_url || `https://github.com/${repo}/releases/download/${tag}/${asset.name}`,
  notes_url: rel.url, published_at: rel.publishedAt, is_prerelease: !!rel.isPrerelease, notes,
};
console.log('등록할 판:', JSON.stringify({ ...row, sha256: sha.slice(0, 12) + '…', notes: notes ? notes.split('\n').length + '항목' : '(없음)' }));
if (args['dry-run']) { console.log('(dry-run — 쓰지 않음)'); process.exit(0); }

// 4) 관리 API 로 SQL 한 번(값은 dollar-quoting 으로 안전하게)
const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'boolean' ? String(v) : typeof v === 'number' ? String(v) : `$q$${String(v)}$q$`);
const sql = `insert into public.uvengers_releases (program_code, version, tag, file_name, bytes, sha256, download_url, notes_url, published_at, is_prerelease, notes)
values (${q(row.program_code)}, ${q(row.version)}, ${q(row.tag)}, ${q(row.file_name)}, ${row.bytes}, ${q(row.sha256)}, ${q(row.download_url)}, ${q(row.notes_url)}, ${q(row.published_at)}::timestamptz, ${row.is_prerelease}, ${q(row.notes)})
on conflict (program_code, tag) do update set file_name = excluded.file_name, bytes = excluded.bytes, sha256 = excluded.sha256, download_url = excluded.download_url,
  notes_url = excluded.notes_url, published_at = excluded.published_at, is_prerelease = excluded.is_prerelease, notes = coalesce(excluded.notes, public.uvengers_releases.notes);
select version, tag, published_at from public.uvengers_releases where program_code = ${q(row.program_code)} and tag = ${q(row.tag)};`;
const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
  method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
});
const body = await r.text();
if (r.status !== 201) { console.error('등록 실패:', r.status, body.slice(0, 300)); process.exit(1); }
console.log('등록됨:', body.slice(0, 200));

// 5) 공개 함수로 되읽어 「포털 최신 판 = 이 판」인지 확인(릴리스 검증이 같은 함수를 본다)
const anon = fs.readFileSync(path.join(HERE, '..', 'portal.js'), 'utf8').match(/SUPABASE_ANON_KEY = '([^']+)'/)[1];
const chk = await fetch(`https://${REF}.supabase.co/rest/v1/rpc/portal_latest_public`, {
  method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: program }),
});
const latest = await chk.json();
const top = Array.isArray(latest) ? latest[0] : latest;
if (!top || top.tag !== tag) { console.error('포털 최신 판이 이 판이 아닙니다:', JSON.stringify(top)); process.exit(1); }
console.log(`PORTAL_RELEASE_OK ${program} ${top.version} ${top.tag}`);
