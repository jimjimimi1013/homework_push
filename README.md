# 린중국어 숙제 앱 — 최신 production 기준 소스

이 폴더는 2026-08-28 현재 Vercel production 배포본에서 복구·정리한 프런트엔드 소스입니다.

## 실행

1. `.env.example`을 `.env`로 복사하고 실제 값을 로컬 환경변수로 설정합니다. `.env`는 자동으로 읽지 않으므로, 예를 들어 `source .env` 후 실행합니다.
2. `npm run build`
3. `npm run preview`
4. 브라우저에서 `http://localhost:4173`을 엽니다.

## 구조

- `src/app.js`: 수정할 프런트엔드 원본
- `public/`: PWA, 이미지, HTML
- `scripts/build.mjs`: `src/app.js`를 production 형식(`g0.bin`~`g7.bin`)으로 생성
- `supabase/functions/push-api/index.ts`: 푸시 알림 Edge Function

## 중요한 제한

- `homework-api` Edge Function과 Supabase 데이터베이스 스키마는 이 production 정적 배포본에 포함되지 않아 복구할 수 없습니다. 현재 배포된 원격 백엔드는 그대로 동작합니다.
- 실제 API URL, publishable key, 서비스 역할 키, VAPID private key는 이 패키지에 넣지 않았습니다. 특히 private key와 service-role key는 절대 GitHub에 올리지 마세요.
- Vercel에는 이 저장소가 Git 연동되어 있지 않습니다. GitHub에 올린 뒤 Vercel에서 저장소를 연결하거나, 별도로 배포해야 합니다.
