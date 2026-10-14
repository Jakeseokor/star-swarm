'use strict';
/*
 * Star Swarm — 게임 밸런스 설정
 * 난이도·속도·점수 등 조정 가능한 수치는 모두 이 파일 한 곳에 모아 두었습니다.
 */
window.SS = window.SS || {};

SS.CONFIG = {
  // 논리 해상도. 화면 전체를 쓰도록 실행 중 화면 비율에 맞춰 바뀜 (SS.setView)
  //  세로: 폭 480 고정, 높이 = 화면 비율대로 / 가로: 높이 640 고정, 폭 = 화면 비율대로
  WIDTH: 480,
  HEIGHT: 640,
  BASE_W: 480,                 // 대열·메뉴 배치 기준 폭
  BASE_H: 640,
  MAX_DT: 1 / 30,              // 프레임이 끊겨도 한 번에 진행할 최대 시간(초)
  STORAGE_KEY: 'starSwarm.save.v1',

  START_LIVES: 3,              // 시작 생명 (현재 기체 포함)
  EXTRA_LIFE_EVERY: 10000,     // 이 점수마다 생명 +1
  MAX_LIVES: 9,
  LOOP_SPEED_MULT: 1.3,        // 2회차 속도 배율 (3회차 = 1.3², ...)

  PLAYER: {
    homeFromBottom: 70,        // 기체 시작 위치 (화면 아래에서 px)
    minYFrac: 0.58,            // 전진 한계 (화면 높이 비율)
    maxFromBottom: 34,         // 후진 한계 (화면 아래에서 px)
    speed: 300,                // 키보드 좌우 이동 속도 (px/s)
    vSpeed: 240,               // 키보드 전진·후진 속도 (px/s)
    dragSensitivity: 1.15,     // 터치 드래그 감도 (손가락 이동량 대비)
    margin: 18,
    fireCooldown: 0.30,        // 기본 연사 간격(초)
    rapidCooldown: 0.12,       // 속사 파워업 연사 간격
    maxBullets: 2,             // 화면에 동시에 존재 가능한 아군 탄 수
    rapidMaxBullets: 5,
    bulletSpeed: 560,
    respawnDelay: 1.8,
    invulnTime: 2.2,           // 등장 직후 무적 시간
    hitRadius: 6,              // 피격 판정 반경 (작을수록 관대)
  },

  BOMB: {
    start: 3,                  // 시작 시 보유 폭탄
    minAfterDeath: 2,          // 기체를 잃으면 최소 이만큼은 다시 채워 줌
    max: 5,
    radius: 300,               // 충격파 최대 반경 (px)
    duration: 0.6,             // 충격파가 퍼지는 시간 (초)
    bossDamage: 5,             // 보스에게 주는 피해
    invuln: 1.0,               // 사용 직후 무적 시간
  },

  POWERUP: {
    dropChance: 0.07,          // 격추 시 드롭 확률
    divingDropBonus: 0.06,     // 급강하 중인 적 격추 시 추가 확률
    maxOnScreen: 2,
    fallSpeed: 85,
    doubleTime: 18,            // 2연발 지속시간(초)
    rapidTime: 14,             // 속사 지속시간(초)
    weights: { double: 4, shield: 3, rapid: 4, bomb: 2 },  // bomb = 폭탄 +1
  },

  SCORE: {
    grunt:     { formation: 50,  diving: 100 },
    striker:   { formation: 80,  diving: 160 },
    commander: { formation: 150, diving: 400 },
    boss: 5000,
    stageClearBase: 1000,      // 스테이지 클리어 보너스 = 이 값 × 스테이지 번호
    noMissBonus: 2000,         // 한 번도 죽지 않고 클리어 시
  },

  // 적 3종
  ENEMY: {
    grunt:     { hp: 1, radius: 13, speedMul: 1.0 },  // 일반형: 경량 델타익 전투기
    striker:   { hp: 1, radius: 13, speedMul: 1.45 }, // 돌격형: 고속 요격기
    commander: { hp: 2, radius: 17, speedMul: 0.95 }, // 지휘관형: 4발 중폭격기 (2회 피격)
  },
  TURN_RATE: 3.6,              // 곡선 비행 선회력 (rad/s, 속도 150 기준)

  FORMATION: {
    top: 96, colSpacing: 42, rowSpacing: 36,
    swayAmp: 26, swaySpeed: 0.9,   // 좌우 흔들림
    breathe: 0.06, breatheSpeed: 1.7, // 대열 수축·팽창
  },

  ENEMY_BULLET_SPEED: 190,
  MAX_ENEMY_BULLETS: 260,

  BOSS: {
    hp: 60,                    // 페이즈 전환(2/3, 1/3 지점)마다 파워업 캡슐 드롭
    y: 140,
    // 페이즈별 이동 속도 배율 [-, 1, 2, 3]
    moveSpeed: [0, 0.55, 0.75, 1.0],
  },

  /*
   * 스테이지(=난이도) 테이블
   *  region / biome  : 전장 지역과 배경 지형 (sea·desert·mountain·arctic·gulfnight)
   *  rows            : 위→아래 대열 [적 종류, 수]
   *  baseSpeed       : 진입·급강하 비행 속도 (px/s)
   *  entryGroupSize  : 한 줄로 같이 날아오는 무리 크기
   *  entryInterval   : 무리 사이 간격(초)
   *  entryPairs      : true면 좌우 대칭 두 무리가 동시에 진입
   *  diveInterval    : 급강하 간격(초, 랜덤 ±30%)
   *  divers          : [최소, 최대] 동시 급강하 기체 수
   *  fireMode        : straight(직선) / aimed(조준) / spread3(3방향) / barrage(탄막)
   *  diveShotChance  : 급강하 중 사격할 확률
   *  formationFireRate : 대열에서 초당 사격 횟수
   */
  STAGES: [
    {
      region: 'SOUTH CHINA SEA', regionKo: '남중국해', biome: 'sea',
      name: 'FIRST CONTACT', nameKo: '첫 조우 · 튜토리얼',
      rows: [['grunt', 8], ['grunt', 8]],
      baseSpeed: 130, entryGroupSize: 4, entryInterval: 2.2, entryPairs: false,
      diveInterval: 5.0, divers: [1, 1],
      fireMode: 'straight', diveShotChance: 0.15, formationFireRate: 0,
      tutorial: true, boss: false,
    },
    {
      region: 'MIDDLE EAST DESERT', regionKo: '중동 사막', biome: 'desert',
      name: 'STRIKE FORCE', nameKo: '돌격형 출현',
      rows: [['striker', 8], ['grunt', 8], ['grunt', 8]],
      baseSpeed: 160, entryGroupSize: 4, entryInterval: 1.9, entryPairs: false,
      diveInterval: 3.2, divers: [1, 1],
      fireMode: 'straight', diveShotChance: 0.5, formationFireRate: 0,
      tutorial: false, boss: false,
    },
    {
      region: 'HIMALAYA', regionKo: '히말라야 산맥', biome: 'mountain',
      name: 'COMMAND SHIP', nameKo: '지휘관형 등장 · 조준 사격',
      rows: [['commander', 4], ['striker', 8], ['grunt', 10], ['grunt', 10]],
      baseSpeed: 180, entryGroupSize: 4, entryInterval: 2.0, entryPairs: true,
      diveInterval: 2.3, divers: [1, 2],
      fireMode: 'aimed', diveShotChance: 0.8, formationFireRate: 0.15,
      tutorial: false, boss: false,
    },
    {
      region: 'ARCTIC OCEAN', regionKo: '북극해 빙원', biome: 'arctic',
      name: 'ALL-OUT ASSAULT', nameKo: '총공세 · 3방향 탄',
      rows: [['commander', 6], ['striker', 10], ['grunt', 10], ['grunt', 10]],
      baseSpeed: 205, entryGroupSize: 6, entryInterval: 2.0, entryPairs: true,
      diveInterval: 2.0, divers: [2, 3],
      fireMode: 'spread3', diveShotChance: 0.85, formationFireRate: 0.25,
      tutorial: false, boss: false,
    },
    {
      region: 'PERSIAN GULF', regionKo: '페르시아만 야간', biome: 'gulfnight',
      name: 'MOTHERSHIP', nameKo: '모선 결전 · 탄막',
      rows: [['commander', 8], ['striker', 8], ['striker', 8], ['grunt', 8], ['grunt', 8]],
      baseSpeed: 215, entryGroupSize: 4, entryInterval: 1.7, entryPairs: true,
      diveInterval: 1.5, divers: [2, 3],
      fireMode: 'barrage', diveShotChance: 1.0, formationFireRate: 0.35,
      tutorial: false, boss: true,
    },
  ],
};

// ---- 화면 크기 변경 알림 ----
SS.view = { listeners: [], safeTop: 0, safeBottom: 0, scale: 1 };
SS.onView = (fn) => SS.view.listeners.push(fn);
SS.setView = (w, h, safeTop, safeBottom, scale) => {
  SS.CONFIG.WIDTH = w;
  SS.CONFIG.HEIGHT = h;
  Object.assign(SS.view, { safeTop, safeBottom, scale });
  SS.view.listeners.forEach((f) => f());
};
