# DearShot 디자인 전달 문서

## 파일

- `dearshot-all-screens.svg`: 전체 화면 보드. Figma에 드래그해 참고·분해할 수 있다.
- `dearshot-design-system.svg`: 색상, 타이포그래피, 컴포넌트 상태.
- `scene-analysis-premium.svg`: 312 × 675.2 장면 분석 진입 화면. 메시, 스캔 라인, 단서 스트림과 단계 상태를 한 화면에 표현한다.
- `scene-analysis-motion-v2.gif`: 실제 Figma 프레임에 반영한 프리미엄 장면 분석 모션 미리보기. Android에서는 상태별 Compose 애니메이션으로 구현한다.
- `flows/ai-analysis-flow.svg`: 장면 분석의 시작·단서 스트리밍·추천 완료 흐름.
- `flows/feedback-flow.svg`: 촬영 후 피드백·재촬영·다음 구도 흐름.
- `tokens.json`: Android 테마와 맞출 디자인 토큰.
- `fonts/`: Pretendard 미리보기용 폰트와 라이선스.

## 현재 기준

- 기준 화면: 390 × 844
- Android 구현 목표: 312 × 675.2를 포함한 다양한 크기에서 사진 비율과 조작 영역 유지
- 주요 색상: Background `#F6F2EA`, Primary `#BC5037`, Text `#282822`
- 앱 이름: DearShot / 디어샷

SVG는 정적 시안이다. GIF는 동작 참고용이며 앱에 그대로 넣지 않는다. 화면 안정 → 장면 인식 → 구도 추천 상태에 맞춰 Compose에서 구현한다.

## Figma 가져오기

1. 새 페이지를 만들고 SVG 파일을 캔버스로 드래그한다.
2. Pretendard가 없다면 `fonts/`의 폰트를 설치한다.
3. 전체 보드는 참고용으로 유지하고, 실제 구현 대상 화면을 별도 프레임에 복제한다.
4. `tokens.json`의 이름을 Compose 테마 토큰과 동일하게 유지한다.
