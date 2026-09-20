# DearShot 백엔드 구현 계획

이 문서는 DearShot 백엔드를 작은 단위로 구현하고 검증하기 위한 공개 계획입니다. 각 작업은 하나의 GitHub Issue와 짧은 브랜치, Draft PR로 진행하며 `main`은 항상 빌드 가능한 상태로 유지합니다.

## 구현 원칙

- Android 앱이 사용하는 계약은 `docs/openapi.yaml`을 기준으로 관리합니다.
- DB 코드를 작성하기 전에 `docs/DATA_MODEL.md`에서 관계, 수명주기, 보존 기간을 확정합니다.
- PostgreSQL과 Drizzle을 사용하고 기능별 migration으로 스키마를 추가합니다.
- 모듈형 모놀리스로 시작하고 인증·템플릿·분석·피드백·관찰 경계를 분리합니다.
- 사진 원본은 서버에 영구 보관하지 않고 분석용 파일은 처리 직후 삭제합니다.
- 일반 서버 로그, 사용자 작업 상태, AI 호출 시도, 제품 이벤트를 서로 다른 목적으로 관리합니다.
- 액세스 토큰, OAuth 토큰, 정확한 위치 이력, 이미지 내용, AI 원본 프롬프트와 응답은 로그에 남기지 않습니다.
- 외부 OAuth와 AI provider는 인터페이스 뒤에 두어 테스트 대역과 교체할 수 있게 합니다.
- 모든 DB 변경은 migration으로 관리하고 배포 전에 백업과 복구 절차를 확인합니다.

## 목표 아키텍처

```text
Android app
    │ HTTPS / SSE
    ▼
Caddy :80/:443
    ├── /api/* ──────► Node.js + TypeScript API :3000
    │                       ├── PostgreSQL :5432
    │                       ├── EC2 temporary uploads
    │                       ├── Google / Kakao OAuth
    │                       └── Gemini scene analysis
    └── /assets/templates/* ─► versioned template assets
```

초기 운영 환경은 한 대의 EC2 Ubuntu 서버와 Docker Compose입니다. Caddy만 외부에 노출하고 API와 PostgreSQL은 Docker 내부 네트워크에서 실행합니다. PostgreSQL 데이터, Caddy 인증서, 임시 업로드와 템플릿 자산은 컨테이너 밖의 볼륨에 보관합니다.

## 작업 순서

| 순서 | 작업 | 핵심 결과물 | 선행 작업 |
| ---: | --- | --- | --- |
| B-01 | API·아키텍처 계약 정리 | multipart 업로드, 현재/목표 API, EC2 운영 구조 | 없음 |
| B-02 | PostgreSQL 데이터 모델 확정 | 서버 ERD, 관계·인덱스·삭제·보존 정책 | B-01 |
| B-03 | 로컬 Docker Compose | API와 PostgreSQL을 한 명령으로 실행하는 환경 | B-01 |
| B-04 | Drizzle과 migration 기반 | DB 연결, schema 모듈, migration/seed/test 명령 | B-02, B-03 |
| B-05 | HTTP·오류·테스트 기반 | request ID, 표준 오류, Pino 로그, 통합 테스트 | B-03 |
| B-06 | 인증 기반 | guest principal, JWT, refresh rotation, 계정 테이블 | B-04, B-05 |
| B-07 | Google 로그인 | ID token 서버 검증과 게스트 승격 | B-06 |
| B-08 | Kakao 로그인 | access token 서버 검증과 게스트 승격 | B-06 |
| B-09 | 템플릿 카탈로그 | 장소·버전·지역화 스키마, 목록/상세, import CLI | B-04, B-05 |
| B-10 | 좋아요와 북마크 | 관계 테이블, 멱등 API, like count 일관성 | B-06, B-09 |
| B-11 | 분석 이미지 업로드 | multipart 검증, 임시 파일 메타데이터와 수명 관리 | B-04, B-05 |
| B-12 | 사용량·멱등성·앱 설정 | 일일 AI 제한, 중복 비용 방지, 원격 설정 | B-06 |
| B-13 | 제품 이벤트 수집 | guest/member 퍼널 이벤트, schema 제한, 90일 보존 | B-06, B-05 |
| B-14 | 장면 분석과 SSE | 비동기 작업, 키워드 이벤트, 재연결 가능한 스트림 | B-09, B-11, B-12 |
| B-15 | Gemini와 AI 시도 이력 | 구조화 응답, timeout/retry, `ai_job_attempts` | B-14 |
| B-16 | 촬영 피드백 | 템플릿 버전 기반 피드백, 비교·재촬영 결과 | B-11, B-12, B-15 |
| B-17 | 개인정보와 retention | 임시 파일, 결과, 이벤트, 게스트, 탈퇴 데이터 정리 | B-06, B-11, B-13~B-16 |
| B-18 | 운영 컨테이너 | multi-stage API, non-root, Caddy, PostgreSQL volume | B-01~B-17 |
| B-19 | GHCR·EC2 배포 | SHA 이미지, migration, health check, rollback | B-18 |
| B-20 | 출시 검증 | E2E, 보안 점검, 로그·지표 확인, 백업·복구 | B-19 |

## 단계별 완료 조건

### B-01~B-02. 계약과 데이터 설계

- 업로드 API가 presigned URL이 아닌 Node의 multipart 수신 방식으로 정의되어 있습니다.
- API의 request/response 필드가 데이터 모델 또는 명시적인 비영구 값에 대응합니다.
- 게스트가 회원으로 승격되거나 기존 회원 identity와 충돌할 때의 처리가 정의되어 있습니다.
- Android Room, PostgreSQL 영구 데이터, EC2 임시 파일의 경계가 명확합니다.
- AI 최종 작업과 provider별 시도 이력, 제품 이벤트와 일반 서버 로그가 구분됩니다.
- OpenAPI와 Mermaid 문서가 정적 검증을 통과합니다.

### B-03~B-05. 실행·DB·공통 기반

- 새 환경에서 문서에 적힌 명령만으로 API와 PostgreSQL을 실행할 수 있습니다.
- PostgreSQL 5432는 외부에 공개되지 않고 health check가 준비 상태를 반영합니다.
- migration을 빈 DB와 기존 DB에 반복 적용할 수 있고 test DB를 독립적으로 초기화할 수 있습니다.
- schema는 identity, catalog, jobs, analytics 경계로 나뉘며 기능 PR이 자기 migration을 소유합니다.
- 성공·실패 응답, Pino JSON 로그, AI 작업에 동일한 request ID가 연결됩니다.

### B-06~B-08. 인증

- 게스트도 서버 `users.id`를 갖고 Google/Kakao 로그인 시 가능한 경우 동일한 사용자 행을 승격합니다.
- 액세스 토큰은 짧게 유지하고 refresh token은 해시로 저장해 회전·폐기합니다.
- Google과 Kakao가 발급한 값을 서버에서 검증하며 클라이언트의 사용자 정보를 신뢰하지 않습니다.
- token family 재사용, 잘못된 issuer/audience, identity 충돌, 탈퇴 계정 접근을 테스트합니다.

### B-09~B-10. 템플릿과 상호작용

- 앱 배포 없이 scene, locale, 템플릿 자산과 새 버전을 배포할 수 있습니다.
- 배포된 템플릿 버전은 불변이며 진행 중 촬영이 참조한 버전을 유지합니다.
- 좋아요와 북마크는 멱등적으로 동작하고 동시 요청에도 중복 행이나 잘못된 like count가 생기지 않습니다.

### B-11~B-17. AI 작업, 관찰, 개인정보

- 허용한 이미지 형식·실제 파일 signature·크기를 검사하고 외부에 storage path를 노출하지 않습니다.
- 사용량 증가, upload 소비, AI 작업 생성은 중복 비용이 생기지 않게 트랜잭션으로 처리합니다.
- SSE는 증가하는 event ID를 사용하고 `Last-Event-ID` 재연결 시 누락된 이벤트를 복구합니다.
- AI 호출마다 provider/model, prompt/schema version, latency, token 수, 표준화된 오류를 `ai_job_attempts`에 남깁니다.
- AI 원본 프롬프트·응답, 이미지, provider token, 정확한 위치 이력은 저장하지 않습니다.
- `app_events`는 허용된 이벤트와 속성만 받고 guest/member 퍼널을 동일한 actor 흐름으로 연결합니다.
- 이미지 최대 1시간, SSE 이벤트 24시간, AI 결과 7일, AI 시도 30일, 제품 이벤트 90일 정책을 자동 검증합니다.

### B-18~B-20. 배포와 출시 검증

- 운영 API 이미지는 multi-stage build와 non-root 사용자로 실행됩니다.
- EC2 보안 그룹은 80/443과 제한된 22만 허용하고 3000/5432를 공개하지 않습니다.
- 배포는 commit SHA 이미지, 배포 전 백업, 일회성 migration, health check와 이전 이미지 rollback을 사용합니다.
- 인증, 템플릿, 업로드, 분석 SSE, 피드백, 제품 이벤트, 탈퇴 흐름을 E2E로 검증합니다.
- PostgreSQL 백업을 새 데이터베이스에 복원하고 행 수와 핵심 관계를 확인합니다.
- 장애 상황에서도 Pino 로그로 request ID를 추적하고 DB의 AI 시도 이력과 연결할 수 있습니다.

## PR 검증 체크리스트

- [ ] 한 PR이 하나의 Issue 범위만 다룹니다.
- [ ] API 변경이 `docs/openapi.yaml`과 일치합니다.
- [ ] DB 변경에 forward migration, 기존 데이터 영향, rollback 전략이 포함됩니다.
- [ ] 정상 경로와 핵심 실패·동시성 경로를 테스트했습니다.
- [ ] 로그와 이벤트에 토큰, 개인정보, 이미지, 자유 입력 원문이 포함되지 않습니다.
- [ ] 새 이벤트와 오류 코드는 허용 목록과 보존 정책에 등록했습니다.
- [ ] `npm run typecheck`, 테스트, 빌드, migration과 OpenAPI 검증이 통과합니다.
- [ ] PR 설명에 변경 이유, 검증 결과, 운영 영향, 남은 제약을 기록했습니다.

## 포트폴리오에서 설명할 범위

백엔드는 Android 촬영 경험을 지탱하는 제품 인프라로 구현합니다. 면접에서는 관계형 데이터 모델, 게스트 계정 승격, OAuth 서버 검증, 템플릿 불변 버전, upload 수명주기, SSE 재연결, 멱등성과 AI 비용 제한, provider 시도 이력, 제품 퍼널, Docker 배포와 PostgreSQL 복구를 직접 설명할 수 있어야 합니다. AI의 도움을 받은 코드는 작은 PR과 테스트, CI로 동작과 설계를 검증합니다.
