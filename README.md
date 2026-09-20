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

Docker Compose v2가 권장 개발 환경입니다.

```bash
cp backend/.env.example backend/.env
cp backend/.env.postgres.example backend/.env.postgres
docker compose up --build
```

두 환경 파일의 PostgreSQL 사용자·비밀번호와 `DATABASE_URL`은 서로 일치해야 합니다. 예제 값은 host port가 열리지 않는 로컬 개발 전용이며 운영 환경에서 사용하지 않습니다.

Compose는 다음 환경을 구성합니다.

- API: `http://127.0.0.1:3000`
- PostgreSQL: Docker private network의 `postgres:5432`
- PostgreSQL 데이터: `dearshot_postgres_data` named volume

PostgreSQL은 호스트에 `5432`를 공개하지 않습니다. DB에 직접 접속할 때는 컨테이너 안의 `psql`을 사용합니다.

```bash
docker compose exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

DB schema는 Drizzle migration으로 관리합니다. 개발 DB migration과 seed는 실행 중인 API 컨테이너에서 적용합니다.

```bash
docker compose exec api npm run db:migrate
docker compose exec api npm run db:seed
```

독립된 `dearshot_test` DB를 삭제·재생성하고 migration을 다시 적용하려면 다음 명령을 사용합니다. 안전을 위해 `db:test:reset`은 `TEST_DATABASE_URL`의 DB 이름이 `_test`로 끝날 때만 동작하며 운영 환경에서는 실행되지 않습니다.

```bash
docker compose exec api npm run db:test:reset
```

새 기능의 schema를 수정한 뒤 migration을 생성할 때는 다음 명령을 사용하고, 생성된 SQL을 반드시 검토합니다.

```bash
docker compose exec api npm run db:generate -- --name=feature_name
```

백엔드 unit test와 HTTP integration test는 DB 없이 서로 독립적으로 실행할 수 있습니다.

```bash
cd backend
npm run test:unit
npm run test:integration
```

API 로그는 Pino JSON으로 stdout에 기록합니다. HTTP 로그에는 request ID, 메서드, query string을 제외한 경로, 상태 코드와 응답 시간만 포함하며 Authorization, Cookie와 요청 본문은 기록하지 않습니다. Docker `json-file` 로그는 컨테이너마다 파일당 10MB, 최대 5개로 회전합니다.

구성과 health check, 비공개 DB port, volume 지속성을 한 번에 검증할 수 있습니다.

```bash
sh scripts/verify-compose.sh
```

서비스를 중지해도 DB volume은 유지됩니다. `docker compose down --volumes`는 로컬 DB를 모두 삭제하므로 초기화가 필요할 때만 사용합니다.

Docker 없이 API를 실행하려면 접근 가능한 PostgreSQL의 `DATABASE_URL`을 설정한 뒤 `backend`에서 `npm ci && npm run dev`를 사용할 수 있습니다. 서버는 요청을 받기 전에 DB 연결을 확인하고, 종료 신호를 받으면 HTTP 서버와 connection pool을 순서대로 닫습니다.

서버가 실행되면 현재 `GET /health`와 `POST /api/v1/scene-analysis`를 사용할 수 있습니다. 단수형 장면 분석은 앱·서버 연결 확인용 동기 mock이며 공개 API 계약이 아닙니다. 목표 계약은 multipart `POST /api/v1/uploads`와 비동기 `POST /api/v1/scene-analyses`이고, 자세한 구현 상태는 [API 명세](docs/API.md)에 구분되어 있습니다.

## 문서와 디자인

- [제품 요구사항](docs/PRODUCT.md)
- [시스템 아키텍처](docs/ARCHITECTURE.md)
- [API 명세](docs/API.md)
- [OpenAPI 계약](docs/openapi.yaml)
- [백엔드 구현 계획](docs/backend/BACKEND_IMPLEMENTATION_PLAN.md)
- [데이터 모델](docs/DATA_MODEL.md)
- [개인정보와 권한](docs/PRIVACY.md)
- [8주 로드맵](docs/ROADMAP.md)
- [전체 화면과 디자인 시스템](docs/design/README.md)

## 기술 방향

- Android: Kotlin, Jetpack Compose, CameraX, Room, Hilt, Retrofit, WorkManager, Media3
- Backend: Node.js, TypeScript, Express, Zod, PostgreSQL, Drizzle ORM
- AI: 서버 장면 분석을 우선 적용하고, 인물·수평선·밝기처럼 즉시성이 필요한 신호는 온디바이스 분석으로 확장
- Storage: 촬영 원본은 앱 전용 저장소에 임시 보관하고 사용자가 선택한 사진만 MediaStore에 저장
