# SJ BEAUTY HAIR 공식 홈페이지

대전 미용실 프랜차이즈 SJ뷰티헤어의 공식 홈페이지입니다.
브랜드 소개 · 5개 지점 안내 · 헤어칼럼 · 영상 갤러리 · 문의로 구성됩니다.

---

## 글 올리는 방법 — 세 가지 중 편한 것으로

어느 방법으로 올리든 **같은 파일**이 고쳐지므로 내용이 갈라지지 않습니다.

### 방법 1. 웹 관리자 화면 (가장 쉬움, 직원용)

1. 홈페이지 주소 뒤에 `/admin` 을 붙여 접속합니다.
2. **Login with GitHub** 를 누르고 GitHub 계정으로 로그인합니다.
3. 왼쪽에서 **헤어칼럼** 또는 **영상** 을 고르고 **New** 를 누릅니다.
4. 제목·본문·사진을 채우고 오른쪽 위 **Publish** 를 누릅니다.
5. 1~2분 뒤 홈페이지에 자동으로 나타납니다.

> 작성 중인 글은 **작성 중** 항목에 체크해 두세요. 체크된 글은 홈페이지에 보이지 않습니다.

### 방법 2. Obsidian (개인 집필용)

처음 한 번만 설정하면 됩니다.

1. 이 저장소를 컴퓨터로 내려받습니다.
2. Obsidian 을 열고 **Open folder as vault** 로 `content` 폴더를 지정합니다.
3. 커뮤니티 플러그인에서 **Obsidian Git** 을 설치합니다.
4. 글을 쓰고 저장한 뒤, Obsidian Git 의 **Commit and push** 를 누릅니다.

글 맨 위에는 아래 형식을 그대로 넣어주세요. 이 부분이 제목·날짜·분류가 됩니다.

```markdown
---
title: 글 제목
date: 2026-09-20
category: 헤어칼럼      # 헤어칼럼 / 스타일 / 공지 중 하나
summary: 목록에 보일 한 줄 요약
author: SJ뷰티헤어 둔산본점
draft: false            # true 로 두면 홈페이지에 안 보입니다
---

여기부터 본문입니다.
```

**사진**은 글에 그냥 붙여넣으면 됩니다. `content/posts/attachments/` 에 저장되고,
홈페이지에서는 자동으로 압축돼 표시됩니다. (설정이 이미 되어 있습니다)

### 방법 3. Claude 에게 맡기기

"이번 주 헤어칼럼 써서 올려줘" 처럼 부탁하면 초안 작성부터 게시까지 대신 합니다.

---

## 정보를 바꾸고 싶을 때

거의 모든 내용은 **`src/config.ts` 한 파일**에 모여 있습니다. 여기만 고치면 전 페이지에 반영됩니다.

| 바꾸고 싶은 것 | 고칠 곳 |
|---|---|
| 지점 주소·전화번호 | `BRANCHES` |
| 네이버 예약 주소 | `BRANCHES` 안의 `naverBooking` |
| 대표 이메일·인스타그램 | `BRAND` |
| 영업시간 | `BRAND.hours` |
| 상단 메뉴 구성 | `NAV` |

> `naverBooking` 이 비어 있으면 예약 버튼이 **자동으로 숨겨집니다.**
> 주소를 넣는 순간 메인·지점 페이지에 예약 버튼이 나타납니다.

---

## 개발자용

```bash
npm install      # 최초 1회
npm run dev      # 로컬 서버 (http://localhost:4321)
npm run build    # 배포용 빌드 → dist/
npm run preview  # 빌드 결과 확인
```

### 구조

```
content/          글 원본 (Obsidian 보관함으로 여는 폴더)
  posts/          헤어칼럼 .md
    attachments/  글에 붙인 사진
  videos/         영상 정보 .md
src/
  config.ts       지점·연락처 등 모든 데이터
  pages/          페이지
  components/     공통 조각
public/
  admin/          웹 관리자 화면 설정
  uploads/        관리자 화면으로 올린 사진
api/              관리자 로그인 처리 (Vercel 서버 함수)
```

### 배포

`main` 브랜치에 push 하면 Vercel 이 자동으로 빌드·배포합니다.

관리자 화면 로그인을 위해 Vercel 프로젝트에 아래 환경변수가 필요합니다.

| 이름 | 값 |
|---|---|
| `OAUTH_CLIENT_ID` | GitHub OAuth App 의 Client ID |
| `OAUTH_CLIENT_SECRET` | GitHub OAuth App 의 Client Secret |

GitHub OAuth App 의 **Authorization callback URL** 은 `https://<배포주소>/api/callback` 으로 설정합니다.
