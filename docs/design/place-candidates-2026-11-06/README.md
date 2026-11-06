# 장소 확장 후보 · 2026-11-06

서점·도서관, 미술관·전시실, 실내 온실 각 6개, 총 18개 후보다. 기존 카탈로그와 프론트에는 반영하지 않았다. Places365 실기기 분류 성능은 별도 검증해야 한다.

각 폴더에는 `example.png`, `thumbnail.webp`, 투명 `guide.svg` / `guide.png`, 사진 위 가이드를 겹친 `review.png`가 있다. 원본은 941 × 1672로 9:16에 근접한 세로 비율이다. 가이드도 동일한 크기를 사용한다. 윤곽은 수작업 구도 안내선이며 정밀 분할 마스크가 아니다. 실선은 인물의 자세, 점선은 주변 공간의 기준이다.

- `library-examples.png`, `museum-examples.png`, `greenhouse-examples.png`: 사진 비교판 (왼쪽 위부터 1–6)
- `*-overlay-review.png`: 정렬 확인판
- `*-guides.png`: 가이드만 모아 본 검토판
- `selection.json`: 번호/이름/원본 파일 대응표
- `prompts.json`: 생성 프롬프트 기록 (built-in image_gen 사용)

`node build.mjs`로 예시 비교판과 썸네일을, `node overlays.mjs`로 투명 가이드와 검토판을 재생성한다. 기존 개별 원본이 있으면 생성 이미지 폴더 없이도 동작한다.
