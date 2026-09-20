# DearShot

> 좋아하는 사람을, 마음에 드는 사진으로.

DearShot은 현재 장면을 분석해 장소에 어울리는 촬영 템플릿을 추천하고, 촬영 결과에 대한 짧고 실행 가능한 피드백을 제공하는 Android 카메라 앱입니다.

## 핵심 경험

1. 카메라를 켜면 장면의 단서를 분석합니다.
2. 현재 장소와 분위기에 맞는 촬영 템플릿을 추천합니다.
3. 가이드와 예시를 보며 직접 촬영합니다.
4. 한 가지 핵심 피드백을 확인하고 다시 찍거나 다음 구도로 이동합니다.
5. 세션에서 마음에 드는 사진만 기기 갤러리에 저장합니다.

## 저장소 구조

```text
dearshot/
├── android/      Kotlin · Jetpack Compose Android 앱
├── backend/      Node.js · TypeScript API
├── docs/         제품, 아키텍처, API, 개인정보 문서
└── .github/      CI 워크플로
```

## 시작하기

### Android

```bash
cd android
./gradlew assembleDebug
```

### Backend

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

서버가 실행되면 `GET /health`와 `POST /api/v1/scene-analysis`를 사용할 수 있습니다. 현재 장면 분석 응답은 앱·서버 계약을 먼저 검증하기 위한 목 응답입니다.

## 문서와 디자인

- [제품 요구사항](docs/PRODUCT.md)
- [시스템 아키텍처](docs/ARCHITECTURE.md)
- [API 명세](docs/API.md)
- [OpenAPI 계약](docs/openapi.yaml)
- [데이터 모델](docs/DATA_MODEL.md)
- [개인정보와 권한](docs/PRIVACY.md)
- [8주 로드맵](docs/ROADMAP.md)
- [전체 화면과 디자인 시스템](docs/design/README.md)

## 기술 방향

- Android: Kotlin, Jetpack Compose, CameraX, Room, Hilt, Retrofit, WorkManager, Media3
- Backend: Node.js, TypeScript, Express, Zod
- AI: 서버 장면 분석을 우선 적용하고, 인물·수평선·밝기처럼 즉시성이 필요한 신호는 온디바이스 분석으로 확장
- Storage: 촬영 원본은 앱 전용 저장소에 임시 보관하고 사용자가 선택한 사진만 MediaStore에 저장
