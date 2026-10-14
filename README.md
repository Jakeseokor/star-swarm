# Star Swarm ⭐

아이패드용 레트로 종스크롤 편대 슈팅 게임입니다. 1980년대 아케이드 편대 슈팅 장르에서 영감을 받았지만, 이름·캐릭터·그래픽·사운드는 모두 오리지널입니다.

- 순수 HTML5 Canvas + Vanilla JavaScript (외부 라이브러리 없음)
- 그래픽은 코드로 그린 픽셀아트 전투기(아군 쌍발 제공기 / 적 전투기·요격기·폭격기 / 보스 공중요새), 효과음·배경음악(타이틀/스테이지/보스 3곡, 전투가 격해지면 레이어가 추가되는 전투곡)은 Web Audio API로 실시간 합성
- PWA: 홈 화면에 추가하면 전체화면 앱처럼 실행되고 **오프라인에서도 동작**

## 조작법

| 동작 | 터치 | 블루투스 키보드 |
|---|---|---|
| 좌우 이동 | 화면을 좌우로 드래그 (손가락 이동만큼 기체가 따라옴) | ← → (또는 A / D) |
| 전진 / 후진 | 화면을 위아래로 드래그 (화면 아래쪽 1/3 범위) | ↑ ↓ (또는 W / S) |
| 폭탄 | 왼쪽 아래 **BOMB** 버튼 (가로 화면은 왼쪽 검은 여백 전체) | X (또는 B) |
| 발사 | 자동 연사 (기본) / 수동 모드면 오른쪽 아래 **FIRE** 버튼 누르고 있기 | Space (또는 Z) |
| 일시정지 | 오른쪽 위 ‖ 버튼 | P 또는 Esc |
| 메뉴 | 버튼 탭 | ↑ ↓ 선택, Enter 결정, Esc 뒤로 |

- 수동 발사 모드에서 아이패드를 **가로**로 두면 오른쪽 검은 여백 전체가 FIRE 버튼이 됩니다.
- 첫 터치(또는 키 입력) 후 소리가 켜집니다. (iOS 정책) 효과음(SOUND)과 배경음악(MUSIC)은 설정·일시정지 메뉴에서 따로 끌 수 있습니다.

## 게임 규칙

- 적은 화면 밖에서 곡선으로 날아와 상단 편대에 정렬하고, 일정 시간마다 일부가 대열을 이탈해 급강하합니다.
- 적 3종: **일반형**(초록) · **돌격형**(분홍, 빠름) · **지휘관형**(보라, 2회 피격 — 한 번 맞으면 파랗게 변함)
- 급강하 중인 적을 격추하면 점수 2배 이상. 생명 3개, **1만 점마다 생명 +1**
- 파워업 캡슐(랜덤 드롭): **D** 2연발 · **S** 쉴드(1회 방어) · **R** 속사 · **B** 폭탄 +1
- **폭탄**: 시작 3개(최대 5개). 쓰면 화면의 적 탄이 모두 사라지고, 기체 주변으로 충격파가 퍼져 닿은 적을 모두 격추합니다. 보스에게는 5 피해. 기체를 잃으면 최소 2개로 다시 채워집니다.
- 스테이지 클리어 보너스(1000 × 스테이지) + 노미스 보너스 2000
- 최고점수·해금 단계·설정은 기기에 자동 저장(localStorage)

| 단계 | 적 수 | 특징 |
|---|---|---|
| 1 | 16 | 느림, 사격 거의 없음, 튜토리얼 안내 |
| 2 | 24 | 돌격형 등장, 가끔 사격 |
| 3 | 32 | 지휘관형 등장, 조준 사격 |
| 4 | 36 | 3방향 탄, 2~3기 동시 급강하 |
| 5 | 40 + 보스 | 탄막, 보스전(체력바, 3페이즈 패턴: 부채꼴 → 나선 → 원형탄막+호위기 소환) |

5단계 클리어 시 엔딩 → **2회차(속도 1.3배)** 로 점수·생명을 이어서 도전할 수 있습니다.

## 파일 구조

```
star-swarm/
  index.html          진입점 (iOS 메타태그, safe-area)
  style.css           레터박스, 바운스/확대/선택 차단
  manifest.json       PWA 설정
  service-worker.js   오프라인 캐시
  js/
    config.js         ★ 난이도·속도·점수 등 모든 밸런스 수치 (여기만 고치면 됨)
    main.js           게임 루프(델타타임), 상태 전환, 충돌, 이펙트, 저장
    player.js         플레이어 기체
    enemy.js          적 3종 + 보스
    bullet.js         탄환·적 사격 패턴
    stage.js          편대·진입 경로·급강하 스케줄·보스 등장
    audio.js          효과음 합성
    input.js          터치·키보드 입력
    ui.js             픽셀 폰트, 화면/메뉴/HUD
  icons/              앱 아이콘 180/192/512 (tools/make-icons.js로 생성)
  tools/make-icons.js 아이콘 생성 스크립트 (node tools/make-icons.js)
```

## 내 컴퓨터에서 실행

```bash
cd star-swarm
npx serve .          # → http://localhost:3000
```

`index.html` 을 파일로 직접 열어도 플레이는 되지만, 서비스워커(오프라인)는 `http(s)://` 주소에서만 동작합니다.

> 주소 뒤에 `?debug` 를 붙이면 FPS가 표시됩니다.

---

## 1. 무료 배포

### 방법 A — GitHub Pages

1. 이 저장소를 GitHub에 push 합니다. (게임은 `star-swarm/` 폴더)
2. GitHub 저장소 → **Settings → Pages**
3. **Source: Deploy from a branch**, Branch: 배포할 브랜치(예: `main`), 폴더: `/ (root)` → **Save**
4. 1~2분 후 주소가 생깁니다:
   `https://<GitHub아이디>.github.io/<저장소이름>/star-swarm/`
   - 게임만 따로 올리고 싶다면 `star-swarm` 폴더 내용만 새 저장소에 넣으면 주소가 `https://<아이디>.github.io/<새저장소>/` 가 됩니다.
5. 모든 경로가 상대경로라서 하위 폴더 주소에서도 그대로 동작합니다.

### 방법 B — Netlify (가장 간단)

1. <https://app.netlify.com/drop> 접속 (무료 가입)
2. `star-swarm` **폴더를 통째로** 브라우저 창에 끌어다 놓기
3. 바로 `https://<임의이름>.netlify.app` 주소가 생깁니다. (Site settings에서 이름 변경 가능)
4. 이후 수정본도 같은 사이트의 **Deploys** 탭에 폴더를 다시 끌어다 놓으면 됩니다.

> ⚠️ 게임 파일을 수정해 다시 배포할 때는 `service-worker.js` 의 `CACHE = 'star-swarm-v1'` 숫자를 올려야(v2, v3…) 아이패드에 새 버전이 확실히 반영됩니다.

## 2. 아이패드에 설치 (홈 화면에 추가)

1. 아이패드 **Safari**로 위 배포 주소에 접속합니다. (Chrome 등 다른 브라우저는 iPadOS 버전에 따라 메뉴가 다를 수 있음)
2. 주소창 옆 **공유 버튼(□↑)** 을 누릅니다.
3. **"홈 화면에 추가"** 선택 → 이름 확인 → **추가**
4. 홈 화면의 Star Swarm 아이콘으로 실행하면 주소창 없이 전체화면으로 실행됩니다.
5. 한 번 실행한 뒤에는 **비행기 모드에서도** 플레이할 수 있습니다.

### 소리가 안 날 때
1. 게임 화면을 **한 번 터치**하세요. iOS는 터치 전에는 소리를 막습니다. (타이틀에 "화면을 한 번 터치하면 소리가 켜집니다"가 깜빡이면 아직 꺼진 상태)
2. 아이패드 **음량 버튼**으로 볼륨을 올리세요.
3. 설정(SETTINGS)에서 **SOUND / MUSIC 이 ON** 인지 확인하세요.
4. 그래도 안 나면 홈 화면 앱을 위로 밀어 완전히 종료한 뒤 다시 실행하세요.

> 무음 모드(제어 센터 종 아이콘)에서도 소리가 나도록 처리해 두었습니다 (iPadOS 17 이상은 `navigator.audioSession`, 이전 버전은 무음 오디오 재생 방식).

## 3. (선택) Capacitor로 iOS 앱 만들기

PWA로 충분하지만, 진짜 앱(.ipa)으로 설치하고 싶을 때의 절차입니다.

### 필요 조건
- **Mac** + **Xcode** 최신 버전 (App Store에서 설치, 처음 실행 시 추가 구성요소 설치)
- **Node.js 18 이상**
- **Apple ID** (무료 계정 가능. 단 무료 계정으로 설치한 앱은 **7일 후 만료**되어 다시 설치해야 함. 영구 설치·App Store 배포는 Apple Developer Program 연 $99)
- 아이패드 + USB 케이블, iPadOS 16 이상은 **설정 → 개인정보 보호 및 보안 → 개발자 모드** 켜기 (Xcode로 한 번 연결해야 메뉴가 보임)
- (선택) CocoaPods가 필요하다는 메시지가 나오면 `brew install cocoapods`

### 절차

```bash
# 1) 앱 프로젝트 폴더 만들기 (star-swarm 폴더 옆에)
mkdir star-swarm-app && cd star-swarm-app
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/ios

# 2) 게임 파일을 www 폴더로 복사
mkdir www
cp -R ../star-swarm/index.html ../star-swarm/style.css ../star-swarm/manifest.json \
      ../star-swarm/js ../star-swarm/icons www/

# 3) Capacitor 초기화 (앱 이름, 번들 ID는 원하는 대로 — 전 세계에서 고유해야 함)
npx cap init "Star Swarm" com.yourname.starswarm --web-dir=www

# 4) iOS 플랫폼 추가 및 파일 동기화
npx cap add ios
npx cap sync ios

# 5) Xcode 열기
npx cap open ios
```

### Xcode에서 서명 후 설치
1. 왼쪽에서 **App** 프로젝트 → **TARGETS: App** → **Signing & Capabilities** 탭
2. **Automatically manage signing** 체크 → **Team**: Apple ID 선택 (없으면 Xcode → Settings → Accounts 에서 추가)
3. 오류가 나면 **Bundle Identifier** 를 고유한 값으로 변경
4. (권장) **General → Deployment Info** 에서 iPad 체크, 방향은 Portrait/Landscape 모두 허용
5. 아이패드를 USB로 연결 → 상단 실행 대상에서 아이패드 선택 → **▶ (Run)**
6. 처음엔 아이패드에서 **설정 → 일반 → VPN 및 기기 관리** → 개발자 앱 **신뢰** 후 실행

게임을 수정했다면 `www` 폴더에 다시 복사하고 `npx cap sync ios` 후 Xcode에서 다시 Run 하면 됩니다.
(앱 안에서는 서비스워커가 필요 없으므로 자동으로 건너뜁니다.)

---

## 난이도 조정

폭탄 수·위력은 `BOMB`, 전진·후진 범위는 `PLAYER.minY / maxY` 에서 바꿀 수 있습니다.
`js/config.js` 의 `STAGES` 배열에서 단계별 적 구성(`rows`), 비행 속도(`baseSpeed`), 급강하 간격(`diveInterval`), 동시 급강하 수(`divers`), 사격 방식(`fireMode`), 사격 확률 등을 바꿀 수 있습니다. 보스 체력은 `BOSS.hp`, 2회차 배율은 `LOOP_SPEED_MULT` 입니다.

## 개발 중 검증 내역

각 단계마다 `npx serve` 로 띄우고 Playwright(헤드리스 Chromium, 아이패드 해상도 820×1180 / 가로 1180×820)로 확인했습니다.

- 드래그·키보드 이동, 자동/수동 발사, 레터박스 영역 발사
- 1~5단계 + 2회차 전체 자동 플레이 완주(무적 봇), 화면 밖으로 사라지는 적 없음, 보스 3페이즈·호위기 소환
- 일시정지/재개, 설정 저장, 게임오버·최고점수 저장, 1만 점 생명 추가
- 오프라인 상태에서 새로고침 후 정상 실행 (서비스워커 캐시)
- 콘솔 오류 0건
- 보스 체력은 테스트 결과(체력 140일 때 약 200초 소요)를 보고 60으로 조정

실제 아이패드 Safari에서의 터치감·사운드는 기기에서 직접 확인이 필요합니다.
