# 교육과정 안내 공개 사이트 — 설치 가이드

노션 「교육과정 안내」의 과목·강사·커리큘럼을 읽어 홈페이지처럼 보이는 공개 사이트를 만듭니다.
작업자는 노션만 수정하고, **갱신 링크**를 누르면 5~10분 뒤 공개 사이트에 반영됩니다.

- 비용: 무료 (노션 무료 · GitHub 무료 · Google Apps Script 무료)
- 공개 주소: `https://계정이름.github.io/저장소이름/` — 갱신해도 바뀌지 않습니다
- 수강생: 로그인 없이 열람만 가능 / 노션 원본은 공개되지 않습니다

처음 한 번만 아래 순서대로 설정하면 됩니다. (약 30분)

---

## 1단계. 노션 연결 키 만들기

1. https://www.notion.so/profile/integrations 에 접속 → **새 통합 만들기**
2. 이름: `교육과정 안내 사이트` / 연결할 워크스페이스 선택 / 유형: **내부**
3. 만든 뒤 **기능** 탭에서 **콘텐츠 읽기만 체크**하고 콘텐츠 업데이트·입력은 해제 → 저장
4. **내부 통합 시크릿**을 복사해 둡니다. (`ntn_` 로 시작하는 긴 문자열 = 노션 키)
5. 노션에서 **「교육과정 안내」** 페이지를 열고 오른쪽 위 `⋯` → **연결** → 방금 만든 `교육과정 안내 사이트` 추가
   - 이 페이지 아래의 과목 목록·커리큘럼·강사 이력 데이터베이스가 함께 연결됩니다.

> 노션 키는 비밀번호와 같습니다. 노션 페이지나 GitHub 파일에 적지 마세요.

## 2단계. GitHub에 사이트 올리기

1. https://github.com 가입 (무료) → 오른쪽 위 `+` → **New repository**
   - Repository name: `course-guide` (원하는 영문 이름)
   - **Public** 선택 (무료로 사이트를 게시하려면 Public 이어야 합니다. 코드만 공개되고 노션 키는 공개되지 않습니다)
   - Create repository
2. 만들어진 저장소에서 **uploading an existing file** 링크 (또는 Add file → Upload files)
   - 받은 zip 을 풀고, 그 안의 **파일과 폴더를 전부** 끌어다 놓기 → Commit changes
   - `.github` 폴더가 꼭 올라가야 합니다. 맥에서 안 보이면 Finder 에서 `⌘ + Shift + .` 를 누르면 보입니다.
   - 그래도 안 올라가면: Add file → **Create new file** → 이름 칸에 `.github/workflows/build.yml` 입력 → zip 안의 같은 파일 내용을 붙여넣기 → Commit
3. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `NOTION_TOKEN` / Secret: 1단계에서 복사한 노션 키 → Add secret
4. 저장소 **Settings → Pages** → Build and deployment 의 Source 를 **GitHub Actions** 로 선택
5. 저장소 **Actions** 탭 → 왼쪽 「공개 페이지 갱신」 → **Run workflow** → 초록 버튼
   - 5~10분 뒤 초록 체크가 뜨면 완료. 실행 기록을 열면 공개 주소가 보입니다.
   - 공개 주소: `https://계정이름.github.io/course-guide/`

여기까지 하면 사이트가 열립니다. 이후 갱신은 3단계의 갱신 링크로 합니다.

## 3단계. 노션용 갱신 링크 만들기

작업자가 GitHub 에 들어가지 않고 링크 하나로 갱신할 수 있게 해 주는 단계입니다.

### 3-1. GitHub 토큰 만들기
1. GitHub 오른쪽 위 프로필 → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**
2. Token name: `교육과정 갱신` / Expiration: 최대 기간 (만료되면 다시 만들어 3-3 의 값만 바꾸면 됩니다)
3. Repository access: **Only select repositories** → `course-guide`
4. Permissions → Repository permissions
   - **Contents: Read and write** (갱신 신호를 보내는 데 필요)
   - **Actions: Read-only** (진행 상황 확인용)
5. Generate token → 토큰 복사 (`github_pat_` 로 시작)

### 3-2. Apps Script 웹 앱 만들기
1. https://script.google.com → **새 프로젝트** → 이름 `교육과정 갱신 링크`
2. 기본 `Code.gs` 내용을 지우고 zip 안 `apps-script/갱신링크.gs` 내용을 통째로 붙여넣기 → 저장

### 3-3. 설정값 넣기
왼쪽 톱니바퀴 **프로젝트 설정 → 스크립트 속성 → 스크립트 속성 추가** 로 4개를 넣습니다.

| 속성 | 값 |
| --- | --- |
| `GITHUB_TOKEN` | 3-1 에서 복사한 토큰 |
| `REPO` | `계정이름/course-guide` |
| `KEY` | 아무 영문·숫자 20자 이상 (예: `nowon2026refreshK7x9Qa`) |
| `SITE_URL` | `https://계정이름.github.io/course-guide/` (끝에 `/` 포함) |

### 3-4. 배포
1. 오른쪽 위 **배포 → 새 배포** → 유형 **웹 앱**
2. 실행 사용자: **나** / 액세스 권한: **모든 사용자** → 배포 → 권한 승인
3. 웹 앱 URL 을 복사합니다.
4. 갱신 링크 = `웹 앱 URL` + `?key=` + `KEY 값`
   - 예: `https://script.google.com/macros/s/AKfy...../exec?key=nowon2026refreshK7x9Qa`
5. 이 링크를 노션 **「교육과정 내부 운영 관리」 → 작업 가이드 6번**의 「제작 중」 박스 자리에 붙여넣습니다.
   - 공개 주소와 점검 결과 주소(`공개주소/report.html`)도 같이 적어 두면 편합니다.

> 갱신 링크는 내부 운영 관리 페이지에만 둡니다. 공개 페이지나 수강생에게 보내지 마세요.

---

## 사용 방법 (작업자)

1. 노션에서 내용을 고칩니다. (내부 운영 관리 페이지의 작업 가이드 참고)
2. 갱신 링크를 누릅니다. → 「갱신을 시작했습니다」 화면이 뜹니다.
3. 5~10분 뒤 「갱신이 끝났습니다」가 뜨면 공개 페이지를 새로고침합니다.
4. **점검 결과 보기**에서 비어 있는 항목(입력 안 된 회차, 사진 없는 강사 등)을 확인합니다.

갱신에 실패하면 공개 페이지는 **이전 내용 그대로** 유지됩니다.

## 공개 페이지에 나오는 규칙

| 노션 | 공개 페이지 |
| --- | --- |
| 숨기기 체크 | 표시 안 함 |
| 📄 로 시작하는 템플릿 | 표시 안 함 |
| 노란 배경 박스 | 표시 안 함 (내부 안내용) |
| 「학습 주제 입력」 등 템플릿 안내 문구 | 표시 안 함, 점검 결과에 알림 |
| 회차가 전부 비어 있는 커리큘럼 | 「상세 커리큘럼을 준비하고 있습니다」 |
| 학과 태그 색 (과목 배정 관리 표) | 학과 카드·커리큘럼 페이지 색 |
| 수업 구분 태그 (순서·색) | 메인 필터 버튼 — 새 태그를 쓰면 버튼이 자동으로 생김 |
| 커리큘럼 수업 구분 여러 개 (예: 격일반 + 주말반) | 같은 페이지로 가는 버튼이 구분마다 하나씩 표시 |
| 강사 「직책」 | 이름 뒤 표시, 비우면 「강사」 |
| 강사 「소속 표시」 | 이름 아래 표시, 학과 하나면 그 학과 색 |
| 강사 본문 제목 위쪽 글 | 표시 안 함 |
| 강의 가능 과목 (쉼표·가운뎃점·줄바꿈 구분) | 태그로 나눠 표시 |
| 노션 이미지 | 갱신 때 사이트에 저장 (주소 만료 없음) |

페이지 주소는 노션 페이지 ID 로 만들어져서, 노션에서 제목을 바꿔도 주소가 바뀌지 않습니다.

## 문제 해결

| 증상 | 확인할 것 |
| --- | --- |
| Actions 실행이 빨간 X | 실행 기록 → build → 「노션 내용으로 사이트 만들기」 로그의 마지막 줄 |
| 로그에 「노션 API 오류 401」 | `NOTION_TOKEN` 값을 다시 복사해 넣기 |
| 로그에 「노션 API 오류 404」 | 1단계 5번 (교육과정 안내 페이지에 연결 추가) |
| 갱신 링크에서 「오류 401/403」 | GitHub 토큰 만료 또는 권한 부족 → 3-1 다시, 3-3 의 `GITHUB_TOKEN` 교체 |
| 갱신 링크에서 「링크가 올바르지 않습니다」 | 링크 끝 `?key=` 값과 `KEY` 속성이 같은지 |
| 새 학과가 메인에 안 보임 | `config.json` 의 departments 에 학과 이름 추가 (없으면 오른쪽 맨 아래에 자동 표시) |

## 파일 구성

```
config.json              노션 데이터베이스 ID · 사이트 문구 · 학과 배치
scripts/build.mjs        사이트 생성 (GitHub Actions 가 실행)
lib/notion.mjs           노션 API 연결
lib/data.mjs             데이터베이스 읽기
lib/parse.mjs            본문 해석 (회차 카드 · 준비 사항 · 이미지 · 안내 문구 제외)
lib/render.mjs           페이지 HTML
assets/                  디자인(CSS) · 검색 · A4 이미지 저장
.github/workflows/       갱신 자동화
apps-script/갱신링크.gs   노션용 갱신 링크
```
