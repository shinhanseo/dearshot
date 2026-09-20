# DearShot 시스템 아키텍처

## 현재와 목표 범위

현재 백엔드는 `GET /health`와 동기 mock `POST /api/v1/scene-analysis`만 구현되어 있습니다. mock은 JSON의 `imageReference`를 받아 고정된 장면 추천을 반환하며 인증, 실제 파일 업로드, PostgreSQL, AI provider, SSE를 사용하지 않습니다.

아래 구성은 MVP 목표입니다. 목표 장면 분석은 multipart `POST /api/v1/uploads`로 이미지를 먼저 전달한 뒤 복수형 `POST /api/v1/scene-analyses`로 비동기 작업을 생성합니다. B-01 이후 기능 Issue는 이 목표 계약을 기준으로 구현하고, 목표 분석이 준비되면 단수형 mock route를 제거합니다.

## 전체 구성

```text
Android app
 ├─ CameraX: preview, focus, zoom, capture
 ├─ Compose: camera, template, feedback, session UI
 ├─ Room: template cache, session and selected photo metadata
 ├─ App storage: unsaved originals and analysis copies
 ├─ MediaStore: user-selected final photos
 └─ WorkManager: upload retry and local cleanup
          │ HTTPS / SSE
          ▼
Caddy :80/:443
 ├─ /api/* ───────────────► Node.js API :3000
 │                            ├─ auth and usage limits
 │                            ├─ multipart upload
 │                            ├─ scene-analysis orchestration
 │                            ├─ photo feedback
 │                            ├─ template catalog
 │                            ├─ product events
 │                            └─ Gemini adapter
 └─ /assets/templates/* ───► versioned template assets
                              │
                              ▼
                         PostgreSQL :5432
```

초기 운영 환경은 단일 EC2 Ubuntu와 Docker Compose입니다. Caddy만 외부 포트를 열고 API와 PostgreSQL은 내부 Docker 네트워크에서 통신합니다. API 3000과 PostgreSQL 5432는 AWS Security Group과 Docker host 모두에서 공개하지 않습니다.

## 컨테이너와 영속 데이터

| 구성 | 역할 | 영속 위치 |
| --- | --- | --- |
| Caddy | HTTPS, reverse proxy, template asset 제공 | Caddy data volume |
| Node API | REST, SSE, OAuth, AI 작업 | stateless image |
| PostgreSQL | 계정, 템플릿, 작업 상태, 제품 이벤트 | named volume on EBS |
| Temporary uploads | 압축 분석 이미지 | `/srv/dearshot/uploads` bind mount |
| Template assets | preview, thumbnail, overlay | `/srv/dearshot/templates` bind mount |
| Backup | encrypted `pg_dump` | 로컬 단기 보관 + 외부 복사 |

컨테이너 이미지는 소스나 운영 데이터를 포함하지 않습니다. PostgreSQL과 파일은 컨테이너를 교체해도 유지되며, 배포 전 백업과 migration을 별도 단계로 실행합니다.

## 백엔드 모듈 경계

```text
src/
├── config
├── shared
├── modules
│   ├── auth
│   ├── users
│   ├── templates
│   ├── interactions
│   ├── uploads
│   ├── scene-analysis
│   ├── photo-feedback
│   └── analytics
├── infrastructure
│   ├── database
│   ├── storage
│   ├── oauth
│   └── ai
└── workers
```

하나의 Node 프로세스로 시작하는 모듈형 모놀리스입니다. 모듈은 같은 PostgreSQL을 사용하되 다른 모듈의 테이블을 직접 변경하지 않고 service 경계를 통과합니다.

## Android 모듈 계획

초기에는 단일 `app` 모듈로 시작합니다. 화면과 도메인 경계가 안정된 뒤 다음 기준으로 분리합니다.

- `core:camera`: CameraX와 기기 기능 차이
- `core:data`: Room, 네트워크, 파일 저장
- `core:designsystem`: 토큰과 공통 컴포넌트
- `feature:capture`: 분석·템플릿·촬영
- `feature:feedback`: 결과 분석과 재촬영
- `feature:session`: 비교·선택·MediaStore 저장

## 상태 원칙

- 촬영 세션은 `idle → analyzing → ready → capturing → reviewing → completed`로 관리합니다.
- 분석 진행률을 임의의 숫자로 만들지 않고 서버의 실제 단계와 SSE event를 표시합니다.
- 서버 분석과 로컬 촬영은 분리합니다. 네트워크 실패가 기본 카메라 사용을 막지 않습니다.
- 서버 템플릿은 ID, version, locale, cache expiry와 함께 Room에 저장합니다.
- 서버가 새 템플릿을 배포해도 진행 중인 촬영은 선택 당시 version을 사용합니다.
- 사진 파일과 Room 메타데이터의 저장 성공을 별도로 추적합니다.

## AI 작업 흐름

```text
compressed image upload
  → Node multipart stream and file validation
  → usage and idempotency transaction
  → analysis job created
  → SSE progress and clue events
  → Gemini adapter call
  → response schema validation
  → template ID validation
  → normalized result saved
  → temporary image deleted
```

서버 AI는 장면 분류와 추천 후보 생성에 사용합니다. 수평, 인물 위치, 밝기처럼 즉각성이 중요한 신호는 추후 ML Kit 또는 온디바이스 모델로 이동합니다. 모델 출력은 그대로 UI에 노출하지 않고 허용된 장소·템플릿 ID와 action code로 검증합니다.

## 관찰과 로그

- 도메인 작업의 최종 상태는 `scene_analyses`, `photo_feedbacks`에 저장합니다.
- provider별 시도, latency, token 수, 표준 오류는 `ai_job_attempts`에 저장합니다.
- 게스트와 회원의 핵심 퍼널은 제한된 `app_events`에 저장합니다.
- request log와 stack trace는 Pino JSON stdout과 Docker log rotation으로 관리합니다.
- 모든 계층은 동일한 request ID를 사용해 API 로그와 DB 작업을 연결합니다.

DB 장애 시에도 원인을 확인할 수 있도록 일반 로그를 PostgreSQL에 저장하지 않습니다.

## 개인정보와 수명주기

- Android는 분석용 이미지만 압축해 명시적인 동의 후 전송합니다.
- 정확한 위치는 허용한 경우에만 분석 입력으로 사용하고 완료 후 제거합니다.
- 이미지 최대 1시간, SSE event 24시간, AI 결과 7일, AI attempt 30일, app event 90일을 기본 보존 기간으로 둡니다.
- OAuth token, refresh token 원문, 이미지 Base64, AI 원본 프롬프트·응답은 저장하지 않습니다.
- 계정 탈퇴 시 세션을 즉시 폐기하고 사용자 연결 데이터와 진행 중 파일을 정리합니다.

## 배포와 복구

GitHub Actions가 commit SHA로 태그한 이미지를 GHCR에 올리고 EC2가 해당 이미지를 pull합니다. 배포는 `backup → one-off migration → compose up -d → health check` 순서이며 실패하면 이전 SHA 이미지를 다시 실행합니다.

PostgreSQL은 매일 `pg_dump`하고 최근 백업을 실제 새 DB에 복원하는 절차를 출시 전 수행합니다. 단일 EC2이므로 완전한 고가용성은 제공하지 않지만 MVP와 포트폴리오 범위에서는 비용과 복잡도의 균형이 맞습니다.
