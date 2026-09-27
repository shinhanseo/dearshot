# DearShot 남은 백엔드 Issue 검토안

> 상태: 사용자 확정, B-16 구현 완료
>
> 기준일: 2026-09-27

Android는 CameraX 프리뷰에서 화면 안정 여부를 판단하고, 안정된 프레임을 업로드합니다. Places365와 YOLOX-Nano의 ONNX 추론 결과는 로컬 스캔 UX에 즉시 사용하며 백엔드에는 선택적인 힌트로 전달합니다. 백엔드는 ONNX 모델을 실행하지 않고, 이미지와 힌트 및 DB의 공개 템플릿 후보를 Gemini에 전달해 최종 템플릿 한 개를 선택합니다.

## 공통 장면 분석 계약

```json
{
  "uploadId": "29928e5b-ed75-4e47-af53-53b8d47b5bcb",
  "sceneRevision": 3,
  "capturedAt": "2026-09-27T05:30:00Z",
  "locale": "ko-KR",
  "deviceAnalysis": {
    "sceneClassifier": {
      "model": "places365-resnet18",
      "modelVersion": "places365-standard",
      "runtime": "onnxruntime-android",
      "candidates": [
        {"label": "beach", "confidence": 0.91},
        {"label": "coast", "confidence": 0.76}
      ]
    },
    "objectDetector": {
      "model": "yolox-nano",
      "modelVersion": "coco-2017",
      "runtime": "onnxruntime-android",
      "objects": [
        {
          "label": "person",
          "confidence": 0.96,
          "box": {"left": 0.30, "top": 0.18, "right": 0.62, "bottom": 0.94}
        }
      ]
    }
  },
  "context": {
    "timezone": "Asia/Seoul"
  }
}
```

- `deviceAnalysis` 전체는 선택 사항이며 이미지 단독 요청도 처리합니다.
- 좌표는 이미지 기준 `0.0..1.0` 정규화 좌표입니다.
- 장면 후보는 최대 5개, 객체는 최대 20개로 제한합니다.
- 모델 출력은 신뢰 경계 밖의 힌트입니다. 권한, template ID, scene key 또는 과금 판단에 직접 사용하지 않습니다.
- `sceneRevision`은 Android가 장면 변경마다 증가시키며 모든 응답과 SSE 최종 이벤트에서 그대로 돌려줍니다.
- 모델 이름·버전·라벨은 길이와 허용 문자 및 개수를 제한하고 일반 서버 로그에는 기록하지 않습니다.

---

## B-14: 온디바이스 분석 입력과 비동기 장면 작업

**상태: 구현 완료**

### 목표

Android가 선택한 안정 프레임과 선택적인 Places365·YOLOX 결과를 받아 재시작 가능한 장면 분석 작업을 생성합니다.

### 작업

- `CreateSceneAnalysisRequest`를 위 계약으로 갱신
- 장면 후보, 객체, 정규화 bounding box의 Zod 검증과 상한 적용
- `scene_analyses`와 필요한 상태·입력 snapshot migration
- `POST /scene-analyses`, `GET /scene-analyses/{id}`, `DELETE /scene-analyses/{id}` 구현
- upload 소유권·purpose·만료 확인, upload 소비, 일일 사용량 증가, 작업 생성을 한 transaction으로 처리
- principal·요청 hash 범위의 멱등 응답 재생
- 취소된 작업의 늦은 결과가 최종 결과를 덮어쓰지 못하도록 상태 전이 제한
- 새 API가 준비되면 단수형 개발 mock `/scene-analysis` 제거
- OpenAPI, API, 데이터 모델, 아키텍처 문서 갱신

### 완료 조건

- `deviceAnalysis` 없이도 이미지 단독 작업을 생성할 수 있습니다.
- 잘못된 confidence, 역전된 box, 과도한 후보·객체, 너무 긴 label을 거부합니다.
- 다른 사용자의 upload와 잘못된 purpose를 사용할 수 없습니다.
- 동일 멱등 요청은 작업과 사용량을 한 번만 생성합니다.
- 작업 생성 실패 시 upload와 사용량이 부분 소비되지 않습니다.
- `sceneRevision`이 조회 응답까지 보존됩니다.

### 제외

- 실제 Gemini 호출
- SSE 연결과 이벤트 replay
- Android ONNX 추론 구현

---

## B-15: PostgreSQL 작업 실행기와 SSE

**상태: 구현 완료**

### 목표

API 프로세스 재시작에도 남는 장면 작업을 안전하게 claim하고, Android가 재연결할 수 있는 서버 작업 이벤트를 전달합니다.

### 작업

- PostgreSQL 기반 worker polling, lease, 재시도 횟수, stale lease 복구
- 경쟁 worker가 같은 작업을 처리하지 않도록 원자적 claim
- `scene_analysis_events` migration과 증가하는 bigint event ID
- `GET /scene-analyses/{id}/events` SSE 구현
- `Last-Event-ID` 이후 이벤트 replay와 15초 heartbeat
- 이벤트 종류를 `status`, `recommendation`, `completed`, `failed`로 제한
- 서버 단계 enum: `PREPARING_INPUT`, `FILTERING_TEMPLATES`, `REQUESTING_PROVIDER`, `FINALIZING`
- terminal event 이후 연결 종료, 취소·소유권·만료 처리
- fake recommendation adapter로 worker와 SSE 통합 테스트

### 완료 조건

- 프로세스를 재시작해도 QUEUED 또는 만료된 lease 작업이 이어집니다.
- 동시 worker가 같은 작업의 terminal 결과를 두 번 만들지 않습니다.
- 재연결한 앱이 누락 이벤트를 순서대로 받습니다.
- 다른 사용자의 event stream을 구독할 수 없습니다.
- 로컬 Places365·YOLOX 키워드를 서버 `clue` 이벤트로 복제하지 않습니다.
- 실제 provider 진행률처럼 보이는 임의의 퍼센트를 보내지 않습니다.

### 제외

- 실제 Gemini SDK·HTTP 호출
- 촬영 피드백 작업

---

## B-16: Gemini 기반 템플릿 한 개 추천

**상태: 구현 완료**

### 목표

업로드 이미지, 온디바이스 힌트와 DB 후보를 Gemini에 전달하고 공개된 템플릿 한 개만 안전하게 선택합니다.

### 작업

- 교체 가능한 `SceneRecommendationProvider` interface와 Gemini adapter
- Places365 label을 서버 scene key 후보로 정규화하는 명시적 mapping
- 공개 상태, scene, 인원 수, 비율에 따른 템플릿 후보 선조회
- Gemini 입력 후보 수 상한과 prompt/schema version 관리
- 이미지, 온디바이스 힌트, 시간·선택 위치 context, 후보 템플릿 메타데이터 전달
- 구조화 응답: `sceneKey`, `templateId`, `templateVersion`, `confidence`, `reasonCode`
- Gemini가 반환한 scene/template/version이 허용 후보와 일치하는지 재검증
- timeout, 제한된 retry, provider 오류 표준화
- `ai_job_attempts` migration과 latency·token·표준 오류 기록
- 원본 prompt·응답·이미지를 로그와 DB에 저장하지 않음
- 후보 없음·낮은 신뢰도에서 `NEEDS_USER_SELECTION` 반환

### 완료 조건

- Gemini가 DB에 없거나 공개되지 않은 template ID를 선택할 수 없습니다.
- 최종 추천은 template ID/version 한 쌍이며 다중 추천 배열이 아닙니다.
- 온디바이스 힌트가 누락되거나 틀려도 이미지 기준 분석이 가능합니다.
- provider timeout과 schema 오류가 안정적인 내부 오류 코드로 변환됩니다.
- 작업 상태, SSE terminal event와 AI attempt가 모순되지 않습니다.
- 완료 또는 실패 후 분석 이미지를 즉시 제거하고 장애 시 최대 1시간 안에 정리합니다.

### 제외

- Gemini가 새 템플릿이나 오버레이를 생성하는 기능
- 백엔드의 Places365·YOLOX 실행
- 사용자 취향 개인화와 추천 학습

이미지의 정상 완료·최종 실패 직후 삭제는 구현했습니다. 파일 삭제 장애와 프로세스 강제 종료 뒤의 최대 1시간 보정 정리는 B-18 정리 작업에서 추가합니다.

---

## B-17: 템플릿 기준 촬영 피드백

**상태: 완료**

### 목표

사용자가 선택한 불변 template version과 촬영 사진을 비교해 다음 촬영에 적용할 한 가지 피드백을 반환합니다.

### 작업

- `photo_feedbacks`와 AI attempt 연결 migration
- 생성·조회·취소 API와 upload/usage/idempotency transaction
- template version, 선택적인 scene analysis, 이전 feedback 참조 검증
- provider가 허용된 action code 하나만 반환하도록 schema 제한하고 Android가 message key를 지역화
- `composition`, `pose`, `lighting`, `expression` 피드백 범주
- 이전 피드백 이후 개선 여부와 재촬영 index 연결
- timeout·오류·임시 이미지 삭제·DB 통합 테스트

### 완료 조건

- 공개 후 불변인 template version을 기준으로 분석합니다.
- 한 응답은 가장 영향이 큰 행동 가능한 피드백 하나만 제공합니다.
- Android가 즉시 계산할 로컬 구도 신호와 서버 심화 피드백을 구분합니다.
- 같은 upload를 장면 분석과 피드백에 중복 소비할 수 없습니다.

---

## B-18: 개인정보, 계정 삭제와 retention

### 목표

이미지와 분석 힌트 및 AI 작업 데이터가 약속한 기간을 넘기지 않고, 탈퇴 요청을 안전하게 완료합니다.

### 작업

- 만료 upload·부분 파일·SSE 이벤트·분석 입력·결과·AI attempt·app event 정리 작업
- 위치 context는 작업 완료 직후 제거
- `PATCH /me/preferences`, `DELETE /me`와 삭제 작업 상태
- 진행 중 작업 취소, refresh session 폐기, 파일 우선 삭제 후 사용자 데이터 제거
- 삭제 실패 재시도와 운영 지표
- retention clock을 제어하는 DB·파일 통합 테스트

### 완료 조건

- 이미지 최대 1시간, SSE 이벤트 24시간, 분석 입력·결과 7일, AI attempt 30일, app event 90일 정책을 검증합니다.
- 탈퇴 즉시 새 인증과 AI 작업 생성을 차단합니다.
- 사용자 FK 때문에 파일이 남거나, 파일 삭제 실패 후 DB만 삭제되는 상태가 생기지 않습니다.

---

## B-19: 운영 Docker Compose와 Caddy

### 목표

개발 이미지를 운영용 multi-stage·non-root 구성으로 교체하고 외부에는 Caddy만 노출합니다.

### 작업

- production API Dockerfile과 최소 runtime image
- API non-root, read-only 가능한 filesystem, 업로드 전용 volume
- Caddy HTTPS·reverse proxy·SSE buffering 비활성화
- PostgreSQL·API private network와 영속 volume
- health/readiness와 graceful shutdown
- secret을 이미지와 저장소에 포함하지 않는 환경변수 계약

### 완료 조건

- host에는 80/443만 공개되고 3000/5432는 공개되지 않습니다.
- SSE가 프록시에서 버퍼링되지 않고 heartbeat가 전달됩니다.
- API와 worker가 종료 신호를 받아 새 작업 claim을 멈추고 안전하게 종료합니다.

---

## B-20: GHCR와 EC2 배포·롤백

### 목표

검증된 commit SHA 이미지를 EC2에 반복 배포하고 실패 시 이전 버전으로 복구합니다.

### 작업

- GitHub Actions test·build·GHCR push
- commit SHA image tag와 배포 대상 고정
- EC2 초기 설정, 보안 그룹, Docker, Caddy volume
- `backup → migration → compose up → health check` 배포 스크립트
- migration 실패·health 실패 시 이전 SHA rollback
- 운영 환경변수와 Gemini credential 주입 절차

### 완료 조건

- `latest`에 의존하지 않고 배포 버전을 식별할 수 있습니다.
- 실패 배포가 이전 정상 API와 DB 백업을 훼손하지 않습니다.
- rollback 절차를 실제 staging EC2에서 검증합니다.

---

## B-21: 출시 전 E2E·보안·복구 검증

### 목표

Android가 사용할 전체 백엔드 흐름과 단일 EC2 장애 복구 범위를 출시 전에 검증합니다.

### 작업

- guest → upload → analysis → SSE → recommendation → feedback E2E
- sceneRevision 변경, 이전 작업 취소와 늦은 결과 무시 시나리오
- Google/Kakao 로그인, 좋아요·북마크, 탈퇴 E2E
- 악성 upload, 타인 자원 접근, rate limit, 멱등 재시도 점검
- Gemini timeout·잘못된 template ID·DB 재시작·API 재시작 장애 주입
- PostgreSQL `pg_dump`와 새 DB 복원 검증
- request ID에서 로그·AI attempt·작업을 추적하는 운영 점검

### 완료 조건

- 핵심 E2E와 복구 시나리오가 자동화되거나 반복 가능한 runbook으로 남습니다.
- 백업 복원 후 핵심 테이블의 행 수와 FK 관계를 검증합니다.
- 알려진 제한과 비용·지연 수치를 README에 기록합니다.
