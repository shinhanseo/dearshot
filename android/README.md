# DearShot Android 개발 기준 (A-01)

## 현재 프로젝트

Android Studio에서 이 `android/` 디렉터리를 프로젝트로 엽니다. 현재는 Kotlin·Jetpack Compose의 단일 `:app` 모듈과 기본 화면만 있습니다. `namespace`와 `applicationId`는 `com.hanseo.dearshot`, `minSdk` 26, `targetSdk`와 `compileSdk`는 36입니다. Kotlin, Android Gradle Plugin, Compose BOM 등의 **사용 중인 버전**은 `gradle/libs.versions.toml`에서 관리합니다. Gradle Wrapper는 9.3.1, Java target은 17입니다. 기능이 실제로 필요할 때 해당 의존성을 버전 카탈로그에 추가합니다.

## 아키텍처

MVVM과 단방향 데이터 흐름을 사용합니다.

```text
사용자 입력 → Screen → ViewModel → 필요할 때 UseCase → Repository → 데이터 소스
                         ↑                                  │
                         └──────── 불변 UiState/Flow ────────┘
```

- `Screen`/Compose 컴포넌트는 상태를 그리고 사용자 입력을 전달합니다. 권한 요청, 카메라 프리뷰 연결처럼 화면 수명주기에 묶인 일은 UI 쪽에서 처리합니다.
- 화면별 `ViewModel`은 `StateFlow<...UiState>`를 제공하고 사용자 액션을 받아 화면 상태를 바꿉니다. `Context`, `Activity`, `ImageProxy`, 비트맵 프레임은 ViewModel에 보관하지 않습니다.
- `Repository`는 서버·Room·DataStore·파일 등 데이터 소스를 묶고 필요한 데이터를 화면에 제공합니다. API DTO와 Room entity를 화면 상태로 직접 노출하지 않습니다.
- `UseCase`는 안정 프레임 선택 → 업로드 → 추천 폴링 → 현재 `sceneRevision` 검증처럼 여러 단계가 맞물린 흐름이나 여러 화면에서 공유하는 규칙에만 둡니다. 단순 목록 조회를 감싸는 전달용 UseCase는 만들지 않습니다.

초기에는 패키지로 경계를 표현하고 단일 모듈을 유지합니다. 실제 빌드 의존성과 팀 규모가 필요할 때만 모듈을 분리합니다.

```text
com.hanseo.dearshot/
  ui/
    camera/          # Screen, ViewModel, UiState, 카메라 화면 연결
    templates/       # 장소별 목록·상세·수동 선택
    photos/          # 촬영 세션과 사진 목록
    feedback/        # 촬영 피드백
    auth/            # 게스트·소셜 로그인
    settings/        # 튜토리얼·설정
    common/          # 공통 Compose 컴포넌트와 테마
  domain/            # 복합 흐름의 UseCase와 필요할 때 공유 모델
  data/
    camera/          # CameraX adapter, 프레임/촬영 결과
    analysis/        # ONNX adapter와 장면 변화 감지
    remote/          # API DTO, HTTP client, polling
    local/           # Room, DataStore, 사진 파일
    repository/      # 데이터 소스 조합과 domain 모델 변환
```

CameraX 프리뷰와 `ImageAnalysis`는 화면 수명주기에 맞춰 연결하고, 분석기는 느린 추론 중 오래된 프레임을 버립니다. 온디바이스 키워드는 네트워크와 관계없이 표시합니다. 추천 결과는 현재 `sceneRevision`과 같을 때만 적용합니다. 촬영 원본은 앱 전용 저장소에 두고, 서버에는 EXIF를 제거한 분석 사본만 전송합니다.

## 도입할 기술과 시점

| 역할 | 선택 | 도입 시점 |
| --- | --- | --- |
| UI·화면 상태 | Compose, AndroidX ViewModel, Coroutines/StateFlow | A-07 |
| 화면 이동 | Navigation Compose | A-07 |
| 의존성 주입 | Hilt | A-07, 실제 객체 그래프 구성 시 |
| 카메라 | CameraX | A-02 검증 후 A-10 화면 |
| 온디바이스 분석 | ONNX Runtime Android | A-03/A-04 모델 검증 시 |
| HTTP·JSON | Retrofit, OkHttp, Kotlinx Serialization | A-07 클라이언트 구성 시 |
| 이미지 표시 | Coil | A-11 템플릿 목록 시 |
| 검색 가능한 사진/템플릿 메타데이터 | Room | A-11/A-16 저장 시 |
| 작은 설정·튜토리얼 상태 | DataStore | A-08/A-20 저장 시 |
| 장기 보관 토큰 | Android Keystore로 보호한 저장소 | A-09 인증 시 |

전경에서 진행되는 장면 추천·피드백 폴링은 해당 화면/작업의 coroutine 수명주기에 묶습니다. WorkManager는 앱 종료 뒤에도 반드시 완료해야 할 독립적인 작업이 생길 때만 검토합니다. 위 라이브러리는 실제 사용 이슈에서 버전 카탈로그와 Gradle 의존성에 추가합니다.

## API 주소와 민감 설정

서버 주소는 소스에 넣지 않습니다. 현재 Gradle은 `dearshotApiBaseUrl` 프로젝트 속성 또는 `DEARSHOT_API_BASE_URL` 환경변수를 받아 `BuildConfig.API_BASE_URL`로 제공합니다. 둘 다 없으면 빈 문자열로 빌드되며, A-07에서 네트워크 클라이언트를 연결할 때 빈 값의 처리와 빌드 변형별 URL 정책을 완성합니다. 주소는 비밀 값이 아니지만 API 키나 토큰은 Gradle 속성·`BuildConfig`·Git 파일에 넣지 않습니다.

에뮬레이터에서 로컬 Compose API를 사용할 때의 예시는 `http://10.0.2.2:3000/`입니다. 실기기는 같은 네트워크의 개발 PC 주소를 사용합니다. 로컬 HTTP 허용 범위는 API 연동 이슈에서 debug 빌드에만 설정합니다.

## 실행·확인

Android SDK 36과 Java 17 이상을 설치합니다. Android Studio의 Gradle JDK를 설정한 뒤 다음 명령으로 기본 APK를 빌드합니다.

```bash
cd android
./gradlew :app:assembleDebug
```

API 주소 설정이 필요한 개발 빌드의 예시는 다음과 같습니다. 이 단계에서는 아직 API 요청을 실행하지 않습니다.

```bash
./gradlew :app:assembleDebug -PdearshotApiBaseUrl=http://10.0.2.2:3000/
```

Git에는 Android Studio의 `local.properties`, 빌드 산출물, 키 저장소와 실제 토큰을 넣지 않습니다.
