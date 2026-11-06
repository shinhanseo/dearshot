# 서버 등록 및 추천 검증 · 2026-11-06

`backend/catalog/places-expansion-v1.json`을 로컬 Compose DB에 import했다. 서버 후보 매핑은 bookstore / library/indoor → library, art_gallery / museum/indoor → museum, greenhouse/indoor → greenhouse다. 야외 온실은 실내 온실에 매핑하지 않는다. 기존 카탈로그는 보존했다.

검증 결과:
- TypeScript typecheck 통과
- 카탈로그/장소 매핑 단위 테스트 8개 통과
- 각 장소 9:16 필터 목록에 6개씩 조회
- 한국어·영어 상세 응답 36개, 이미지·썸네일·SVG URL 54개 정상
- 실제 DB 후보 조회에서 장소별 신규 6개가 상위 6개로 전달됨
- 실제 Gemini `gemini-3.5-flash-lite` 호출 3회: 각 장소 01번 예시와 해당 Places365 힌트를 입력, 모든 후보 목록에서 유효한 ID/버전/장소 조합 반환
  - library → library-01@1, SCENE_MATCH, confidence 0.95
  - museum → museum-01@1, SCENE_MATCH, confidence 0.95
  - greenhouse → greenhouse-01@1, SCENE_MATCH, confidence 0.95

모델 입력에 넣은 Places365 힌트는 테스트용으로 구성했다. Android 카메라에서 실제 장소를 분류하고 업로드하는 전 구간을 검증한 결과는 아니다. 실기기 인식 정확도는 별도 확인이 필요하다. 프론트 파일은 변경하지 않았다.
