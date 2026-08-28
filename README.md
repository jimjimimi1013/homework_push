# 린중국어학원 숙제 알림

현재 Vercel 운영 버전을 기준으로 정리한 PWA 프런트엔드와 Supabase Edge Functions 소스입니다.

## 로컬 빌드

1. `.env.example`을 `.env`로 복사합니다.
2. Supabase 프로젝트 URL과 publishable key를 입력합니다.
3. `npm run build`를 실행합니다.
4. `npm run preview`로 `dist` 폴더를 확인합니다.

실제 `.env`, Supabase service role key, VAPID private key 등 비밀값은 저장소에 포함하지 않습니다.

## 구성

- `src/app.js`: 최신 애플리케이션 소스
- `public/`: PWA 정적 파일과 이미지
- `scripts/build.mjs`: 환경변수 주입 및 8개 gzip 청크 생성
- `supabase/functions/`: 숙제 API와 푸시 API Edge Functions

## 배포

Vercel 프로젝트에 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` 환경변수를 설정한 뒤 배포합니다. Supabase Edge Functions의 `SUPABASE_SERVICE_ROLE_KEY`는 Supabase Secrets에서만 관리합니다.
