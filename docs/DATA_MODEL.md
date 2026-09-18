# 데이터 모델 초안

## Android 로컬 데이터

### CaptureSession

| 필드 | 설명 |
|---|---|
| `id` | 세션 UUID |
| `status` | 분석·촬영·검토·완료 상태 |
| `sceneCategory` | 서버 분석 또는 직접 선택한 장소 |
| `selectedTemplateId` | 현재 템플릿 |
| `createdAt` | 시작 시각 |
| `updatedAt` | 마지막 상태 변경 시각 |

### CapturedPhoto

| 필드 | 설명 |
|---|---|
| `id` | 사진 UUID |
| `sessionId` | 소속 세션 |
| `templateId` | 촬영 당시 템플릿 |
| `localUri` | 앱 전용 파일 URI |
| `feedbackStatus` | 대기·완료·실패 |
| `isSelected` | 갤러리 저장 선택 여부 |
| `mediaStoreUri` | 최종 저장 후 URI |

### PhotoTemplate

| 필드 | 설명 |
|---|---|
| `id` | 변경되지 않는 템플릿 ID |
| `version` | 콘텐츠 버전 |
| `sceneCategories` | 적용 가능한 장소 목록 |
| `previewUrl` | 예시 이미지 |
| `overlay` | 정규화 좌표 기반 가이드 |
| `instruction` | 지역화 안내 문장 |
| `active` | 노출 여부 |
| `expiresAt` | 캐시 만료 시각 |

## 서버 데이터 원칙

- 템플릿 콘텐츠와 사용자 촬영 파일을 분리한다.
- 분석 파일에는 짧은 만료 시간을 적용하고 작업 완료 후 삭제한다.
- 사진 원본을 학습 데이터로 사용하지 않는다.
- 로그에는 이미지 URL, 정밀 좌표, 사용자 토큰을 남기지 않는다.

