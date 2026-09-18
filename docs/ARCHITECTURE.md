# 시스템 아키텍처

## 구성

```text
Android app
 ├─ CameraX: preview, focus, zoom, capture
 ├─ Compose: camera, template, feedback, session UI
 ├─ Room: templates, analysis, session metadata
 ├─ App storage: unsaved originals and thumbnails
 ├─ MediaStore: user-selected final photos
 └─ WorkManager: analysis retry and cleanup
          │ HTTPS
          ▼
Node API
 ├─ authentication and rate limit
 ├─ scene-analysis orchestration
 ├─ template catalog delivery
 └─ AI provider adapter
          │
          ├─ multimodal AI provider
          └─ template database/object storage
```

## Android 모듈 계획

초기에는 단일 `app` 모듈로 시작한다. 화면과 도메인 경계가 안정된 뒤 다음 기준으로 분리한다.

- `core:camera`: CameraX와 기기 기능 차이
- `core:data`: Room, 네트워크, 파일 저장
- `core:designsystem`: 토큰과 공통 컴포넌트
- `feature:capture`: 분석·템플릿·촬영
- `feature:feedback`: 결과 분석과 재촬영
- `feature:session`: 비교·선택·MediaStore 저장

## 상태 원칙

- 촬영 세션은 `idle → analyzing → ready → capturing → reviewing → completed`로 관리한다.
- 분석 진행률을 임의의 숫자로 만들지 않고 실제 단계만 표시한다.
- 서버 분석과 로컬 촬영은 분리한다. 네트워크 실패가 셔터 사용을 막지 않는다.
- 서버가 보낸 템플릿 정의는 버전과 유효기간을 포함해 로컬에 캐시한다.
- 사진 파일과 메타데이터의 저장 성공을 별도로 추적한다.

## AI 경계

서버 AI는 장면 분류와 추천 후보 생성에 사용한다. 수평, 인물 위치, 밝기처럼 즉각성이 중요한 신호는 추후 ML Kit 또는 온디바이스 모델로 이동한다. 모델 출력은 그대로 UI에 노출하지 않고 허용된 장소·템플릿 ID로 검증한다.

