# DearShot API 명세

> 문서 버전: `0.9.0-draft`
>
> 기준일: 2026-09-22
>
> Base URL: `/api/v1`
>
> 기계 판독 명세: [`openapi.yaml`](./openapi.yaml)

이 문서는 Android 앱과 DearShot 백엔드 사이의 계약을 정의한다. 아래 표는 현재 구현과 MVP 목표를 구분한다. 요청·응답 필드가 바뀌면 이 문서와 `openapi.yaml`을 함께 수정한다.

## 현재 구현 범위와 목표 계약

| 구분 | 엔드포인트 | 상태 | 비고 |
|---|---|---|---|
| 현재 | `GET /health` | 구현됨 | 프로세스와 PostgreSQL readiness 확인 |
| 현재 | `POST /auth/guest` | 구현됨 | 설치 UUID별 게스트 principal과 토큰 발급 |
| 현재 | `POST /auth/google` | 구현됨 | Google ID Token 검증, nonce 재사용 방지, 게스트 승격 |
| 현재 | `POST /auth/kakao` | 구현됨 | Kakao Access Token·앱 ID 검증, 게스트 승격 |
| 현재 | `POST /auth/refresh` | 구현됨 | Refresh Token 회전과 재사용 탐지 |
| 현재 | `POST /auth/logout` | 구현됨 | 현재 Refresh Session 폐기 |
| 현재 | `GET /me` | 구현됨 | 회원 전용이며 게스트는 `403 AUTH_REQUIRED` |
| 현재 | `GET /scenes` | 구현됨 | locale fallback과 공개 템플릿 수를 포함한 장소 카탈로그 |
| 현재 | `GET /templates` | 구현됨 | 장소·비율·인원 필터, 정렬, 필터 결합 cursor 지원 |
| 현재 | `GET /templates/{templateId}` | 구현됨 | 현재 또는 명시한 공개 버전과 overlay guide 조회 |
| 현재 | `PUT/DELETE /templates/{templateId}/like` | 구현됨 | 회원 전용 멱등 좋아요와 트랜잭션 집계 |
| 현재 | `PUT/DELETE /templates/{templateId}/bookmark` | 구현됨 | 회원 전용 멱등 북마크 |
| 현재 | `GET /me/liked-templates` | 구현됨 | 회원의 좋아요 컬렉션 cursor 조회 |
| 현재 | `GET /me/bookmarked-templates` | 구현됨 | 회원의 북마크 컬렉션 cursor 조회 |
| 현재 | `POST /uploads` | 구현됨 | guest/member 스트리밍 JPEG·WebP 검증과 1시간 임시 저장. 멱등 키 처리는 B-12에서 추가 |
| 현재 | `DELETE /uploads/{uploadId}` | 구현됨 | 소유한 미사용 업로드만 반복 안전하게 폐기 |
| 현재 임시 mock | `POST /api/v1/scene-analysis` | 구현됨 | JSON의 `imageReference`를 받아 동기 `200` mock 응답을 반환함 |
| MVP 목표 | `POST /api/v1/scene-analyses` | 미구현 | 인증된 `uploadId`로 비동기 작업을 만들고 SSE로 진행 상황을 전달함 |
| MVP 목표 | 이 문서와 `openapi.yaml`의 나머지 API | 미구현 | 각 백엔드 Issue에서 순서대로 구현함 |

단수형 `/scene-analysis`는 앱·서버 연결을 확인하기 위한 임시 라우트이며 공개 계약이 아니다. 목표 API가 구현되면 제거한다. Android 신규 코드는 임시 mock 형식에 의존하지 않는다.

## 1. MVP에서 확정할 원칙

- Android 앱은 Google 또는 Kakao SDK로 공급자 인증을 마친 뒤 공급자 토큰을 백엔드에 전달한다.
- 백엔드는 공급자 토큰을 검증하고 DearShot 전용 Access Token과 Refresh Token을 발급한다.
- 로그인하지 않은 사용자도 게스트 토큰을 받아 장면 분석과 템플릿 조회를 사용할 수 있다.
- 좋아요, 북마크, 사용자 설정 동기화는 회원 토큰이 필요하다.
- Android는 EXIF를 제거하고 긴 변 2048px 이하로 압축한 분석 이미지를 Node API에 multipart로 전송한다.
- 서버는 분석 이미지를 EC2 임시 저장소에만 두고 작업 완료 후 즉시, 장애 상황에서도 최대 1시간 안에 삭제한다.
- 장면 분석 진행 상황과 키워드는 SSE(Server-Sent Events)로 전달한다.
- 촬영 피드백은 비동기로 처리하며 앱이 결과를 조회한다. 이후 필요하면 SSE를 추가한다.
- 촬영 세션, 원본 사진 목록, 최종 갤러리 저장은 Android 로컬에서 관리한다.
- 템플릿은 관리자 API로 등록·수정·배포해 앱 업데이트 없이 교체한다.
- 모든 날짜는 UTC ISO 8601 문자열을 사용한다. 사용자·업로드·작업 ID는 UUID, scene과 template ID는 변경되지 않는 slug를 사용한다.

## 2. 공통 규칙

### 2.1 요청 헤더

| 헤더 | 필수 | 설명 |
|---|---:|---|
| `Authorization: Bearer {token}` | 조건부 | 게스트 또는 회원 Access Token |
| `Accept-Language` | 선택 | `ko-KR`, `en-US` 등. 없으면 사용자 설정, 그것도 없으면 `en-US` |
| `X-Request-Id` | 선택 | 클라이언트가 생성한 추적 ID. 없으면 서버가 생성 |
| `Idempotency-Key` | 조건부 | 중복 생성이 위험한 `POST` 요청에 사용. UUID 권장 |
| `Last-Event-ID` | 선택 | 끊어진 SSE 스트림 재연결 시 마지막으로 받은 이벤트 ID |

### 2.2 인증 주체

| 주체 | 가능한 작업 |
|---|---|
| 비인증 | Health, 공개 장면·템플릿 조회, 앱 설정 조회, 인증 시작 |
| 게스트 | 이미지 업로드, 장면 분석, 촬영 피드백 |
| 회원 | 게스트 권한 + 좋아요, 북마크, 개인 설정, 계정 관리 |
| 관리자 | 템플릿 생성·버전 관리·배포·보관 |

게스트 토큰도 서버가 발급한 Bearer Token이다. 쿼리 파라미터나 SSE URL에 토큰을 넣지 않는다.

### 2.3 페이지네이션

목록 API는 cursor 기반 페이지네이션을 사용한다.

```json
{
  "items": [],
  "nextCursor": "opaque-cursor-or-null",
  "hasNext": false
}
```

`cursor`는 서버가 발급한 불투명 문자열이며 앱에서 해석하지 않는다. `limit` 기본값은 20, 최댓값은 50이다.

### 2.4 공통 오류

클라이언트는 선택적으로 `X-Request-ID`에 UUID를 보낼 수 있다. 서버는 유효한 UUID를 유지하고, 누락되거나 잘못된 값은 새 UUID로 교체한다. 모든 응답의 `X-Request-ID`와 오류 본문의 `requestId`는 동일하며 장애 문의와 서버 로그 추적에 사용한다.

```json
{
  "requestId": "7be5550f-37e5-43df-8a87-11728a077c31",
  "code": "INVALID_REQUEST",
  "message": "요청 형식이 올바르지 않습니다.",
  "details": {
    "fieldErrors": {
      "image": ["JPEG 또는 WebP 파일이 필요합니다."]
    }
  }
}
```

| HTTP | 대표 코드 | 의미 |
|---:|---|---|
| 400 | `INVALID_REQUEST` | 필드 누락, 형식 오류 |
| 401 | `INVALID_TOKEN`, `TOKEN_EXPIRED` | 토큰이 없거나 유효하지 않음 |
| 403 | `AUTH_REQUIRED`, `FORBIDDEN` | 회원 또는 관리자 권한 필요 |
| 404 | `RESOURCE_NOT_FOUND` | 대상 없음 |
| 409 | `RESOURCE_CONFLICT`, `UPLOAD_ALREADY_USED` | 현재 상태와 요청이 충돌 |
| 413 | `IMAGE_TOO_LARGE` | 이미지 제한 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | 지원하지 않는 multipart 이미지 Content-Type |
| 422 | `SCENE_UNCERTAIN`, `INVALID_IMAGE`, `IMAGE_DIMENSIONS_UNSUPPORTED` | 형식은 맞지만 분석 불가 |
| 429 | `RATE_LIMITED` | 요청 한도 초과. `Retry-After` 확인 |
| 500 | `INTERNAL_ERROR` | 서버 내부 오류 |
| 502 | `AI_PROVIDER_FAILED`, `PROVIDER_INVALID_RESPONSE` | 외부 제공자의 응답 형식 또는 내용 오류 |
| 503 | `SERVICE_UNAVAILABLE`, `PROVIDER_TIMEOUT`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE` | 외부 제공자 timeout·호출 제한 또는 일시적 장애 |

앱은 `message` 문자열로 분기하지 않고 `code`로 분기한다.

## 3. 엔드포인트 요약

### 인증과 사용자

| Method | Path | 권한 | 용도 |
|---|---|---|---|
| `POST` | `/auth/guest` | 비인증 | 게스트 토큰 발급 |
| `POST` | `/auth/google` | 비인증 | Google 로그인·가입 |
| `POST` | `/auth/kakao` | 비인증 | Kakao 로그인·가입 |
| `POST` | `/auth/refresh` | Refresh Token | 토큰 회전 |
| `POST` | `/auth/logout` | 회원/게스트 | 현재 Refresh Token 폐기 |
| `GET` | `/me` | 회원 | 내 계정 조회 |
| `PATCH` | `/me/preferences` | 회원 | 언어·동의·촬영 기본값 변경 |
| `DELETE` | `/me` | 회원 | 회원 탈퇴 요청 |

### 이미지와 AI

| Method | Path | 권한 | 용도 |
|---|---|---|---|
| `POST` | `/uploads` | 회원/게스트 | multipart 분석 이미지 업로드 |
| `DELETE` | `/uploads/{uploadId}` | 회원/게스트 | 미사용 업로드 폐기 |
| `POST` | `/scene-analyses` | 회원/게스트 | 장면 분석 작업 생성 |
| `GET` | `/scene-analyses/{analysisId}` | 회원/게스트 | 분석 현재 상태·결과 조회 |
| `GET` | `/scene-analyses/{analysisId}/events` | 회원/게스트 | 장면 분석 SSE 구독 |
| `DELETE` | `/scene-analyses/{analysisId}` | 회원/게스트 | 분석 취소·결과 폐기 |
| `POST` | `/photo-feedbacks` | 회원/게스트 | 촬영 피드백 작업 생성 |
| `GET` | `/photo-feedbacks/{feedbackId}` | 회원/게스트 | 피드백 상태·결과 조회 |
| `DELETE` | `/photo-feedbacks/{feedbackId}` | 회원/게스트 | 피드백 취소·결과 폐기 |

### 템플릿과 상호작용

| Method | Path | 권한 | 용도 |
|---|---|---|---|
| `GET` | `/scenes` | 공개 | 지원 장소 카테고리 조회 |
| `GET` | `/templates` | 공개 | 템플릿 목록 조회 |
| `GET` | `/templates/{templateId}` | 공개 | 템플릿 상세 조회 |
| `PUT` | `/templates/{templateId}/like` | 회원 | 좋아요 설정 |
| `DELETE` | `/templates/{templateId}/like` | 회원 | 좋아요 해제 |
| `PUT` | `/templates/{templateId}/bookmark` | 회원 | 북마크 설정 |
| `DELETE` | `/templates/{templateId}/bookmark` | 회원 | 북마크 해제 |
| `GET` | `/me/liked-templates` | 회원 | 좋아요한 템플릿 조회 |
| `GET` | `/me/bookmarked-templates` | 회원 | 북마크한 템플릿 조회 |
| `GET` | `/app-config` | 공개 | 제한값·정책·카탈로그 버전 조회 |

### 템플릿 운영

| Method | Path | 권한 | 용도 |
|---|---|---|---|
| `POST` | `/admin/templates` | 관리자 | 템플릿 초안 생성 |
| `PATCH` | `/admin/templates/{templateId}` | 관리자 | 템플릿 메타데이터 수정 |
| `POST` | `/admin/templates/{templateId}/versions` | 관리자 | 새 콘텐츠 버전 생성 |
| `POST` | `/admin/templates/{templateId}/publish` | 관리자 | 특정 버전 배포 |
| `POST` | `/admin/templates/{templateId}/archive` | 관리자 | 템플릿 노출 중단 |

## 4. 인증 API

### 4.1 게스트 시작

`POST /auth/guest`

로그인 전 분석 기능에 사용할 제한된 토큰을 발급한다. 앱 설치 ID는 Android Keystore에 보관한 임의 UUID이며 광고 ID나 하드웨어 ID를 사용하지 않는다.

```json
{
  "installationId": "b40ec339-d3f5-4d3f-bbc8-6466af975c6a",
  "locale": "ko-KR",
  "appVersion": "1.0.0"
}
```

응답 `201 Created`:

```json
{
  "tokenType": "Bearer",
  "accessToken": "guest-access-token",
  "accessTokenExpiresAt": "2026-09-20T12:30:00Z",
  "refreshToken": "rotating-refresh-token",
  "refreshTokenExpiresAt": "2026-10-20T12:00:00Z",
  "principal": {
    "id": "08c2d717-4f4b-443d-a144-210277153083",
    "type": "GUEST"
  },
  "limits": {
    "sceneAnalysesRemainingToday": 5,
    "photoFeedbacksRemainingToday": 10
  }
}
```

### 4.2 Google 로그인

`POST /auth/google`

Android Credential Manager에서 받은 Google ID Token을 보낸다. 백엔드는 서명, `aud`, `iss`, `exp`, `nonce`를 검증한다.

Android는 로그인 시마다 최소 128비트 난수 nonce를 새로 만들고 Credential Manager의 Google 요청과 이 API에 같은 값을 전달한다. 서버는 검증된 ID Token의 nonce와 요청 nonce를 비교하며, nonce의 SHA-256 해시를 토큰 만료 시각까지 보관해 재사용을 거부한다. Google ID Token 원문은 저장하지 않는다.

```json
{
  "idToken": "google-id-token",
  "nonce": "nonce-used-by-android",
  "guestAccessToken": "optional-current-guest-token",
  "device": {
    "installationId": "b40ec339-d3f5-4d3f-bbc8-6466af975c6a",
    "platform": "ANDROID",
    "appVersion": "1.0.0"
  }
}
```

### 4.3 Kakao 로그인

`POST /auth/kakao`

Kakao SDK가 발급한 Access Token을 보낸다. 백엔드는 Kakao `access_token_info`에서 유효 기간, 앱 ID, 회원번호를 확인하고 `user/me`의 회원번호와 다시 대조한다. 두 API의 timeout은 기본 3초이며 로그인 요청 안에서 자동 재시도하지 않는다. Kakao Access Token 원문과 공급자의 원본 오류 응답은 저장하지 않는다.

```json
{
  "accessToken": "kakao-access-token",
  "guestAccessToken": "optional-current-guest-token",
  "device": {
    "installationId": "b40ec339-d3f5-4d3f-bbc8-6466af975c6a",
    "platform": "ANDROID",
    "appVersion": "1.0.0"
  }
}
```

Google과 Kakao 로그인 성공 응답 `200 OK`:

```json
{
  "tokenType": "Bearer",
  "accessToken": "dearshot-access-token",
  "accessTokenExpiresAt": "2026-09-20T12:30:00Z",
  "refreshToken": "rotating-refresh-token",
  "refreshTokenExpiresAt": "2026-10-20T12:00:00Z",
  "isNewUser": true,
  "user": {
    "id": "47194261-97f3-4d7c-9bb1-f6ee45d6cf61",
    "displayName": "한서",
    "profileImageUrl": null,
    "providers": ["GOOGLE"],
    "preferences": {
      "locale": "ko-KR",
      "defaultAspectRatio": "4:3",
      "allowLocationContext": false,
      "aiProcessingConsentVersion": "2026-09-01"
    }
  }
}
```

`isNewUser`는 해당 공급자 identity가 처음 연결된 경우 `true`다. 유효한 `guestAccessToken`과 같은 `installationId`가 전달되고 Google identity가 아직 사용되지 않았다면 기존 게스트 `users.id`를 그대로 회원으로 승격한다. identity가 이미 다른 회원 소유라면 그 회원으로 로그인하며 게스트 데이터를 자동 병합하지 않고 게스트를 정리 대기 상태로 전환한다. 사진 원본은 서버 계정에 병합하지 않는다.

### 4.4 토큰 재발급

`POST /auth/refresh`

```json
{
  "refreshToken": "current-refresh-token"
}
```

Refresh Token은 매번 회전한다. 성공 응답에 새 Access Token과 새 Refresh Token을 모두 포함하며 기존 토큰은 즉시 폐기한다. 이미 사용된 Refresh Token이 재사용되면 탈취 가능성이 있으므로 해당 토큰 계열 전체를 폐기한다.

Access Token은 15분, Refresh Token은 30일을 기본값으로 사용한다. 서버는 Refresh Token 원문을 저장하지 않고 SHA-256 해시만 저장한다. 동시에 같은 Refresh Token을 재발급하면 하나만 성공하며, 나머지 요청은 재사용으로 판단해 해당 token family를 폐기한다.

토큰을 반환하는 인증 응답은 `Cache-Control: no-store`와 `Pragma: no-cache`를 포함한다. 앱은 Access Token과 Refresh Token을 일반 로그, 분석 이벤트, URL 또는 평문 설정 파일에 기록하지 않는다.

### 4.5 로그아웃

`POST /auth/logout`

```json
{
  "refreshToken": "current-refresh-token"
}
```

응답은 `204 No Content`다. Google·Kakao 앱 자체 로그아웃은 Android SDK에서 별도로 처리한다.

## 5. 사용자 API

### 5.1 내 정보

`GET /me`

회원 정보, 연결된 로그인 공급자, 환경 설정, 좋아요·북마크 수를 반환한다. 게스트 토큰에는 `403 AUTH_REQUIRED`를 반환한다.

### 5.2 환경 설정 변경

`PATCH /me/preferences`

보낸 필드만 변경한다.

```json
{
  "locale": "en-US",
  "defaultAspectRatio": "4:3",
  "allowLocationContext": true,
  "aiProcessingConsentVersion": "2026-09-01"
}
```

### 5.3 회원 탈퇴

`DELETE /me`

```json
{
  "confirmation": "DELETE",
  "reason": "NOT_USEFUL"
}
```

응답 `202 Accepted`:

```json
{
  "deletionId": "305da619-e1af-478a-945c-629866881647",
  "scheduledAt": "2026-09-20T12:00:00Z"
}
```

Access Token과 Refresh Token은 즉시 폐기하고 계정 데이터는 개인정보처리방침에 명시한 기간 안에 삭제한다.

## 6. 임시 이미지 업로드

장면 분석과 피드백은 동일한 업로드 API를 사용한다.

### 6.1 이미지 업로드

`POST /uploads`

`Authorization` 필수. 최종 계약에서는 `Idempotency-Key`도 필수이며 B-12에서 중복 요청 처리를 추가한다. Content-Type은 `multipart/form-data`이며 JSON이나 Base64 이미지를 받지 않는다.

```text
purpose = SCENE_ANALYSIS | PHOTO_FEEDBACK
image   = JPEG 또는 WebP binary file
```

제약:

- 지원 형식: `image/jpeg`, `image/webp`
- 최대 크기: 앱 설정값 기준, MVP 기본 10MB
- 권장 긴 변 길이: 2048px 이하
- 서버 hard limit: 가로·세로 각각 8192px 이하, 총 40MP 이하
- EXIF 위치 정보는 Android에서 제거한 뒤 업로드
- 서버는 multipart 헤더뿐 아니라 파일 signature, 실제 이미지 decode, 크기를 검증
- 서버가 SHA-256, 실제 MIME, width, height를 계산하므로 클라이언트가 해당 값을 선언하지 않음

응답 `201 Created`:

```json
{
  "uploadId": "29928e5b-ed75-4e47-af53-53b8d47b5bcb",
  "status": "READY",
  "purpose": "SCENE_ANALYSIS",
  "contentType": "image/jpeg",
  "byteSize": 2384102,
  "width": 1536,
  "height": 2048,
  "expiresAt": "2026-09-20T12:10:00Z"
}
```

파일 쓰기, 검증, 메타데이터 저장이 모두 끝난 뒤에만 `READY`를 반환한다. 응답에는 서버 파일 경로나 외부 URL을 포함하지 않는다. 실패한 요청의 부분 파일은 제거한다.

동일한 사용자와 `Idempotency-Key`, purpose, 파일 내용으로 재시도하면 기존 `UploadResource`를 반환한다. 같은 key에 다른 purpose나 파일을 사용하면 `409 IDEMPOTENCY_CONFLICT`를 반환한다.

다른 사용자의 업로드는 참조할 수 없고, 한 AI 작업에 소비된 업로드를 다시 사용하면 `409 UPLOAD_ALREADY_USED`를 반환한다. 업로드 purpose와 생성할 작업 종류가 다르면 `409 UPLOAD_PURPOSE_MISMATCH`를 반환한다.

| HTTP | 코드 | 조건 |
|---:|---|---|
| 400 | `INVALID_MULTIPART`, `INVALID_PURPOSE` | 필수 part 누락 또는 purpose 오류 |
| 401 | `INVALID_TOKEN`, `TOKEN_EXPIRED` | 인증 실패 |
| 409 | `IDEMPOTENCY_CONFLICT` | 같은 key에 다른 요청 사용 |
| 413 | `IMAGE_TOO_LARGE` | 전송 중 byte limit 초과 |
| 415 | `UNSUPPORTED_MEDIA_TYPE` | JPEG/WebP 이외의 part Content-Type |
| 422 | `INVALID_IMAGE`, `IMAGE_DIMENSIONS_UNSUPPORTED` | signature 불일치, decode 실패, 해상도 제한 초과 |
| 429 | `RATE_LIMITED` | 업로드 요청 한도 초과 |

### 6.2 미사용 업로드 폐기

`DELETE /uploads/{uploadId}`는 본인이 소유한 `READY` 업로드를 폐기한다. 이미 AI 작업에 소비된 업로드는 `409 UPLOAD_ALREADY_USED`를 반환한다. 삭제 작업은 동일 요청을 반복해도 안전해야 한다.

## 7. 장면 분석

### 7.1 분석 작업 생성

`POST /scene-analyses`

`Idempotency-Key` 필수.

```json
{
  "uploadId": "29928e5b-ed75-4e47-af53-53b8d47b5bcb",
  "capturedAt": "2026-09-20T08:41:00Z",
  "locale": "ko-KR",
  "context": {
    "timezone": "Asia/Seoul",
    "location": {
      "latitude": 35.1532,
      "longitude": 129.1188,
      "accuracyMeters": 120
    }
  }
}
```

`context.location`은 선택 사항이다. 사용자가 위치 활용을 거부하면 키 자체를 보내지 않는다. 서버는 좌표를 로그에 남기지 않으며 분석 입력으로만 사용한다.

응답 `202 Accepted`:

```json
{
  "analysisId": "ec863a30-d1d8-4285-a043-e1769ee2d7b5",
  "status": "QUEUED",
  "eventsUrl": "/api/v1/scene-analyses/ec863a30-d1d8-4285-a043-e1769ee2d7b5/events",
  "expiresAt": "2026-09-21T08:41:00Z"
}
```

### 7.2 SSE 이벤트 구독

`GET /scene-analyses/{analysisId}/events`

```http
Accept: text/event-stream
Authorization: Bearer {accessToken}
Last-Event-ID: 3
```

Android는 OkHttp 기반 SSE 클라이언트를 사용한다. 토큰을 URL 쿼리에 넣지 않는다. 서버는 15초마다 `: heartbeat` 주석을 보내 프록시 연결 종료를 방지한다.

이벤트 순서 예시:

```text
id: 1
event: status
data: {"stage":"PREPROCESSING","progress":10}

id: 2
event: clue
data: {"keyword":"바다","confidence":0.97}

id: 3
event: clue
data: {"keyword":"맑은 하늘","confidence":0.91}

id: 4
event: scene
data: {"sceneKey":"beach","displayName":"바다","confidence":0.94}

id: 5
event: recommendation
data: {"templateIds":["beach-breeze","beach-horizon","beach-walk"],"reason":"열린 수평선과 부드러운 측면광이 잘 어울려요."}

id: 6
event: completed
data: {"analysisId":"ec863a30-d1d8-4285-a043-e1769ee2d7b5"}
```

| event | 용도 | 여러 번 발생 |
|---|---|---:|
| `status` | 전처리·장면 판별·추천 단계와 진행률 | 가능 |
| `clue` | 화면에 즉시 노출할 검증된 장면 단서 | 가능 |
| `scene` | 최종 장소 카테고리 | 불가 |
| `recommendation` | 추천 템플릿과 근거 | 불가 |
| `completed` | 정상 종료 | 불가 |
| `failed` | 오류 코드와 재시도 가능 여부 | 불가 |

재연결 규칙:

1. 앱은 마지막 `id`를 저장한다.
2. 연결이 끊기면 지수 백오프로 재연결하고 `Last-Event-ID`를 보낸다.
3. 서버는 보관 중인 다음 이벤트부터 재전송한다.
4. `completed` 또는 `failed`를 받으면 스트림을 닫는다.
5. 이벤트 보관 기간이 끝났으면 상태 조회 API로 최종 결과를 조회한다.

### 7.3 분석 상태 조회

`GET /scene-analyses/{analysisId}`

완료 응답:

```json
{
  "analysisId": "ec863a30-d1d8-4285-a043-e1769ee2d7b5",
  "status": "COMPLETED",
  "clues": [
    {"keyword": "바다", "confidence": 0.97},
    {"keyword": "맑은 하늘", "confidence": 0.91}
  ],
  "scene": {
    "sceneKey": "beach",
    "displayName": "바다",
    "confidence": 0.94
  },
  "recommendation": {
    "templateIds": ["beach-breeze", "beach-horizon", "beach-walk"],
    "reason": "열린 수평선과 부드러운 측면광이 잘 어울려요."
  },
  "createdAt": "2026-09-20T08:41:01Z",
  "completedAt": "2026-09-20T08:41:04Z",
  "expiresAt": "2026-09-21T08:41:00Z"
}
```

장면을 확정하기 어려우면 작업을 오류로 끝내지 않고 `NEEDS_USER_SELECTION`과 후보 장면을 반환한다. Android는 장소 직접 선택 화면을 연다.

## 8. 촬영 피드백

### 8.1 피드백 작업 생성

`POST /photo-feedbacks`

`Idempotency-Key` 필수.

```json
{
  "uploadId": "0215c9d9-e6ad-4eb1-babc-fe88a319cce6",
  "analysisId": "ec863a30-d1d8-4285-a043-e1769ee2d7b5",
  "template": {"id": "beach-breeze", "version": 3},
  "capture": {
    "aspectRatio": "4:3",
    "orientation": "PORTRAIT",
    "guideEnabled": true
  },
  "previousFeedbackId": "optional-feedback-id"
}
```

`previousFeedbackId`가 있으면 직전 촬영보다 개선되었는지 비교한다. 이전 사진 원본을 장기 보관하는 대신, 만료되지 않은 분석 결과나 추출 특징만 재사용한다.

응답 `202 Accepted`:

```json
{
  "feedbackId": "8d396cba-63aa-4769-ad97-2c16b7a4627d",
  "status": "QUEUED",
  "pollAfterMs": 1000,
  "expiresAt": "2026-09-21T08:43:00Z"
}
```

### 8.2 피드백 조회

`GET /photo-feedbacks/{feedbackId}`

```json
{
  "feedbackId": "8d396cba-63aa-4769-ad97-2c16b7a4627d",
  "status": "COMPLETED",
  "primary": {
    "type": "SUBJECT_POSITION",
    "message": "인물을 화면 오른쪽으로 조금 이동해 보세요.",
    "action": "MOVE_RIGHT",
    "severity": "RECOMMENDED",
    "confidence": 0.89
  },
  "secondary": {
    "type": "HORIZON_LEVEL",
    "message": "수평선을 조금만 바로잡으면 더 안정적으로 보여요.",
    "action": "LEVEL_CAMERA",
    "severity": "OPTIONAL",
    "confidence": 0.77
  },
  "comparison": {
    "available": true,
    "improvedFromPrevious": true,
    "summary": "인물 위치가 가이드에 더 가까워졌어요."
  },
  "retakeRecommended": true,
  "createdAt": "2026-09-20T08:43:00Z",
  "completedAt": "2026-09-20T08:43:03Z",
  "expiresAt": "2026-09-21T08:43:00Z"
}
```

피드백 원칙:

- `primary`는 항상 하나만 반환한다.
- `secondary`는 정말 필요한 경우에만 반환한다.
- 얼굴의 미적 점수, 체형 평가, 매력도 평가는 하지 않는다.
- 사용자가 바로 행동할 수 있는 위치·수평·거리·여백·노출 중심으로 표현한다.
- 동일 사진에 대한 재요청은 `Idempotency-Key`로 중복 과금을 막는다.

## 9. 장면과 템플릿

### 9.1 장면 목록

`GET /scenes?locale=ko-KR`

```json
{
  "catalogVersion": "2026.09.20.1",
  "items": [
    {
      "key": "beach",
      "displayName": "바다",
      "thumbnailUrl": "https://cdn.example.com/scenes/beach.webp",
      "templateCount": 12,
      "active": true
    }
  ]
}
```

### 9.2 템플릿 목록

`GET /templates`

| 쿼리 | 필수 | 예시 | 설명 |
|---|---:|---|---|
| `scene` | 선택 | `beach` | 장소 카테고리 |
| `locale` | 선택 | `ko-KR` | 지역화 문구 |
| `sort` | 선택 | `recommended` | `recommended`, `popular`, `latest` |
| `aspectRatio` | 선택 | `4:3` | 지원 촬영 비율 |
| `peopleCount` | 선택 | `1` | 피사체 인원수 |
| `cursor` | 선택 | opaque | 다음 페이지 커서 |
| `limit` | 선택 | `20` | 1~50 |

응답:

```json
{
  "catalogVersion": "2026.09.20.1",
  "items": [
    {
      "id": "beach-breeze",
      "version": 3,
      "title": "바람을 느끼는 순간",
      "summary": "한 손은 머리 근처에 두고 시선은 옆으로 보내세요.",
      "sceneKeys": ["beach"],
      "thumbnailUrl": "https://cdn.example.com/templates/beach-breeze/thumb.webp",
      "previewUrl": "https://cdn.example.com/templates/beach-breeze/preview.webp",
      "supportedAspectRatios": ["4:3", "9:16"],
      "peopleCount": 1,
      "likeCount": 128,
      "liked": false,
      "bookmarked": true
    }
  ],
  "nextCursor": null,
  "hasNext": false
}
```

비로그인·게스트 요청에서는 `liked`, `bookmarked`가 항상 `false`다.

### 9.3 템플릿 상세

`GET /templates/{templateId}?locale=ko-KR&version=3`

```json
{
  "id": "beach-breeze",
  "version": 3,
  "title": "바람을 느끼는 순간",
  "summary": "한 손은 머리 근처에 두고 시선은 옆으로 보내세요.",
  "sceneKeys": ["beach"],
  "previewUrl": "https://cdn.example.com/templates/beach-breeze/preview.webp",
  "supportedAspectRatios": ["4:3", "9:16"],
  "peopleCount": 1,
  "guide": {
    "type": "SVG_OVERLAY",
    "assetUrl": "https://cdn.example.com/templates/beach-breeze/v3/guide.svg",
    "coordinateSpace": "NORMALIZED",
    "referenceWidth": 1000,
    "referenceHeight": 1333,
    "safeArea": {"left": 0.06, "top": 0.05, "right": 0.94, "bottom": 0.95}
  },
  "instructions": [
    {"order": 1, "text": "인물을 화면 중앙보다 조금 왼쪽에 맞추세요."},
    {"order": 2, "text": "머리 위에 하늘 여백을 남겨보세요."}
  ],
  "likeCount": 128,
  "liked": false,
  "bookmarked": true,
  "publishedAt": "2026-09-20T00:00:00Z"
}
```

앱은 촬영 당시 `templateId`와 `version`을 함께 저장한다. 서버가 새 버전을 배포해도 진행 중인 촬영에는 기존 버전을 사용한다.

인증 없는 조회와 게스트 조회는 `liked`, `bookmarked`를 `false`로 반환한다. 유효한 회원 Access Token을 선택적으로 보내면 목록과 상세에 회원의 실제 상태를 묶어서 반환한다. locale은 요청값이 있으면 정확히 일치하는 문구를 사용하고, 없으면 `en-US`로 fallback한다. 공개된 버전과 그 지역화 문구는 DB trigger로 수정·삭제를 거부하며, 변경은 반드시 새 version으로 배포한다.

## 10. 좋아요와 북마크

좋아요는 공개 선호 신호, 북마크는 개인 보관이다. 모두 회원 전용이다.

```http
PUT    /templates/{templateId}/like
DELETE /templates/{templateId}/like
PUT    /templates/{templateId}/bookmark
DELETE /templates/{templateId}/bookmark
```

설정 응답:

```json
{
  "templateId": "beach-breeze",
  "liked": true,
  "likeCount": 129
}
```

이미 설정된 상태에서 다시 `PUT`하거나 해제된 상태에서 다시 `DELETE`해도 성공한다. 네트워크 재시도에 안전한 멱등 API다.

목록:

```http
GET /me/liked-templates?cursor=...&limit=20
GET /me/bookmarked-templates?cursor=...&limit=20
```

두 목록은 `locale`, `cursor`, `limit`을 받는다. 최신 설정 순서로 정렬하며 cursor는 `(createdAt, templateId)`를 사용하고 회원 ID와 컬렉션 종류에 묶인다. 다른 회원이나 좋아요·북마크 사이에서 cursor를 재사용하면 `400 INVALID_CURSOR`를 반환한다.

좋아요의 관계 행과 `templates.like_count` 증감은 같은 transaction에서 처리한다. 복합 PK와 `INSERT ... ON CONFLICT DO NOTHING`, 안전한 `DELETE ... RETURNING`을 사용하므로 동시에 같은 요청이 도착해도 행과 집계가 한 번만 바뀐다. 토큰이 없거나 유효하지 않으면 `401 INVALID_TOKEN`, 게스트 토큰이면 `403 AUTH_REQUIRED`를 반환한다.

회원 상태가 포함된 카탈로그와 회원 컬렉션 응답은 `Cache-Control: private, no-store`와 `Vary: Authorization`을 사용한다. 비인증 카탈로그 응답만 60초 동안 공개 캐시할 수 있다.

## 11. 앱 설정

`GET /app-config?platform=android&appVersion=1.0.0&locale=ko-KR`

```json
{
  "minimumSupportedVersion": "1.0.0",
  "latestVersion": "1.0.0",
  "forceUpdate": false,
  "maintenance": false,
  "catalogVersion": "2026.09.20.1",
  "upload": {
    "maxBytes": 10485760,
    "supportedContentTypes": ["image/jpeg", "image/webp"],
    "recommendedLongEdgePx": 2048
  },
  "guestLimits": {
    "sceneAnalysesPerDay": 5,
    "photoFeedbacksPerDay": 10
  },
  "legal": {
    "privacyPolicyVersion": "2026-09-01",
    "privacyPolicyUrl": "https://dearshot.app/privacy",
    "termsVersion": "2026-09-01",
    "termsUrl": "https://dearshot.app/terms"
  },
  "features": {
    "kakaoLogin": true,
    "locationContext": true,
    "feedbackComparison": true
  }
}
```

## 12. 관리자 템플릿 API

관리자 API는 모바일 앱에서 호출하지 않는다. 초기에는 별도 관리자 화면 없이 Swagger 또는 내부 스크립트로 사용한다.

```http
POST  /admin/templates
PATCH /admin/templates/{templateId}
POST  /admin/templates/{templateId}/versions
POST  /admin/templates/{templateId}/publish
POST  /admin/templates/{templateId}/archive
```

초안 생성 예시:

```json
{
  "id": "beach-breeze",
  "sceneKeys": ["beach"],
  "peopleCount": 1,
  "supportedAspectRatios": ["4:3", "9:16"],
  "localizations": {
    "ko-KR": {
      "title": "바람을 느끼는 순간",
      "summary": "한 손은 머리 근처에 두고 시선은 옆으로 보내세요."
    },
    "en-US": {
      "title": "Feel the breeze",
      "summary": "Bring one hand near your hair and look to the side."
    }
  }
}
```

버전 생성에는 미리보기·가이드 에셋 URL, 지역화 문구, 안전 영역을 포함한다. 배포 요청은 `version`, `publishAt`을 받으며 현재 배포 버전을 원자적으로 변경한다. 보관은 새 목록에서만 제거하며 이미 촬영 중인 사용자를 위해 기존 버전 조회는 유지한다.

## 13. 전체 사용자 흐름

### 13.1 로그인 전 첫 촬영

```text
POST /auth/guest
→ GET /app-config
→ POST /uploads (multipart: purpose + image)
→ POST /scene-analyses
→ GET /scene-analyses/{id}/events
→ GET /templates?scene=beach
→ 촬영
→ POST /uploads (multipart: purpose + image)
→ POST /photo-feedbacks
→ GET /photo-feedbacks/{id}
```

### 13.2 회원 로그인과 북마크

```text
Google Credential Manager 또는 Kakao SDK
→ POST /auth/google 또는 /auth/kakao
→ DearShot 토큰 저장
→ PUT /templates/{id}/bookmark
→ GET /me/bookmarked-templates
```

## 14. 보안·개인정보 요구사항

- Access Token은 짧게, Refresh Token은 회전 방식으로 운영한다.
- Refresh Token은 Android Keystore로 보호한 저장소에 저장한다.
- 공급자 토큰과 DearShot 토큰을 로그에 남기지 않는다.
- Node는 업로드를 stream으로 처리하며 request·file·pixel limit을 각각 적용한다.
- 임시 파일명은 서버가 무작위로 생성하고 `/srv/dearshot/uploads` 밖의 경로를 허용하지 않는다.
- 업로드 소유자와 AI 작업 요청자가 같은지 검증한다.
- EXIF 위치 정보는 업로드 전에 제거한다.
- 정밀 좌표와 이미지 URL은 애플리케이션 로그·분석 도구에 기록하지 않는다.
- 사진은 모델 학습에 사용하지 않는다.
- 장면 분석·피드백 원본은 작업 완료 후 즉시 삭제를 시도하고, 장애 상황에서도 최대 1시간 안에 삭제한다.
- 좋아요·북마크 API는 사용자별 유일 제약으로 중복 행을 방지한다.
- 외부 AI 응답은 스키마 검증 후 앱에 전달한다.
- SSE 이벤트 텍스트도 locale에 맞추되 앱 분기는 문자열이 아닌 `stage`, `action`, `code`로 처리한다.

## 15. 구현 순서

1. 공통 오류, 요청 ID, 토큰 미들웨어
2. 게스트·Google·Kakao 인증과 Refresh Token 회전
3. 임시 업로드와 자동 삭제 작업
4. 장면 분석 작업 큐와 SSE
5. 장면·템플릿 조회와 캐시 버전
6. 촬영 피드백 비동기 처리
7. 좋아요·북마크
8. 사용자 설정·탈퇴
9. 관리자 템플릿 생성·배포

## 16. 명세 변경 규칙

- 호환 가능한 필드 추가는 같은 `/api/v1`에서 허용한다.
- 기존 필드 삭제, 의미 변경, 타입 변경은 `/api/v2`에서 진행한다.
- 새로운 enum 값이 추가될 수 있으므로 Android는 알 수 없는 값을 안전하게 처리한다.
- `API.md`는 의도와 예시를 설명하고 `openapi.yaml`은 요청·응답 스키마의 기준 파일로 사용한다.
- CI에서 `openapi.yaml` 문법과 참조 무결성을 검사한다.
