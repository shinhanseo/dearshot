# API 명세 초안

Base URL: `/api/v1`

## Health

`GET /health`

```json
{
  "status": "ok",
  "service": "dearshot-api"
}
```

## 장면 분석

`POST /scene-analysis`

MVP 구현은 업로드가 끝난 이미지 참조를 받는다. 운영 버전에서는 서명 URL 발급과 업로드 완료 단계를 분리해 API 서버가 원본 바이트를 중계하지 않도록 한다.

요청:

```json
{
  "imageReference": "uploads/session-id/frame.jpg",
  "capturedAt": "2026-09-18T05:30:00.000Z",
  "locale": "ko-KR",
  "coarseLocation": {
    "latitude": 35.15,
    "longitude": 129.11
  }
}
```

응답:

```json
{
  "analysisId": "uuid",
  "scene": {
    "category": "beach",
    "confidence": 0.92,
    "clues": ["ocean", "open sky", "golden hour"]
  },
  "recommendation": {
    "templateIds": ["beach-breeze", "beach-horizon", "beach-walk"],
    "reason": "부드러운 측면광과 열린 수평선이 전신 사진에 어울려요."
  }
}
```

오류 코드:

| HTTP | code | 앱 처리 |
|---|---|---|
| 400 | `INVALID_REQUEST` | 요청 데이터 점검 후 재시도 |
| 401 | `UNAUTHORIZED` | 게스트 토큰 또는 로그인 갱신 |
| 413 | `IMAGE_TOO_LARGE` | 리사이즈 후 재업로드 |
| 422 | `SCENE_UNCERTAIN` | 장소 직접 선택 제공 |
| 429 | `RATE_LIMITED` | 대기 시간 안내 |
| 502 | `AI_PROVIDER_FAILED` | 캐시 템플릿과 직접 선택 제공 |

## 템플릿 카탈로그

`GET /templates?scene=beach&locale=ko-KR&version=2026-09-01`

각 템플릿은 앱 업데이트 없이 교체할 수 있도록 ID, 버전, 지원 장면, 미리보기 URL, 오버레이 좌표, 안내 문장, 활성 상태를 포함한다.

## 촬영 피드백

`POST /photo-feedback`

입력은 촬영 이미지 참조, 선택 템플릿 ID와 버전이다. 응답은 우선순위가 가장 높은 피드백 한 가지, 선택적 보조 피드백, 신뢰도와 재촬영 여부를 반환한다.

