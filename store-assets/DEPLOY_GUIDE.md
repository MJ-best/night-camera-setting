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
4. `Info.plist`에 `ITSAppUsesNonExemptEncryption = false`, `PrivacyInfo.xcprivacy`에 앱 개인정보 매니페스트(추적 없음, 앱 기능용 위치 사용)가 이미 포함되어 있어 심사 제출 절차가 간소화됩니다.

### D. App Store Connect 등록 체크리스트 (iPhone · iPad 공용)
1. **앱 추가**: 플랫폼 `iOS`, 이름 `밤하늘 촬영 플래너`, 기본 언어 `한국어`, 번들 ID `com.mjbest.nightskyshot`.
2. **앱 정보 & 가격**: 카테고리 `사진 및 비디오`, 가격 `무료`, 개인정보 처리방침 URL 입력.
3. **앱 개인정보(App Privacy)**: `STORE_LISTING.md` 3번 항목대로 `Location(기능 목적, 사용자와 연결 안 됨, 추적 안 함)` 설정.
4. **버전 정보 & 스크린샷**:
   - **iPhone 6.7" 디스플레이**: `store-assets/app-store/screenshots/*.png` (1290×2796, 6장) 업로드
   - **iPad 13" 디스플레이**: `store-assets/app-store/ipad-screenshots/*.png` (2048×2732, 6장) 업로드
   - `STORE_LISTING.md`의 설명·키워드·심사 메모(App Review Notes) 입력
5. **빌드 선택 후 심사 제출**: TestFlight 내부 테스트(iPhone/iPad 실기기) 확인 후 **심사에 추가(Add for Review)**.

---

## 3. GitHub Actions 자동 빌드 · 서명 · 릴리스 (`.github/workflows/mobile-build.yml`)

저장소의 **Actions → Mobile Native Build Check** 워크플로를 수동(`workflow_dispatch`) 또는 태그 푸시(`git tag v1.0.0 && git push --tags`)로 실행하면 Android APK/AAB 및 iOS 빌드를 자동 검증합니다. `v*` 태그로 실행하면 빌드된 `.aab`, `.apk`, `.ipa` 파일이 첨부된 **초안(Draft) GitHub Release**가 자동으로 생성됩니다.

### GitHub Secrets 등록 방법 (`gh` CLI 또는 GitHub Settings → Secrets and variables → Actions)

#### 1) Android 서명 시크릿
로컬에서 생성한 릴리스 keystore를 base64로 인코딩해 등록합니다 (`ANDROID_KEY_PASSWORD`를 생략하면 `ANDROID_KEYSTORE_PASSWORD`와 동일한 값으로 자동 처리됩니다):

```bash
# macOS / Linux 공통 (줄바꿈 없이 1줄 인코딩)
base64 < android/app/nightskyshot-release.keystore | tr -d '\r\n' | gh secret set ANDROID_KEYSTORE_BASE64
gh secret set ANDROID_KEYSTORE_PASSWORD
gh secret set ANDROID_KEY_ALIAS --body "nightskyshot"
gh secret set ANDROID_KEY_PASSWORD   # storePassword와 같으면 생략 가능
```

#### 2) iOS 서명 시크릿 (macOS 키체인에서 내보낸 `.p12` + `.mobileprovision`)
Apple Developer Portal에서 `com.mjbest.nightskyshot`용 **App Store Distribution** 프로비저닝 프로파일(`.mobileprovision`)과 배포 인증서(`.p12`)를 준비한 뒤 등록합니다 (`APPLE_TEAM_ID`를 생략하면 프로파일에서 자동 추출됩니다):

```bash
base64 < Certificates.p12 | tr -d '\r\n' | gh secret set APPLE_CERT_BASE64
gh secret set APPLE_CERT_PASSWORD
base64 < NightSkyShot_AppStore.mobileprovision | tr -d '\r\n' | gh secret set APPLE_PROVISIONING_PROFILE_BASE64
gh secret set APPLE_TEAM_ID --body "YOUR_10CHAR_TEAM_ID"
```

#### 3) App Store Connect(TestFlight) 자동 업로드 시크릿 (선택)
App Store Connect → **사용자 및 액세스 → 통합 → App Store Connect API**에서 `App Manager` 권한의 API 키(`.p8`)를 발급해 아래 3개 시크릿을 추가하면, `v*` 태그 푸시 또는 수동 실행(`upload_to_app_store=true`) 시 `xcrun altool`이 `.ipa`를 자동 검증·업로드합니다:

```bash
base64 < AuthKey_XXXXXXXXXX.p8 | tr -d '\r\n' | gh secret set ASC_API_KEY_BASE64
gh secret set ASC_KEY_ID --body "XXXXXXXXXX"
gh secret set ASC_ISSUER_ID --body "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

> 시크릿이 등록되지 않은 상태에서도 워크플로는 정상 동작하며, Android는 미서명(unsigned) AAB와 Debug APK를, iOS는 시뮬레이터 빌드 검증을 수행합니다.


