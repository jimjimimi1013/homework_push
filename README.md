# 린중국어 숙제 앱 — 최신 production 기준 소스

이 저장소는 Vercel production 운영본의 프런트엔드 소스와 Supabase Edge Function·마이그레이션을 함께 담고 있습니다.
작업 규칙은 `AGENTS.md`, 현재 기능·상태는 `HANDOFF.md`를 먼저 확인하세요.

## 실행

1. `.env.example`을 `.env`로 복사하고 실제 값을 로컬 환경변수로 설정합니다. `.env`는 자동으로 읽지 않으므로, 예를 들어 `source .env` 후 실행합니다.
2. `npm run build`
3. `npm run preview`
4. 브라우저에서 `http://localhost:4173`을 엽니다.

## 구조

- `src/app.js`: 수정할 프런트엔드 원본
- `public/`: PWA, 이미지, HTML
- `scripts/build.mjs`: `src/app.js`를 production 형식(`g0.bin`~`g7.bin`)으로 생성
- `supabase/functions/homework-api/index.ts`: 로그인·상태 저장·복습·관리자 API Edge Function
- `supabase/functions/push-api/index.ts`: 푸시 알림·쪽지 발송 Edge Function
- `supabase/migrations/`: DB 마이그레이션 (초기 스키마는 저장소에 없고, 이후 변경분만 포함)
- `scripts/test-*.mjs`: 기능별 테스트
- `public/린중국어-디자인-가이드.html`: 디자인 가이드

## 중요한 제한

- Edge Function과 DB 마이그레이션은 main 병합으로 자동 배포되지 않습니다. Supabase에 별도로 반영해야 합니다.
- 실제 API URL, publishable key, 서비스 역할 키, VAPID private key는 이 패키지에 넣지 않았습니다. 특히 private key와 service-role key는 절대 GitHub에 올리지 마세요.
- GitHub `jimjimimi1013/homework_push` main 브랜치가 Vercel production과 연동되어 있습니다.
