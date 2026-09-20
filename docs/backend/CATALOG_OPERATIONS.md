# 카탈로그 운영 가이드

## 범위

B-09는 장소·구도 콘텐츠 자체를 확정하지 않는다. `backend/catalog/seed.json`과 `dev-` 자산은 API와 import 흐름을 검증하는 개발 fixture다. 실제 장소 분류, 템플릿 문구, 추천 순서, 미리보기, 오버레이는 별도 콘텐츠 검토 후 manifest로 배포한다.

## manifest 규칙

- scene key와 template id는 출시 후 바꾸지 않는 kebab-case 식별자다.
- 모든 scene과 template version은 `en-US` fallback 문구를 가진다.
- 자산 경로는 `catalog/assets` 아래의 상대 경로만 허용한다. 절대 경로, `..`, symlink 탈출, 존재하지 않는 파일은 import 전에 거부한다.
- 공개된 `(templateId, version)`의 데이터와 문구는 수정하지 않는다. 수정할 때는 더 큰 version을 추가하고 `currentVersion`을 바꾼다.
- 앱은 촬영 당시 template id와 version을 함께 저장한다.

## 적용 절차

1. 새 manifest와 모든 자산을 같은 변경에 추가한다.
2. `cd backend && npm run typecheck && npm test`로 형식과 파일 참조를 검증한다.
3. staging DB에서 `npm run catalog:import -- path/to/manifest.json`을 실행한다.
4. 장면 목록, 템플릿 필터, locale fallback, 상세 guide URL을 확인한다.
5. 같은 import를 한 번 더 실행해 결과가 동일한지 확인한다.
6. production에서 같은 명령을 실행한다. 검증과 배포는 한 DB transaction에서 처리된다.

import는 PostgreSQL advisory lock으로 동시에 하나만 실행된다. 모든 파일을 transaction 시작 전에 검증하고, DB 변경은 한 transaction에서 수행한다. 하나라도 실패하면 `currentVersion`과 `catalogVersion`을 포함해 어떤 DB 변경도 반영하지 않는다.

## 캐시와 자산

템플릿 자산은 `templates/{templateId}/v{version}/...`처럼 version이 포함된 경로를 사용한다. 개발 서버는 `/assets/catalog/*`를 제공한다. 운영에서는 `PUBLIC_ASSET_BASE_URL`을 HTTPS CDN 또는 정적 자산 호스트로 설정하며, 같은 공개 version의 파일을 덮어쓰지 않는다.
