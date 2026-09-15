# UV 포털

수강생·관리자 프로그램 창구. 로그인 하나로 역할에 따라 다른 화면을 본다.

- 주소: https://raion-log.github.io/uv-portal/
- 관리자: 「프로그램 관리」 — 전체 프로그램·기수 × 프로그램 배정·배포 기록
- 수강생: 「내 프로그램」 — 자기 자격이 있는 프로그램의 최신 판 다운로드·이용 기한
- 설계 정본: `uv-global-reaction-editor/docs/superpowers/specs/2026-09-14-uv-portal-design.md`

## 구성

| 파일 | 무엇 |
|---|---|
| `index.html` · `portal.js` · `portal.css` | 화면. supabase-js(anon 키)로 로그인·조회. 로그인은 편집기 앱과 같은 규칙(Google 이메일 아이디 + 비밀번호, 구글 로그인 단추 없음) |
| `portal-logic.mjs` | 순수 계산(역할·자격·최신 판·표기) — `node --test tests/portal-logic.test.mjs`(이 Node 에서는 폴더 인자가 실패) |
| `sql/portal.sql` | 표 3개(`uvengers_programs`·`uvengers_releases`·`uvengers_program_members`), 판정 함수, RLS, 첫 데이터 |

보호는 서버 RLS 가 한다. 관리자 판정은 raion-admin 이 쓰는 `private.is_admin()` 그대로, 편집기 수강생 자격은 앱 관문이 보는
`uvengers_editor_members` 그대로. 화면 파일은 공개지만 데이터는 로그인한 사람의 몫만 돌아온다.

## 로그인 계정

같은 Supabase 프로젝트라 포털·편집기 앱·유유스 사이트가 **한 계정**(Google 이메일 아이디 + 비밀번호)을 쓴다.

수강생 흐름은 한 줄이다(D-086, 2026-09-15): **포털에서 가입(메일 8자리 코드) → 승인(명단의 성함·연락처 끝 4자리와 맞으면 즉시, 아니면 관리자)
→ 포털에 설치기 → 앱에서는 같은 계정으로 로그인만.** 승인 대기 중에는 설치기가 보이지 않는다.

- 이미 계정이 있는 사람(유유스 사이트·예전 구글 로그인·앱)이 가입을 누르면 로그인 화면으로 옮겨 준다. 로그인 뒤 편집기 신청이 없으면
  「이용 신청」 폼(성함·끝 4자리·기수)이 나온다 — 앱의 회원 등록 화면과 같은 행을 넣는다.
- 비밀번호를 잊거나 없으면(구글 로그인 계정) 「비밀번호를 잊으셨나요?」 — 메일의 8자리 코드 + 새 비밀번호 6자 이상.
- 메일(가입·재설정)은 코드만 간다. 링크는 없다.

## 수강생에게 주는 링크

프로그램 전용 링크는 주소 뒤에 코드를 붙인다 — `https://raion-log.github.io/uv-portal/?p=uv-global-reaction-editor`.
그 링크로 들어오면 로그인 뒤 **그 프로그램 하나만** 보이고 다른 곳으로 가는 단추는 없다. 자격이 없는 계정은
「이 계정에는 열려 있지 않은 프로그램입니다」만 본다. 공개 허브(`raion-log/uv`)는 그대로 둔다(사용자 2026-09-14).

## 처음 켜기

1. `sql/portal.sql` 을 Supabase 프로젝트(`dnflcjpjzqmrybtcleqy`)에 적용한다(대시보드 SQL 편집기 또는 관리 API).
2. (구글 로그인은 뺐다 — 사용자 2026-09-14. Redirect URL 은 있어도 무방하다.)
3. 관리자 계정(`uvengers_members.role='admin'`)으로 로그인해 「프로그램 관리」가 보이는지, 수강생 계정으로 「내 프로그램」에
   자기 것만 보이는지 확인한다.

## 릴리스 때

굽고 GitHub Release 를 올린 뒤 스크립트가 판을 넣는다(관리자 폼은 없앴다 — 사용자 2026-09-14):

```
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/register-release.mjs --tag v1.3.3-rc.7 --sha256 <CANDIDATE_READY 의 값> --changelog ../uv-global-reaction-editor/CHANGELOG.md
```

파일·크기·링크·게시 시각·RC 여부는 GitHub 릴리스에서, 바뀐 점은 CHANGELOG 의 그 판 절 `###` 제목에서 가져온다(`--notes-file` 로 바꿀 수 있다).
끝에 공개 함수 `portal_latest_public` 로 되읽어 `PORTAL_RELEASE_OK` 를 찍는다 — 편집기의 `npm run verify:release` 가 같은 함수를 본다.
프로그램 추가는 `sql/portal.sql` 씨앗 한 줄, 기수 배정은 관리자 탭 「기수 × 프로그램」.
