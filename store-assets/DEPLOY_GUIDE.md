# iOS App Store · Google Play Store 배포 가이드

본 프로젝트는 기존 웹 앱(`index.html`, `js/`, `css/`, `assets/`)의 모든 천문/카메라 계산 기능과 오프라인 캐시를 유지한 채 **Capacitor 8** 기반 **Android(`android/`)** 및 **iOS(`ios/`)** 네이티브 앱으로 패키징되어 있습니다.

---

## 0. 웹 코드 수정 후 네이티브 프로젝트 동기화

웹 코드(`index.html`, `css/`, `js/`, `assets/`, `privacy.html`)를 수정한 뒤에는 항상 아래 명령으로 `www/` 빌드 및 `android/`·`ios/` 동기화를 실행하세요.

```bash
npm run cap:sync
```

아이콘이나 스플래시 이미지(`resources/`)를 바꾼 뒤에는 아래 명령으로 네이티브 리소스를 다시 생성합니다.

```bash
npm run cap:assets
```

---

## 1. Google Play Store 배포 절차 (Android)

### A. 릴리스 서명 키(Keystore) 생성 (최초 1회)
> **주의**: 생성한 `.keystore` 파일과 비밀번호는 절대 Git에 커밋하지 말고 안전한 곳에 백업하세요. 분실 시 Play Store 앱 업데이트가 불가능합니다.

```bash
keytool -genkeypair -v \
  -keystore android/app/nightskyshot-release.keystore \
  -alias nightskyshot \
  -keyalg RSA -keysize 2048 -validity 10000
```

### B. 서명 설정 파일 작성
`android/keystore.properties.example`를 복사해 `android/keystore.properties`를 만들고 비밀번호를 채웁니다(`.gitignore`에 이미 등록되어 있음).

```bash
cp android/keystore.properties.example android/keystore.properties
```

### C. Play Store 제출용 App Bundle(`.aab`) 빌드
> Android 빌드는 **Java 21**(`JDK 21`) 및 Android SDK가 필요합니다.

```bash
npm run cap:sync
cd android
./gradlew bundleRelease
```

생성된 파일: `android/app/build/outputs/bundle/release/app-release.aab`

### D. Google Play Console 등록 체크리스트
1. **앱 만들기**: 앱 이름 `밤하늘 촬영 플래너`, 기본 언어 `한국어`, 무료 앱 선택.
2. **스토어 등록정보**: `store-assets/STORE_LISTING.md`의 한국어/영어 문구 및 아래 그래픽 업로드:
   - 앱 아이콘: `store-assets/google-play/app-icon-512x512.png`
   - 그래픽 이미지: `store-assets/google-play/feature-graphic-1024x500.png`
   - 휴대전화 스크린샷: `store-assets/google-play/screenshots/*.png` (최소 2장 이상 권장)
3. **개인정보 처리방침**: GitHub Pages 배포 주소 `https://mj-best.github.io/night-camera-setting/privacy.html` 입력.
4. **앱 콘텐츠 설문**:
   - 광고: 없음
   - 데이터 보안: `STORE_LISTING.md` 3번 항목 참고 (위치 좌표만 앱 기능용 일회성 사용)
   - 타겟 연령층: 만 13세 이상(일반 대중) 또는 전체 이용가(4+/Everyone 등급)
5. **테스트 → 프로덕션**: 내부 테스트 트랙에 `app-release.aab` 업로드 후 실기기(GPS/나침반) 테스트 진행 → 프로덕션 심사 제출. (개인 Play Console 계정의 경우 비공개 테스트 14일 요건 확인)

---

## 2. Apple App Store 배포 절차 (iOS · macOS + Xcode)

> iOS 네이티브 빌드 및 App Store Connect 업로드는 **macOS + Xcode 15/16+** 및 유료 **Apple Developer Program** 계정이 필요합니다.

### A. 프로젝트 동기화 및 Xcode 열기

```bash
npm run cap:sync
npm run cap:open:ios
```

### B. Xcode 서명 및 Swift 패키지 확인
1. 좌측 프로젝트 내비게이터에서 **App** 프로젝트 선택 → **Signing & Capabilities** 탭으로 이동.
2. **Team**에 Apple Developer 팀 선택 (Bundle Identifier: `com.mjbest.nightskyshot`, `Automatically manage signing` 체크 권장).
3. Xcode가 `ios/App/CapApp-SPM` Swift Package(`Capacitor`, `App`, `Browser`, `Geolocation`, `Haptics`, `SplashScreen`, `StatusBar`)를 자동으로 다운로드하도록 기다립니다.
4. 실기기(iPhone) 연결 시 나침반(`CompassPlugin.swift`), GPS(`Geolocation`), 햅틱(`Haptics`), 상태바(`StatusBar`) 동작을 검증할 수 있습니다. (시뮬레이터에는 자력계가 없어 나침반 시작 시 안내 메시지가 표시됩니다.)

### C. Archive 및 App Store Connect 업로드
1. Xcode 상단 빌드 대상을 **Any iOS Device (arm64)** 로 선택합니다.
2. 메뉴 **Product → Archive** 실행.
3. Organizer 창에서 **Distribute App → App Store Connect → Upload** 순서로 진행합니다.
   - 또는 터미널 CLI: `xcodebuild archive` 및 `xcodebuild -exportArchive -exportOptionsPlist ios/App/ExportOptions.plist`.
4. `Info.plist`에 `ITSAppUsesNonExemptEncryption = false`가 이미 설정되어 있어 수출 규정 준수 절차가 간소화됩니다.

### D. App Store Connect 등록 체크리스트
1. **앱 추가**: 플랫폼 `iOS`, 이름 `밤하늘 촬영 플래너`, 기본 언어 `한국어`, 번들 ID `com.mjbest.nightskyshot`.
2. **앱 정보 & 가격**: 카테고리 `사진 및 비디오`, 가격 `무료`, 개인정보 처리방침 URL 입력.
3. **앱 개인정보(App Privacy)**: `STORE_LISTING.md` 3번 항목대로 `Location(기능 목적, 사용자와 연결 안 됨, 추적 안 함)` 설정.
4. **버전 정보 & 스크린샷**: `store-assets/app-store/screenshots/*.png` (6.7" 디스플레이) 업로드 및 `STORE_LISTING.md`의 설명/키워드/심사 메모(App Review Notes) 입력.
5. **빌드 선택 후 심사 제출**: TestFlight 내부 테스트 확인 후 **심사에 추가(Add for Review)**.

---

## 3. GitHub Actions 자동 빌드 (`.github/workflows/mobile-build.yml`)

저장소의 **Actions → Mobile Native Build Check** 워크플로를 수동(`workflow_dispatch`) 또는 태그 푸시(`git tag v1.0.0 && git push --tags`)로 실행하면 Android APK/AAB 및 iOS 빌드를 자동 검증합니다.

릴리스 서명 비밀키(GitHub Secrets)를 등록하면 서명된 `.aab`와 `.ipa`가 아티팩트로 생성됩니다:
- Android: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`
- iOS: `APPLE_CERT_BASE64`, `APPLE_CERT_PASSWORD`, `APPLE_PROVISIONING_PROFILE_BASE64`, `APPLE_TEAM_ID`
