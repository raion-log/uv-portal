# UV 포털

수강생·관리자 프로그램 창구. 로그인 하나로 역할에 따라 다른 화면을 본다.

- 주소: https://raion-log.github.io/uv-portal/
- 관리자: 「프로그램 관리」 — 전체 프로그램·판·판 등록
- 수강생: 「내 프로그램」 — 자기 자격이 있는 프로그램의 최신 판 다운로드·이용 기한
- 설계 정본: `uv-global-reaction-editor/docs/superpowers/specs/2026-09-14-uv-portal-design.md`

## 구성

| 파일 | 무엇 |
|---|---|
| `index.html` · `portal.js` · `portal.css` | 화면. supabase-js(anon 키)로 로그인·조회 |
| `portal-logic.mjs` | 순수 계산(역할·자격·최신 판·표기) — `node --test tests/` |
| `sql/portal.sql` | 표 3개(`uvengers_programs`·`uvengers_releases`·`uvengers_program_members`), 판정 함수, RLS, 첫 데이터 |

보호는 서버 RLS 가 한다. 관리자 판정은 raion-admin 이 쓰는 `private.is_admin()` 그대로, 편집기 수강생 자격은 앱 관문이 보는
`uvengers_editor_members` 그대로. 화면 파일은 공개지만 데이터는 로그인한 사람의 몫만 돌아온다.

## 수강생에게 주는 링크

프로그램 전용 링크는 주소 뒤에 코드를 붙인다 — `https://raion-log.github.io/uv-portal/?p=uv-global-reaction-editor`.
그 링크로 들어오면 로그인 뒤 **그 프로그램 하나만** 보이고 다른 곳으로 가는 단추는 없다. 자격이 없는 계정은
「이 계정에는 열려 있지 않은 프로그램입니다」만 본다. 공개 허브(`raion-log/uv`)는 그대로 둔다(사용자 2026-09-14).

## 처음 켜기

1. `sql/portal.sql` 을 Supabase 프로젝트(`dnflcjpjzqmrybtcleqy`)에 적용한다(대시보드 SQL 편집기 또는 관리 API).
2. Supabase Auth → URL Configuration 의 Redirect URLs 에 `https://raion-log.github.io/uv-portal/` 를 더한다(Google 로그인).
3. 관리자 계정(`uvengers_members.role='admin'`)으로 로그인해 「프로그램 관리」가 보이는지, 수강생 계정으로 「내 프로그램」에
   자기 것만 보이는지 확인한다.

## 릴리스 때

굽고 GitHub Release 를 올린 뒤 「프로그램 관리 → 판 등록」에 CANDIDATE_READY 의 판·태그·파일·크기·해시·링크·게시일을 넣는다.
