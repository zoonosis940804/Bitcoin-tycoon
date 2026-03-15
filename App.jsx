import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BTC_RET_REAL } from "./btcReturns";

const KRW_RATE = 1473;
const MONTHLY_SALARY = 3_000_000;
const BUILD_ID = "roomlist-v2-20260315-01";
const ENV_WS_URL = typeof import.meta !== "undefined" ? import.meta?.env?.VITE_RT_WS_URL : "";
const DEFAULT_WS_URL =
  ENV_WS_URL ||
  (
    typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1")
      ? "ws://127.0.0.1:8787"
      : "wss://bitcoin-tycoon.onrender.com"
  );
const MO = ["1월", "2월", "3월", "4월", "5월", "6월", "7월", "8월", "9월", "10월", "11월", "12월"];
const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const comma = (n) => Math.round(n || 0).toLocaleString("ko-KR");
const fmtIntInput = (v) => {
  const raw = String(v ?? "").replace(/[^0-9]/g, "");
  return raw ? comma(parseInt(raw, 10)) : "";
};
const fw = (v) => {
  const a = Math.abs(v || 0);
  const s = (v || 0) < 0 ? "-" : "";
  if (a >= 1e12) return `${s}₩${(a / 1e12).toFixed(2)}조`;
  if (a >= 1e8) {
    const eok = Math.floor(a / 1e8);
    const man = Math.floor((a % 1e8) / 1e4);
    return `${s}₩${comma(eok)}억${man > 0 ? ` ${comma(man)}만` : ""}`;
  }
  if (a >= 1e4) return `${s}₩${comma(Math.floor(a / 1e4))}만`;
  return `${s}₩${comma(a)}`;
};
const fusd = (v) => `$${comma(v)}`;
const fp = (n) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
const fdate = (y, m, d) => `${y}년 ${MO[m - 1]} ${d}일`;
const CHART_SKINS = {
  binance: {
    name: "바이낸스",
    bg: "#0b1220",
    grid: "#223046",
    text: "#8ea0b7",
    up: "#0ecb81",
    down: "#f6465d",
    frame: "#334155",
    watermark: "BINANCE",
  },
  upbit: {
    name: "업비트",
    bg: "#061529",
    grid: "#1b3658",
    text: "#96acc6",
    up: "#26a69a",
    down: "#ef5350",
    frame: "#2a4568",
    watermark: "UPBIT",
  },
};

let _audioCtx = null;
function beep(freq = 880, vol = 0.04, dur = 0.09, type = "sine") {
  try {
    if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = _audioCtx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.01);
  } catch (_e) {}
}

const TAG_BASE = [
  { id: "spot_bronze", name: "현물 입문자", icon: "📈", tier: "common", desc: "현물 거래를 시작한 투자자", req: { key: "spotTrades", min: 10 }, cond: "현물 체결 10회" },
  { id: "spot_master", name: "현물 마스터", icon: "🧭", tier: "rare", desc: "현물 체결 숙련자", req: { key: "spotTrades", min: 80 }, cond: "현물 체결 80회" },
  { id: "futures_ace", name: "선물 에이스", icon: "🎯", tier: "rare", desc: "선물 한 방의 예술", req: { key: "bestFutRoi", min: 30 }, cond: "선물 단일 청산 수익률 30%+" },
  { id: "risk_manager", name: "리스크 매니저", icon: "🛡️", tier: "rare", desc: "손절 규칙 준수", req: { key: "stopLossHits", min: 8 }, cond: "스톱로스 발동 8회" },
  { id: "diamond", name: "다이아핸드", icon: "💎", tier: "rare", desc: "장기 보유의 상징", req: { key: "btcHoldMonths", min: 18 }, cond: "BTC 보유 개월수 18개월" },
  { id: "landlord", name: "랜드로드", icon: "🏛️", tier: "rare", desc: "부동산 다각화", req: { key: "aptCount", min: 6 }, cond: "부동산 6채 이상" },
  { id: "dividend_harvest", name: "현금흐름 수확자", icon: "💰", tier: "rare", desc: "이자/배당 최적화", req: { key: "interestIncome", min: 50000000 }, cond: "누적 이자/배당 5천만" },
  { id: "macro", name: "매크로 헌터", icon: "🌍", tier: "epic", desc: "거시 폭풍 대응", req: { key: "eventCount", min: 12 }, cond: "이벤트 생존 12회" },
  { id: "phoenix", name: "피닉스", icon: "🔥", tier: "epic", desc: "대낙폭 이후 회복", req: { key: "recoveredFromDrawdown", min: 1 }, cond: "최대낙폭 35% 이후 원금 회복" },
  { id: "banker", name: "뱅커", icon: "🏦", tier: "rare", desc: "레버리지 운용 달인", req: { key: "repaidPrincipal", min: 300000000 }, cond: "누적 상환액 3억" },
  { id: "vol_survivor", name: "변동성 생존자", icon: "🌪️", tier: "epic", desc: "고변동장 생존", req: { key: "rareEventSurvived", min: 2 }, cond: "레어 이벤트 2회 생존" },
  { id: "whale", name: "고래 감별사", icon: "🐋", tier: "epic", desc: "큰 파도 위 항해자", req: { key: "totalMultiple", min: 8 }, cond: "총자산 8배" },
  { id: "atlas", name: "아틀라스", icon: "🗿", tier: "legendary", desc: "시장 붕괴를 견딤", req: { key: "atlas", min: 1 }, cond: "대공황 생존 + 원금 회복" },
  { id: "nuclear_winter", name: "핵겨울 생존자", icon: "☢️", tier: "legendary", desc: "핵전쟁 충격 생존", req: { key: "nuclear", min: 1 }, cond: "핵전쟁 이벤트 생존" },
  { id: "satoshi_heir", name: "사토시 후계자", icon: "👑", tier: "legendary", desc: "궁극의 비트코인 신봉자", req: { key: "satoshi", min: 1 }, cond: "BTC 비중 70%+ 상태로 총자산 10배" },
  { id: "void_trader", name: "보이드 트레이더", icon: "🪐", tier: "legendary", desc: "극단적 침체 완주", req: { key: "void", min: 1 }, cond: "24개월 이상 침체 레짐 완주" },
];

const TAG_EXTRA_THEMES = [
  ["현물 기록자", "📊", "spotTrades", 15, 2],
  ["선물 기술자", "⚙️", "futClosed", 8, 1],
  ["손절 규율가", "🧯", "stopLossHits", 3, 1],
  ["이자 장인", "💳", "interestIncome", 10000000, 10000000],
  ["상환 개척자", "🧱", "repaidPrincipal", 50000000, 50000000],
  ["이벤트 관측자", "🛰️", "eventCount", 4, 1],
  ["포트폴리오 확장가", "🧺", "maxStockKinds", 3, 1],
  ["부동산 탐험가", "🏠", "aptCount", 2, 1],
];

function makeTagCatalog() {
  const out = [...TAG_BASE];
  const TAG_PREFIX = ["번개", "심연", "백야", "청명", "황혼", "새벽", "폭풍", "유성", "오로라", "비상", "강철", "정밀", "은밀", "수호", "개척", "항해", "전설", "심판", "태양", "월광"];
  const TAG_SUFFIX = ["추적자", "설계자", "개척자", "수호자", "주도자", "관측자", "집행자", "항해사", "연구자", "장인", "지휘관", "조율자", "파수꾼", "선구자", "분석가", "전략가", "창조자", "집중가", "교섭가", "헌터"];
  let idx = 1;
  while (out.length < 100) {
    const [nm, ic, key, base, step] = TAG_EXTRA_THEMES[(idx - 1) % TAG_EXTRA_THEMES.length];
    const lv = Math.floor((idx - 1) / TAG_EXTRA_THEMES.length) + 1;
    const min = base + step * lv;
    const tier = lv >= 9 ? "legendary" : lv >= 6 ? "epic" : lv >= 3 ? "rare" : "common";
    const p = TAG_PREFIX[(idx * 7) % TAG_PREFIX.length];
    const s = TAG_SUFFIX[(idx * 11) % TAG_SUFFIX.length];
    out.push({
      id: `tag_${idx}`,
      name: `${p} ${s}`,
      icon: ic,
      tier,
      desc: `${nm} 등급 ${lv}`,
      req: { key, min },
      cond: `${nm} 조건 달성 (${comma(min)})`,
    });
    idx++;
  }
  return out.slice(0, 100);
}
const TAG_DEFS = makeTagCatalog();

const TAG_TIER_STYLE = {
  common: { color: "#94a3b8", glow: "none", label: "노말" },
  rare: { color: "#22c55e", glow: "0 0 10px #22c55e55", label: "레어" },
  epic: { color: "#8b5cf6", glow: "0 0 14px #8b5cf699", label: "에픽" },
  legendary: { color: "#c084fc", glow: "0 0 18px #c084fcbb", label: "레전더리" },
};
const pickTagColor = (tag) => {
  const t = TAG_DEFS.find((x) => x.name === tag || x.id === tag);
  if (!t) return "#94a3b8";
  return TAG_TIER_STYLE[t.tier]?.color || "#94a3b8";
};

const COLLECT_BASE = [
  { id: "pizza_nft", name: "피자 데이 토큰", icon: "🍕", rarity: "레어", req: { key: "spotTrades", min: 25 }, cond: "현물 체결 25회", desc: "BTC 역사 상징" },
  { id: "satoshi_letter", name: "사토시의 편지", icon: "📜", rarity: "전설", req: { key: "totalMultiple", min: 3 }, cond: "총자산 3배", desc: "희귀 문서" },
  { id: "lambo_key", name: "람보 키", icon: "🔐", rarity: "전설", req: { key: "totalMultiple", min: 5 }, cond: "총자산 5배", desc: "밈의 완성" },
  { id: "moon_ticket", name: "문 티켓", icon: "🎫", rarity: "레어", req: { key: "btcHoldMonths", min: 6 }, cond: "BTC 보유 6개월", desc: "상승장 기념" },
  { id: "bear_skull", name: "베어 스컬", icon: "💀", rarity: "레어", req: { key: "maxDrawdown", min: 30 }, cond: "최대낙폭 30%", desc: "하락장 생존 증표" },
  { id: "hal_coin", name: "할 피니 코인", icon: "🪙", rarity: "전설", req: { key: "eventCount", min: 10 }, cond: "이벤트 10회 생존", desc: "초기 커뮤니티 기념" },
  { id: "black_swan_feather", name: "블랙스완 깃털", icon: "🪶", rarity: "전설", req: { key: "rareEventSurvived", min: 1 }, cond: "레어 이벤트 생존", desc: "극희귀" },
  { id: "nebula_core", name: "네뷸라 코어", icon: "🌌", rarity: "전설", req: { key: "legendaryTags", min: 2 }, cond: "레전더리 태그 2개", desc: "빛나는 코어" },
];

const COLLECT_EXTRA_THEME = [
  ["시장 관측 조각", "🧩", "eventCount", 3, 1, "일반"],
  ["현물 기록 파편", "📎", "spotTrades", 20, 5, "일반"],
  ["선물 기록 파편", "🛰️", "futClosed", 5, 2, "레어"],
  ["거시 충격 유물", "🌋", "rareEventSurvived", 1, 1, "전설"],
  ["이자 보관함", "🧰", "interestIncome", 20000000, 10000000, "레어"],
  ["상환 증서", "🧾", "repaidPrincipal", 100000000, 50000000, "레어"],
  ["주식 도감 카드", "🗂️", "maxStockKinds", 4, 1, "일반"],
  ["비트코인 성배", "🏆", "btcHoldMonths", 8, 2, "전설"],
];

function makeCollectibleCatalog() {
  const out = [...COLLECT_BASE];
  const COL_PREFIX = ["흑요", "황금", "백은", "청동", "유성", "오로라", "심해", "비화", "천공", "창연", "고대", "태초", "빙하", "적월", "청월", "자개", "비취", "향로", "은하", "태양"];
  const COL_SUFFIX = ["문장", "파편", "성배", "잔영", "비석", "토템", "결정", "성흔", "유물", "염주", "상자", "열쇠", "휘장", "훈장", "조각", "두루마리", "등불", "반지", "코어", "깃털"];
  let idx = 1;
  while (out.length < 100) {
    const [nm, ic, key, base, step, rarity] = COLLECT_EXTRA_THEME[(idx - 1) % COLLECT_EXTRA_THEME.length];
    const lv = Math.floor((idx - 1) / COLLECT_EXTRA_THEME.length) + 1;
    const min = base + step * lv;
    const p = COL_PREFIX[(idx * 5) % COL_PREFIX.length];
    const s = COL_SUFFIX[(idx * 13) % COL_SUFFIX.length];
    out.push({
      id: `col_${idx}`,
      name: `${p} ${s}`,
      icon: ic,
      rarity,
      req: { key, min },
      cond: `${nm} 조건 달성 (${comma(min)})`,
      desc: `${rarity} 등급 수집품`,
    });
    idx++;
  }
  return out.slice(0, 100);
}
const COLLECTIBLES = makeCollectibleCatalog();
const RIVALS = [
  { id: "wonyotti", name: "워뇨띠", icon: "⚡", style: "lev" },
  { id: "diamond", name: "존버황제", icon: "💎", style: "hodl" },
  { id: "aptking", name: "부동산불패", icon: "🏛️", style: "apt" },
  { id: "quant", name: "SKY 퀀트", icon: "🤖", style: "quant" },
  { id: "dividend", name: "배당킹", icon: "👴", style: "div" },
  { id: "nasdaq", name: "나스닥 추종자", icon: "📡", style: "tech" },
  { id: "yolo", name: "영끌러", icon: "💳", style: "yolo" },
  { id: "savings", name: "적금러", icon: "🏧", style: "safe" },
  { id: "scalpfox", name: "스캘핑폭스", icon: "🦊", style: "lev" },
  { id: "allweather", name: "올웨더", icon: "🌤️", style: "div" },
  { id: "realestatekim", name: "갭투김", icon: "🏗️", style: "apt" },
  { id: "aiwhale", name: "AI고래", icon: "🐋", style: "quant" },
];

const RIVAL_PROFILES = {
  wonyotti: { tags: ["선물고수", "초고위험", "모멘텀"], quote: "손절은 약자의 변명", quirk: "새벽 3시에 숏 치고 그대로 잠듦" },
  diamond: { tags: ["존버장인", "심리강철", "분산투자"], quote: "한 번 산 건 역사다", quirk: "지갑 비번을 일부러 안 외움" },
  aptking: { tags: ["부동산파", "담보대출", "현금흐름"], quote: "벽돌은 배신하지 않는다", quirk: "시세표 캡처가 하루 30장" },
  quant: { tags: ["알고리즘", "백테스트", "분산투자"], quote: "감정은 에지의 적", quirk: "서버 터지면 손이 떨림" },
  dividend: { tags: ["배당러", "현금흐름", "안전자산"], quote: "배당은 멘탈 쿠션", quirk: "배당일을 생일보다 잘 기억함" },
  nasdaq: { tags: ["기술주러", "모멘텀", "알고리즘"], quote: "성장은 결국 이긴다", quirk: "아침 루틴이 나스닥 선물 확인" },
  yolo: { tags: ["영끌", "고변동", "초고위험"], quote: "기회는 풀베팅에서", quirk: "금리 0.25% 올라가면 밤샘" },
  savings: { tags: ["안전자산", "현금중심", "현금흐름"], quote: "천천히 오래 가자", quirk: "은행 앱만 6개 설치" },
  scalpfox: { tags: ["스캘핑", "선물고수", "모멘텀"], quote: "짧고 굵게 수익낸다", quirk: "5분봉 알림만 40개" },
  allweather: { tags: ["분산투자", "배당러", "안전자산"], quote: "시장보다 오래 살아남자", quirk: "리밸런싱 시트 22탭" },
  realestatekim: { tags: ["부동산파", "담보대출", "영끌"], quote: "레버리지도 전략이다", quirk: "분양공고 알림 풀세팅" },
  aiwhale: { tags: ["알고리즘", "고변동", "선물고수"], quote: "모델이 시키는 대로 간다", quirk: "GPU 소음이 백색소음" },
};

const BANK_MEETING_MONTHS = [1, 2, 4, 5, 7, 8, 10, 11];

// 2016~2025 대략적 연말 앵커 (실데이터 흐름 반영)
const HIST_YR = {
  btc: [
    [2016, 960], [2017, 13860], [2018, 3740], [2019, 7200], [2020, 28900],
    [2021, 46300], [2022, 16500], [2023, 42200], [2024, 93500], [2025, 70000],
  ],
  usEq: [
    [2016, 2240], [2017, 2673], [2018, 2506], [2019, 3231], [2020, 3756],
    [2021, 4766], [2022, 3839], [2023, 4769], [2024, 5870], [2025, 6100],
  ],
  krRe: [
    [2016, 100], [2017, 106], [2018, 112], [2019, 117], [2020, 126],
    [2021, 138], [2022, 132], [2023, 129], [2024, 133], [2025, 136],
  ],
};

function yrInterp(series, y, m = 12) {
  const t = y + (m - 1) / 12;
  const arr = series.map(([yy, v]) => ({ t: yy, v }));
  const b = [...arr].reverse().find((x) => x.t <= t) || arr[0];
  const a = arr.find((x) => x.t > t) || arr[arr.length - 1];
  const span = (a.t - b.t) || 1;
  const r = clamp((t - b.t) / span, 0, 1);
  return b.v + (a.v - b.v) * r;
}

function cagr(series) {
  const start = series[0][1];
  const end = series[series.length - 1][1];
  const n = Math.max(1, series.length - 1);
  return Math.pow(end / start, 1 / n) - 1;
}

function projectedDrift(kind, y, m) {
  const base = cagr(HIST_YR[kind]);
  const cyc = Math.sin(y * 0.73 + m * 0.39) * (kind === "krRe" ? 0.006 : 0.014);
  const reg = Math.sin(y * 0.31 + m * 0.22) * (kind === "btc" ? 0.03 : 0.01);
  return base / 12 + cyc + reg;
}
function h32(...parts) {
  let h = 2166136261 >>> 0;
  parts.forEach((p) => {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  });
  return h >>> 0;
}
function randSigned(seed, ...parts) {
  const v = h32(seed, ...parts) / 0xffffffff;
  return v * 2 - 1;
}
function rand01(seed, ...parts) {
  return h32(seed, ...parts) / 0xffffffff;
}
function gaussian(seed, ...parts) {
  // Deterministic Box-Muller
  const u1 = Math.max(1e-12, rand01(seed, ...parts, "u1"));
  const u2 = rand01(seed, ...parts, "u2");
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
function studentLike(seed, ...parts) {
  // Heavy-tail approximation: z / sqrt(chi2/df), df≈5
  const z = gaussian(seed, ...parts, "z");
  const v1 = gaussian(seed, ...parts, "v1");
  const v2 = gaussian(seed, ...parts, "v2");
  const v3 = gaussian(seed, ...parts, "v3");
  const v4 = gaussian(seed, ...parts, "v4");
  const v5 = gaussian(seed, ...parts, "v5");
  const chi = Math.max(1e-9, v1 * v1 + v2 * v2 + v3 * v3 + v4 * v4 + v5 * v5);
  return z / Math.sqrt(chi / 5);
}
const BTC_RET_MEAN_ABS = BTC_RET_REAL.reduce((s, r) => s + Math.abs(r), 0) / Math.max(1, BTC_RET_REAL.length);
const BTC_RET_BUCKETS = (() => {
  const out = { bull: [], bear: [], chop: [], all: [] };
  const look = 12;
  for (let i = 0; i < BTC_RET_REAL.length - look - 1; i++) {
    out.all.push(i);
    const w = BTC_RET_REAL.slice(i, i + look);
    const m = w.reduce((s, x) => s + x, 0) / look;
    const a = w.reduce((s, x) => s + Math.abs(x), 0) / look;
    if (m > 0.004) out.bull.push(i);
    if (m < -0.004) out.bear.push(i);
    if (Math.abs(m) < 0.0016 && a < 0.022) out.chop.push(i);
  }
  if (out.bull.length === 0) out.bull = [...out.all];
  if (out.bear.length === 0) out.bear = [...out.all];
  if (out.chop.length === 0) out.chop = [...out.all];
  return out;
})();
function makeScenario(seed) {
  return {
    btcBias: randSigned(seed, "bb") * 0.0009,
    eqBias: randSigned(seed, "eb") * 0.00045,
    reBias: randSigned(seed, "rb") * 0.0002,
    vol: 0.65 + Math.abs(randSigned(seed, "vol")) * 0.9,
  };
}
function marketSignal(seed, y, m, d, scenario) {
  const t = (y - 2026) * 372 + (m - 1) * 31 + d;
  const cycA = Math.sin((seed % 997) * 0.013 + t * 0.017);
  const cycB = Math.sin((seed % 577) * 0.031 + t * 0.007);
  const regime = Math.sin((seed % 887) * 0.009 + t * 0.0018);
  const regimeAdj = regime < -0.55 ? -2 : regime < -0.2 ? -1 : regime > 0.55 ? 1 : 0;
  const n = randSigned(seed, y, m, d);
  const vol = scenario?.vol || 1;
  return {
    btc: (scenario?.btcBias || 0) + (cycA * 0.007 + cycB * 0.005 + n * 0.005) * vol + regimeAdj * -0.0065,
    eq: (scenario?.eqBias || 0) + (cycA * 0.0032 + n * 0.0024) * vol + regimeAdj * -0.0031,
    re: (scenario?.reBias || 0) + (cycB * 0.0014 + n * 0.0011) * vol + regimeAdj * -0.0018,
  };
}
function regimeProbabilities({ phaseName, fedRate, riskOn, btcVol, eventRiskPct }) {
  const base = {
    bull: 0.27,
    chop: 0.33,
    bear: 0.24,
    deepBear: 0.1,
    squeeze: 0.06,
  };
  if (phaseName === "대폭락장") {
    base.deepBear += 0.22;
    base.bear += 0.12;
    base.bull -= 0.18;
    base.squeeze -= 0.05;
  } else if (phaseName === "약세장") {
    base.bear += 0.16;
    base.deepBear += 0.08;
    base.bull -= 0.12;
    base.squeeze -= 0.03;
  } else if (phaseName === "횡보장") {
    base.chop += 0.2;
    base.bull -= 0.08;
    base.bear -= 0.07;
  }
  if (fedRate >= 5.25) {
    base.bear += 0.11;
    base.deepBear += 0.08;
    base.bull -= 0.11;
  } else if (fedRate <= 3) {
    base.bull += 0.12;
    base.squeeze += 0.05;
    base.bear -= 0.08;
  }
  if (riskOn >= 0.18) {
    base.bull += 0.12;
    base.squeeze += 0.06;
    base.bear -= 0.09;
  } else if (riskOn <= -0.18) {
    base.bear += 0.11;
    base.deepBear += 0.05;
    base.bull -= 0.08;
  }
  if (btcVol >= 0.065) {
    base.deepBear += 0.05;
    base.squeeze += 0.05;
    base.chop -= 0.05;
  }
  if (eventRiskPct >= 0.45) {
    base.deepBear += 0.04;
    base.bear += 0.02;
    base.bull -= 0.03;
  }
  const keys = ["bull", "chop", "bear", "deepBear", "squeeze"];
  const clamped = {};
  let sum = 0;
  keys.forEach((k) => {
    clamped[k] = Math.max(0.01, base[k]);
    sum += clamped[k];
  });
  return {
    bull: (clamped.bull / sum) * 100,
    chop: (clamped.chop / sum) * 100,
    bear: (clamped.bear / sum) * 100,
    deepBear: (clamped.deepBear / sum) * 100,
    squeeze: (clamped.squeeze / sum) * 100,
  };
}

function buildNewsBriefing(game, macroRows, probs) {
  const latest = [...(game.newsLog || [])].reverse().slice(0, 4);
  const headlines = latest.map((e) => e.title || e.e).filter(Boolean);
  const topMacro = [...macroRows]
    .sort((a, b) => {
      const score = (r) => {
        if (r.k.includes("레짐")) return 4;
        if (r.k.includes("연준")) return 3;
        if (r.k.includes("USD")) return 2;
        return 1;
      };
      return score(b) - score(a);
    })
    .slice(0, 2)
    .map((m) => `${m.k}: ${m.v} (${m.d})`);
  const dominant = [
    { k: "상승", v: probs.bull },
    { k: "횡보", v: probs.chop },
    { k: "하락", v: probs.bear },
    { k: "급락", v: probs.deepBear },
    { k: "쇼트스퀴즈", v: probs.squeeze },
  ].sort((a, b) => b.v - a.v)[0];
  return {
    title: `${game.year}.${String(game.month).padStart(2, "0")} 시장 브리핑`,
    summary: dominant ? `현재 우세 시나리오: ${dominant.k} (${dominant.v.toFixed(1)}%)` : "시장 시나리오 계산 중",
    headlines,
    macros: topMacro,
  };
}
function seededShuffle(arr, seed, tag) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(((h32(seed, tag, i) / 0xffffffff) * (i + 1)));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const _btcCache = {};
const _exCache = {};
function getExRate(y, m, d = 1) {
  const key = `${y}_${m}_${d}`;
  if (_exCache[key]) return _exCache[key];
  const t = (y - 2026) * 12 + (m - 1) + d / (DIM[m - 1] || 30);
  const cyc = Math.sin(t * 0.41) * 28 + Math.sin(t * 0.13) * 17;
  const noise = Math.sin((y * 17 + m * 7 + d) * 0.27) * 9;
  return (_exCache[key] = clamp(Math.round(KRW_RATE + cyc + noise), 1280, 1690));
}
function getBtcUsd(y, m, d = 1) {
  const key = `${y}_${m}_${d}`;
  if (_btcCache[key]) return _btcCache[key];
  if (y <= 2025) return (_btcCache[key] = yrInterp(HIST_YR.btc, y, m));
  const t = (y - 2026) * 12 + (m - 1) + d / DIM[m - 1];
  const base = HIST_YR.btc[HIST_YR.btc.length - 1][1] * Math.pow(1 + cagr(HIST_YR.btc), t / 12);
  const drift = projectedDrift("btc", y, m);
  const c1 = Math.sin(y * 2.17 + m * 0.89 + d * 0.31) * 0.028;
  const c2 = Math.sin(y * 5.31 + m * 2.17 + d * 0.73) * 0.016;
  const v = base * (1 + drift + c1 + c2);
  return (_btcCache[key] = Math.max(12000, v));
}

function getBaseRate(y, m) {
  let rate = 2.5; // 2026 시작 기준금리
  for (let yy = 2026; yy <= y; yy++) {
    for (let mm = 1; mm <= 12; mm++) {
      if (yy === y && mm > m) break;
      if (!BANK_MEETING_MONTHS.includes(mm)) continue;
      // 물가/성장 시그널 기반으로 0.25% 단위 결정
      const infl = Math.sin(yy * 0.73 + mm * 0.61);
      const growth = Math.sin(yy * 0.31 + mm * 0.47);
      const signal = infl * 0.7 + growth * 0.3;
      let step = 0;
      if (signal > 0.38) step = 0.25;
      else if (signal < -0.38) step = -0.25;
      rate = clamp(rate + step, 1.5, 6.5);
    }
  }
  return rate;
}
function getFedRate(y, m) {
  // 연준금리: 한국 기준금리 대비 약간 높은 범위에서 0.25 단위 변동
  const kor = getBaseRate(y, m);
  const bias = Math.sin(y * 0.57 + m * 0.43) * 0.5 + 1.0;
  const raw = clamp(kor + bias, 2.0, 7.5);
  return Math.round(raw * 4) / 4;
}
function getLoanRate(y, m) {
  return clamp(getBaseRate(y, m) + 1.25, 2.5, 8.5);
}
function getDepositRate(y, m) {
  return clamp(getBaseRate(y, m) - 0.75, 1.0, 5.0);
}
function monthlyInterest(principal, annualRate) {
  return (principal * annualRate) / 100 / 12;
}

function simRivalWealth(rival, startCash, y, m, btcUsd, gameSeed = 1) {
  const months = Math.max(0, (y - 2026) * 12 + (m - 3));
  const btcRet = btcUsd / 70000 - 1;
  const seed = rival.id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0);
  const noise = months === 0 ? 0 : Math.sin(months * 0.37 + seed * 0.13) * 0.04;
  const sc = makeScenario(gameSeed);
  const mk = marketSignal(gameSeed, y, m, 1, sc);
  const t = {
    lev: { drift: 0.004, beta: 1.8, risk: 1.4 },
    hodl: { drift: 0.002, beta: 1.0, risk: 0.6 },
    apt: { drift: 0.0035, beta: 0.25, risk: 0.4 },
    quant: { drift: 0.0042, beta: 0.85, risk: 0.9 },
    div: { drift: 0.0032, beta: 0.35, risk: 0.5 },
    tech: { drift: 0.0048, beta: 0.95, risk: 0.85 },
    yolo: { drift: 0.003, beta: 1.25, risk: 1.2 },
    safe: { drift: 0.0024, beta: 0.1, risk: 0.25 },
  }[rival.style] || { drift: 0.003, beta: 0.4, risk: 0.5 };
  const macroAdj = (mk.eq + mk.btc * 0.45) * Math.max(1, months * 0.8);
  const raw = 1 + months * t.drift + btcRet * t.beta + noise * t.risk + macroAdj;
  return startCash * clamp(raw, 0.12, 6.5);
}

function rivalPortfolio(rival, startCash, y, m, btcUsd, gameSeed = 1) {
  const months = Math.max(0, (y - 2026) * 12 + (m - 3));
  if (months === 0) {
    return {
      cashVal: startCash,
      btcVal: 0,
      aptVal: 0,
      stockVal: 0,
      total: startCash,
      apts: [],
      stocks: [],
      debt: 0,
      ltv: 0,
    };
  }
  const btcRet = btcUsd / 70000 - 1;
  const allocMap = {
    lev: { cash: 0.2, btc: 0.45, apt: 0.05, stock: 0.3 },
    hodl: { cash: 0.18, btc: 0.7, apt: 0.04, stock: 0.08 },
    apt: { cash: 0.12, btc: 0.08, apt: 0.72, stock: 0.08 },
    quant: { cash: 0.2, btc: 0.28, apt: 0.12, stock: 0.4 },
    div: { cash: 0.15, btc: 0.1, apt: 0.15, stock: 0.6 },
    tech: { cash: 0.14, btc: 0.18, apt: 0.08, stock: 0.6 },
    yolo: { cash: 0.08, btc: 0.62, apt: 0.06, stock: 0.24 },
    safe: { cash: 0.52, btc: 0.06, apt: 0.22, stock: 0.2 },
  };
  const alloc = allocMap[rival.style] || allocMap.safe;
  const debtRate = rival.style === "apt" ? 0.65 : rival.style === "yolo" ? 0.55 : rival.style === "lev" ? 0.35 : 0.2;
  const debt = startCash * debtRate;
  const investable = startCash + debt;
  const cashVal = investable * alloc.cash * (1 + 0.002 * months);
  const btcVal = investable * alloc.btc * clamp(1 + btcRet * (rival.style === "lev" ? 1.7 : 1.05), 0.2, 4.5);

  const aptUniverse = [APTS_WITH_AREA[0], APTS_WITH_AREA[1], APTS_WITH_AREA[2], APTS_WITH_AREA[3]].filter(Boolean);
  let aptBudget = investable * alloc.apt;
  const apts = aptUniverse.map((a, i) => {
    const curUnit = a.p * Math.pow(1 + a.g / 12, months);
    const weight = 1 - i * 0.18;
    const rawQty = Math.floor((aptBudget * weight) / curUnit);
    const qty = Math.max(0, rawQty);
    const bought = a.p * qty;
    const cur = curUnit * qty;
    aptBudget -= cur;
    return {
      id: a.id,
      name: a.name,
      icon: a.icon,
      count: qty,
      bought,
      cur,
      roi: bought > 0 ? ((cur - bought) / bought) * 100 : 0,
    };
  }).filter((x) => x.count > 0);

  const stockBaskets = {
    lev: ["coin", "nvda", "tsla", "arkk", "qqq", "soxx", "xbi"],
    hodl: ["qqq", "spy", "msft", "aapl", "goog", "schd", "kodex200"],
    apt: ["tlt", "schd", "jepi", "samsung", "kodex200", "xlf", "hanaro_reit"],
    quant: ["qqq", "soxx", "xlf", "tlt", "msft", "spy", "xbi"],
    div: ["schd", "jepi", "spy", "tlt", "kodex200", "xlf", "samsung"],
    tech: ["qqq", "nvda", "msft", "aapl", "soxx", "goog", "meta"],
    yolo: ["coin", "tsla", "nvda", "arkk", "qqq", "xbi", "soxx"],
    safe: ["tlt", "spy", "schd", "kodex200", "xlf", "hyundai", "hanaro_reit"],
  };
  const basketIds = seededShuffle(stockBaskets[rival.style] || stockBaskets.safe, gameSeed, rival.id).slice(0, 5);
  const stkUniverse = basketIds
    .map((id) => (id === "btc-proxy" ? null : STOCKS.find((s) => s.id === id)))
    .filter(Boolean);
  let stockBudget = investable * alloc.stock;
  const wRaw = stkUniverse.map((s, i) => Math.max(0.6, 1 + randSigned(gameSeed, rival.id, s.id, i) * 0.35));
  const wSum = wRaw.reduce((a, b) => a + b, 0) || 1;
  const weights = wRaw.map((w) => w / wSum);
  const stocks = stkUniverse.map((s, i) => {
    const g = s.g || 0.008;
    const mk = marketSignal(gameSeed, y, m, i + 1, makeScenario(gameSeed));
    const styleVol = rival.style === "lev" || rival.style === "yolo" ? 1.7 : rival.style === "safe" ? 0.6 : 1.0;
    const volScale = Math.min(0.42, 0.02 * Math.sqrt(Math.max(1, months))) * styleVol;
    const deterministicShock = randSigned(gameSeed, rival.id, s.id, y, m) * volScale;
    const curUnit = s.p * Math.pow(1 + g / 12 + mk.eq * (0.9 + styleVol * 0.2), months) * (1 + deterministicShock);
    const qty = Math.max(0, Math.floor((stockBudget * weights[i]) / curUnit));
    const bought = s.p * qty;
    const cur = Math.max(0, curUnit * qty);
    stockBudget -= cur;
    return {
      id: s.id,
      name: s.name,
      icon: s.icon,
      count: qty,
      bought,
      cur,
      roi: bought > 0 ? ((cur - bought) / bought) * 100 : 0,
    };
  }).filter((x) => x.count > 0);

  const aptVal = apts.reduce((sum, a) => sum + a.cur, 0);
  const stockVal = stocks.reduce((sum, s) => sum + s.cur, 0);
  const total = cashVal + btcVal + aptVal + stockVal;
  return { cashVal, btcVal, aptVal, stockVal, total, apts, stocks, debt, ltv: total > 0 ? (debt / total) * 100 : 0 };
}

function buildRivalBoard(startCash, y, m, btcUsd, myTotal, gameSeed = 1) {
  const months = Math.max(0, (y - 2026) * 12 + (m - 3));
  const investedBase = startCash + months * MONTHLY_SALARY;
  if (months === 0) {
    const baseRows = [{ id: "me", name: "나", icon: "🎮", wealth: myTotal, roi: 0 }, ...RIVALS.map((r) => ({
      id: r.id,
      name: r.name,
      icon: r.icon,
      wealth: startCash,
      roi: 0,
      pf: { cashVal: startCash, btcVal: 0, aptVal: 0, stockVal: 0, total: startCash, apts: [], stocks: [], debt: 0, ltv: 0 },
    }))];
    const all0 = [...baseRows].sort((a, b) => b.wealth - a.wealth);
    const myRank0 = all0.findIndex((x) => x.id === "me") + 1;
    return { all: all0, myRank: myRank0 };
  }
  const rivals = RIVALS.map((r) => {
    const pf = rivalPortfolio(r, startCash, y, m, btcUsd, gameSeed);
    const modeled = Math.max(0, simRivalWealth(r, startCash, y, m, btcUsd, gameSeed));
    const wealth = (pf.total * 0.6 + modeled * 0.4);
    return {
      id: r.id,
      name: r.name,
      icon: r.icon,
      style: r.style,
      wealth,
      roi: investedBase > 0 ? ((wealth - investedBase) / investedBase) * 100 : 0,
      pf: { ...pf, total: wealth },
    };
  });
  const all = [{ id: "me", name: "나", icon: "🎮", wealth: myTotal, roi: investedBase > 0 ? ((myTotal - investedBase) / investedBase) * 100 : 0 }, ...rivals].sort(
    (a, b) => b.wealth - a.wealth,
  );
  const myRank = all.findIndex((x) => x.id === "me") + 1;
  return { all, myRank };
}

function normalizeGame(raw) {
  if (!raw) return null;
  return {
    year: raw.year ?? 2026,
    month: raw.month ?? 3,
    day: raw.day ?? 11,
    startCash: raw.startCash ?? 100_000_000,
    cash: raw.cash ?? raw.startCash ?? 100_000_000,
    btc: raw.btc ?? 0,
    btcUsd: raw.btcUsd ?? getBtcUsd(2026, 3, 11),
    btcPrev: raw.btcPrev ?? raw.btcUsd ?? getBtcUsd(2026, 3, 11),
    btcPrevRet: raw.btcPrevRet ?? 0,
    btcVol: raw.btcVol ?? 0.028,
    btcEps: raw.btcEps ?? 0,
    btcTrend: raw.btcTrend ?? 0,
    btcRegime: raw.btcRegime ?? "chop",
    btcRegimeLeft: raw.btcRegimeLeft ?? 0,
    btcBlockStart: raw.btcBlockStart ?? 0,
    btcBlockOffset: raw.btcBlockOffset ?? 0,
    btcBlockRemain: raw.btcBlockRemain ?? 0,
    endYear: raw.endYear ?? 2041,
    myNick: raw.myNick ?? "플레이어",
    pauseLimit: raw.pauseLimit ?? 3,
    gameSeed: raw.gameSeed ?? 1,
    scenario: raw.scenario ?? makeScenario(raw.gameSeed ?? 1),
    equippedTagId: raw.equippedTagId ?? null,
    activeMacro: raw.activeMacro ?? null,
    marketPhase: raw.marketPhase ?? null,
    newsLog: Array.isArray(raw.newsLog) ? raw.newsLog : [],
    apts: Array.isArray(raw.apts) ? raw.apts : [],
    stocks: Array.isArray(raw.stocks) ? raw.stocks : [],
    commodities: Array.isArray(raw.commodities) ? raw.commodities : [],
    futures: Array.isArray(raw.futures) ? raw.futures : [],
    deposits: Array.isArray(raw.deposits) ? raw.deposits : [],
    loans: Array.isArray(raw.loans) ? raw.loans : [],
    spotOrders: Array.isArray(raw.spotOrders) ? raw.spotOrders : [],
    futOrders: Array.isArray(raw.futOrders) ? raw.futOrders : [],
    ownedTags: Array.isArray(raw.ownedTags) ? raw.ownedTags : [],
    collection: Array.isArray(raw.collection) ? raw.collection : [],
    codexCrown: !!raw.codexCrown,
    doneEvents: Array.isArray(raw.doneEvents) ? raw.doneEvents : [],
    stats: ensureStats(raw.stats, raw.startCash ?? 100_000_000),
    total: raw.total ?? raw.cash ?? raw.startCash ?? 100_000_000,
    multi: raw.multi ?? null,
    players: Array.isArray(raw.players) ? raw.players : [],
  };
}

const APTS = [
  { id: "banpo", name: "반포 아크로리버파크", icon: "👑", p: 42e8, g: 0.045 },
  { id: "jamsil", name: "잠실 리센츠", icon: "🗼", p: 26e8, g: 0.04 },
  { id: "pangyo", name: "판교원마을", icon: "💻", p: 13e8, g: 0.038 },
  { id: "haeundae", name: "해운대 위브더제니스", icon: "🏖️", p: 11e8, g: 0.035 },
  { id: "daechi", name: "대치 은마", icon: "🏛️", p: 32e8, g: 0.042 },
  { id: "dogok", name: "도곡 타워팰리스", icon: "🏙️", p: 35e8, g: 0.041 },
  { id: "raemian1", name: "래미안 원베일리", icon: "💎", p: 48e8, g: 0.046 },
  { id: "yongsan", name: "용산 파크타워", icon: "🚄", p: 23e8, g: 0.037 },
  { id: "mapo", name: "마포 래미안", icon: "🌊", p: 15e8, g: 0.034 },
  { id: "mokdong", name: "목동 하이페리온", icon: "📚", p: 12e8, g: 0.031 },
  { id: "hannam", name: "한남 더힐", icon: "🌟", p: 55e8, g: 0.047 },
  { id: "songdo", name: "송도 더샵", icon: "🌃", p: 7e8, g: 0.03 },
  { id: "dongtan", name: "동탄 메타폴리스", icon: "🏗️", p: 7e8, g: 0.03 },
  { id: "gwanggyo", name: "광교 자연앤자이", icon: "🌿", p: 9.5e8, g: 0.032 },
  { id: "sejong", name: "세종 리더스포레", icon: "🏢", p: 4.8e8, g: 0.028 },
  { id: "gimpo", name: "김포 센트럴파크", icon: "🛩️", p: 4e8, g: 0.026 },
  { id: "jeju", name: "제주 노형 한라뷰", icon: "🍊", p: 3.8e8, g: 0.027 },
  { id: "suseong", name: "수성 범어 파크드림", icon: "🎭", p: 8e8, g: 0.03 },
  { id: "cheonan", name: "천안 불당 더샵", icon: "🚅", p: 3.5e8, g: 0.025 },
  { id: "nowon", name: "노원 중계 래미안", icon: "🏔️", p: 7.5e8, g: 0.029 },
  { id: "seongbuk", name: "성북 길음뉴타운", icon: "🏘️", p: 6e8, g: 0.028 },
  { id: "gwangju", name: "광주 첨단 호반써밋", icon: "☀️", p: 2.8e8, g: 0.023 },
  { id: "incheon_villa", name: "인천 간석 빌라", icon: "🏚️", p: 1.1e8, g: 0.02 },
  { id: "daegu_villa", name: "대구 북구 빌라", icon: "🏚️", p: 0.95e8, g: 0.019 },
  { id: "busan_villa", name: "부산 사상 빌라", icon: "🏚️", p: 1.25e8, g: 0.021 },
  { id: "guro_officetel", name: "구로 오피스텔", icon: "🏢", p: 1.8e8, g: 0.022 },
  { id: "ansan_small", name: "안산 소형 아파트", icon: "🏠", p: 1.6e8, g: 0.021 },
  { id: "cheongju_villa", name: "청주 분평 빌라", icon: "🏚️", p: 0.88e8, g: 0.018 },
];
const APT_AREA_OVERRIDES = {
  mokdong: { sqm: 59, py: 17.8 },
  sejong: { sqm: 84, py: 25.4 },
  gimpo: { sqm: 59, py: 17.8 },
  jeju: { sqm: 59, py: 17.8 },
  cheonan: { sqm: 59, py: 17.8 },
  nowon: { sqm: 84, py: 25.4 },
  seongbuk: { sqm: 59, py: 17.8 },
  gwangju: { sqm: 59, py: 17.8 },
  incheon_villa: { sqm: 46, py: 13.9 },
  daegu_villa: { sqm: 42, py: 12.7 },
  busan_villa: { sqm: 49, py: 14.8 },
  guro_officetel: { sqm: 38, py: 11.5 },
  ansan_small: { sqm: 51, py: 15.4 },
  cheongju_villa: { sqm: 40, py: 12.1 },
};
const APTS_WITH_AREA = APTS.map((a) => {
  const area = APT_AREA_OVERRIDES[a.id] || { sqm: 84, py: 25.4 };
  return { ...a, sqm: area.sqm, py: area.py };
});
const APT_REGION_BY_ID = {
  banpo: "서울",
  jamsil: "서울",
  daechi: "서울",
  dogok: "서울",
  raemian1: "서울",
  yongsan: "서울",
  mapo: "서울",
  mokdong: "서울",
  hannam: "서울",
  nowon: "서울",
  seongbuk: "서울",
  guro_officetel: "서울",
  pangyo: "수도권",
  songdo: "수도권",
  dongtan: "수도권",
  gwanggyo: "수도권",
  sejong: "수도권",
  gimpo: "수도권",
  ansan_small: "수도권",
  incheon_villa: "수도권",
  haeundae: "지방",
  jeju: "지방",
  suseong: "지방",
  cheonan: "지방",
  gwangju: "지방",
  daegu_villa: "지방",
  busan_villa: "지방",
  cheongju_villa: "지방",
};
const aptRegionOf = (id) => APT_REGION_BY_ID[id] || "지방";
const aptTypeOf = (a) => (/빌라|오피스텔/.test(a.name) ? "빌라/오피스텔" : "아파트");
const matchAptFilters = (a, regionFilter, typeFilter) => {
  const r = aptRegionOf(a.id);
  const t = aptTypeOf(a);
  const okRegion = regionFilter === "전체" ? true : r === regionFilter;
  const okType = typeFilter === "전체" ? true : t === typeFilter;
  return okRegion && okType;
};

const STOCKS = [
  { id: "qqq", name: "QQQ", icon: "💡", p: 593.72 * KRW_RATE, g: 0.012, divYield: 0, etfDesc: "나스닥100" },
  { id: "spy", name: "SPY", icon: "🇺🇸", p: 662.29 * KRW_RATE, g: 0.009, divYield: 0.013, etfDesc: "S&P500" },
  { id: "nvda", name: "NVDA", icon: "🎮", p: 180.25 * KRW_RATE, g: 0.02, divYield: 0 },
  { id: "aapl", name: "AAPL", icon: "🍎", p: 250.12 * KRW_RATE, g: 0.011, divYield: 0.004 },
  { id: "msft", name: "MSFT", icon: "🪟", p: 395.55 * KRW_RATE, g: 0.011, divYield: 0.007 },
  { id: "amzn", name: "AMZN", icon: "📦", p: 207.67 * KRW_RATE, g: 0.012, divYield: 0 },
  { id: "meta", name: "META", icon: "👓", p: 613.71 * KRW_RATE, g: 0.013, divYield: 0.004 },
  { id: "goog", name: "GOOG", icon: "🔎", p: 301.46 * KRW_RATE, g: 0.011, divYield: 0 },
  { id: "tsla", name: "TSLA", icon: "⚡", p: 391.2 * KRW_RATE, g: 0.014, divYield: 0 },
  { id: "coin", name: "COIN", icon: "🪙", p: 195.53 * KRW_RATE, g: 0.018, divYield: 0 },
  { id: "tlt", name: "TLT", icon: "🏦", p: 86.54 * KRW_RATE, g: 0.005, divYield: 0.021, etfDesc: "미국 장기국채" },
  { id: "schd", name: "SCHD", icon: "💰", p: 30.8 * KRW_RATE, g: 0.01, divYield: 0.034, etfDesc: "미국 배당주" },
  { id: "jepi", name: "JEPI", icon: "🏛️", p: 57.09 * KRW_RATE, g: 0.007, divYield: 0.072, etfDesc: "커버드콜 인컴" },
  { id: "samsung", name: "삼성전자", icon: "📱", p: 183500, g: 0.009, divYield: 0.02 },
  { id: "skhynix", name: "SK하이닉스", icon: "💾", p: 910000, g: 0.014, divYield: 0.012 },
  { id: "hyundai", name: "현대차", icon: "🚗", p: 517000, g: 0.008, divYield: 0.021 },
  { id: "naver", name: "네이버", icon: "🟢", p: 223000, g: 0.009, divYield: 0.01 },
  { id: "kakao", name: "카카오", icon: "💬", p: 50600, g: 0.008, divYield: 0.005 },
  { id: "kodex200", name: "KODEX200", icon: "🇰🇷", p: 38500, g: 0.007, divYield: 0.015, etfDesc: "국내 코스피200" },
  { id: "soxx", name: "SOXX", icon: "🧩", p: 331.32 * KRW_RATE, g: 0.013, divYield: 0.008, etfDesc: "반도체" },
  { id: "arkk", name: "ARKK", icon: "🧪", p: 70.25 * KRW_RATE, g: 0.015, divYield: 0, etfDesc: "혁신 테마" },
  { id: "xle", name: "XLE", icon: "🛢️", p: 96 * KRW_RATE, g: 0.006, divYield: 0.03, etfDesc: "에너지" },
  { id: "xlf", name: "XLF", icon: "🏛️", p: 48.89 * KRW_RATE, g: 0.006, divYield: 0.021, etfDesc: "금융" },
  { id: "xbi", name: "XBI", icon: "🧬", p: 121.83 * KRW_RATE, g: 0.01, divYield: 0.006, etfDesc: "바이오" },
  { id: "avgo", name: "AVGO", icon: "📡", p: 1710.2 * KRW_RATE, g: 0.014, divYield: 0.012 },
  { id: "amd", name: "AMD", icon: "🧠", p: 232.4 * KRW_RATE, g: 0.015, divYield: 0 },
  { id: "smci", name: "SMCI", icon: "🖥️", p: 89.3 * KRW_RATE, g: 0.016, divYield: 0 },
  { id: "pltr", name: "PLTR", icon: "🛰️", p: 67.2 * KRW_RATE, g: 0.015, divYield: 0 },
  { id: "tesetf", name: "SOXL", icon: "🚀", p: 73.4 * KRW_RATE, g: 0.019, divYield: 0.005, etfDesc: "반도체 3배" },
  { id: "kosdaq", name: "KODEX 코스닥150", icon: "🟣", p: 16250, g: 0.009, divYield: 0.012, etfDesc: "국내 성장주" },
  { id: "hanaro_reit", name: "HANARO 리츠", icon: "🏬", p: 5120, g: 0.006, divYield: 0.038, etfDesc: "국내 리츠" },
  { id: "kb_fin", name: "KB금융", icon: "🏛️", p: 94600, g: 0.007, divYield: 0.032 },
  { id: "lg_energy", name: "LG에너지솔루션", icon: "🔋", p: 438000, g: 0.011, divYield: 0.005 },
  { id: "celltrion", name: "셀트리온", icon: "🧪", p: 189000, g: 0.009, divYield: 0.006 },
];
const KR_STOCK_IDS = new Set(["samsung", "skhynix", "hyundai", "naver", "kakao", "kodex200", "kosdaq", "hanaro_reit", "kb_fin", "lg_energy", "celltrion"]);
const isDomesticStock = (s) => KR_STOCK_IDS.has(s.id);
const isBondStock = (s) => s.id === "tlt" || /채권|국채/.test(s.etfDesc || "");
const isEtfStock = (s) => !!s.etfDesc;
const isDividendStock = (s) => (s.divYield || 0) >= 0.025 || ["schd", "jepi", "hanaro_reit"].includes(s.id);
const isSingleStock = (s) => !isEtfStock(s);
const matchStockFilters = (s, marketFilter, typeFilter) => {
  const okMarket =
    marketFilter === "전체"
      ? true
      : marketFilter === "국내"
        ? isDomesticStock(s)
        : !isDomesticStock(s);
  const okType =
    typeFilter === "전체"
      ? true
      : typeFilter === "ETF"
        ? isEtfStock(s)
        : typeFilter === "개별주"
          ? isSingleStock(s)
          : typeFilter === "배당주"
            ? isDividendStock(s)
            : isBondStock(s);
  return okMarket && okType;
};

const COMMODITIES = [
  { id: "gold", name: "금 (현물 ETF)", icon: "🥇", p: 460.84 * KRW_RATE, g: 0.004, vol: 0.006, etf: "GLD" },
  { id: "silver", name: "은 (현물 ETF)", icon: "🥈", p: 31.2 * KRW_RATE, g: 0.005, vol: 0.011, etf: "SLV" },
  { id: "oil", name: "원유 (WTI ETF)", icon: "🛢️", p: 79.5 * KRW_RATE, g: 0.003, vol: 0.018, etf: "USO" },
  { id: "platinum", name: "백금 ETF", icon: "⚪", p: 94.7 * KRW_RATE, g: 0.004, vol: 0.014, etf: "PPLT" },
  { id: "copper", name: "구리 ETF", icon: "🟠", p: 45.3 * KRW_RATE, g: 0.004, vol: 0.015, etf: "CPER" },
  { id: "natgas", name: "천연가스 ETF", icon: "🔥", p: 17.2 * KRW_RATE, g: 0.002, vol: 0.025, etf: "UNG" },
];

const EVENTS = [
  { y: 2026, m: 6, d: 15, e: "연준 금리 인하", et: "positive", shock: 0.08 },
  { y: 2026, m: 9, d: 22, e: "글로벌 경기침체 우려", et: "crash", shock: -0.2 },
  { y: 2027, m: 5, d: 8, e: "AI 기업들 BTC 보유 선언", et: "positive", shock: 0.18 },
  { y: 2028, m: 4, d: 1, e: "다섯 번째 반감기", et: "halving", shock: 0.12 },
  { y: 2028, m: 5, d: 20, e: "반감기 이후 과열 청산: 급락장", et: "crash", shock: -0.6 },
  { y: 2029, m: 7, d: 18, e: "대형 기관 패닉셀", et: "crash", shock: -0.25 },
  { y: 2032, m: 5, d: 17, e: "반감기 후 디레버리징", et: "crash", shock: -0.45 },
];
const RARE_EVENTS = [
  { id: "depression", name: "세계 경제 대공황", chance: 0.0022, btc: -0.35, eq: -0.42, re: -0.18, months: 10, et: "rare" },
  { id: "nuclear", name: "핵전쟁 공포 확산", chance: 0.0008, btc: -0.45, eq: -0.38, re: -0.22, months: 14, et: "rare" },
  { id: "etf_supercycle", name: "초대형 ETF 순유입", chance: 0.002, btc: 0.28, eq: 0.12, re: 0.03, months: 7, et: "rare" },
  { id: "liquidity_freeze", name: "글로벌 유동성 경색", chance: 0.0018, btc: -0.26, eq: -0.27, re: -0.1, months: 6, et: "rare" },
];
const MEME_EVENTS = [
  { id: "elon_tweet", name: "밈 트윗 과열", chance: 0.02, btc: 0.035, et: "meme" },
  { id: "exchange_fud", name: "거래소 FUD 루머", chance: 0.018, btc: -0.032, et: "meme" },
  { id: "whale_screenshot", name: "고래 지갑 스샷 확산", chance: 0.016, btc: 0.028, et: "meme" },
  { id: "rekt_day", name: "전 시장 리퀴데이션 데이", chance: 0.014, btc: -0.04, et: "meme" },
];

const BOT_NAMES = ["김비트", "이더리", "박호들", "최블록", "정마진", "한코인", "유레버", "오체인"];
const BOT_ICONS = ["🦊", "🐺", "🦁", "🐯", "🐻", "🐼", "🦈", "🐉"];

function makeBots(n, startCash) {
  return Array.from({ length: n }, (_, i) => ({
    id: `bot_${i}`,
    nickname: BOT_NAMES[i % BOT_NAMES.length],
    icon: BOT_ICONS[i % BOT_ICONS.length],
    isBot: true,
    ready: true,
    cash: startCash,
    btc: 0,
    total: startCash,
    roi: 0,
  }));
}

function botTick(bot, btcUsd, y, m, d, startCash) {
  let cash = bot.cash;
  let btc = bot.btc;
  if (d === 1) cash += MONTHLY_SALARY;
  const seed = bot.id.split("").reduce((s, ch) => s + ch.charCodeAt(0), 0) + y * 10000 + m * 100 + d;
  const r = Math.abs(Math.sin(seed * 0.0017));
  if (cash > startCash * 0.15 && r < 0.1) {
    const buy = cash * 0.2;
    btc += buy / (btcUsd * KRW_RATE);
    cash -= buy;
  } else if (btc > 0 && r > 0.92) {
    const sell = btc * 0.25;
    cash += sell * btcUsd * KRW_RATE;
    btc -= sell;
  }
  const total = cash + btc * btcUsd * KRW_RATE;
  return { ...bot, cash, btc, total, roi: ((total - startCash) / startCash) * 100 };
}

function ensureStats(stats = {}, startCash = 0) {
  return {
    spotTrades: stats.spotTrades || 0,
    futClosed: stats.futClosed || 0,
    bestFutRoi: stats.bestFutRoi || 0,
    stopLossHits: stats.stopLossHits || 0,
    liqHits: stats.liqHits || 0,
    btcHoldMonths: stats.btcHoldMonths || 0,
    maxTotal: stats.maxTotal || startCash || 0,
    minTotal: stats.minTotal || startCash || 0,
    maxDrawdown: stats.maxDrawdown || 0,
    interestIncome: stats.interestIncome || 0,
    repaidPrincipal: stats.repaidPrincipal || 0,
    eventCount: stats.eventCount || 0,
    rareEventSurvived: stats.rareEventSurvived || 0,
    recoveredFromDrawdown: stats.recoveredFromDrawdown || false,
    monthsAlive: stats.monthsAlive || 0,
    highVolSurvived: stats.highVolSurvived || false,
    bankingActions: stats.bankingActions || 0,
    maxStockKinds: stats.maxStockKinds || 0,
  };
}

function evaluateUnlocks(game) {
  const stats = ensureStats(game.stats, game.startCash);
  const ownedTags = new Set(game.ownedTags || []);
  const collection = new Set(game.collection || []);
  const tagsUnlocked = [];
  const collUnlocked = [];

  const metrics = {
    spotTrades: stats.spotTrades || 0,
    futClosed: stats.futClosed || 0,
    bestFutRoi: stats.bestFutRoi || 0,
    stopLossHits: stats.stopLossHits || 0,
    btcHoldMonths: stats.btcHoldMonths || 0,
    aptCount: (game.apts || []).length,
    interestIncome: stats.interestIncome || 0,
    eventCount: stats.eventCount || 0,
    repaidPrincipal: stats.repaidPrincipal || 0,
    rareEventSurvived: stats.rareEventSurvived || 0,
    totalMultiple: game.startCash > 0 ? (game.total || 0) / game.startCash : 0,
    maxDrawdown: stats.maxDrawdown || 0,
    maxStockKinds: stats.maxStockKinds || 0,
    atlas: (game.newsLog || []).some((n) => n.id === "depression") && (game.total || 0) >= game.startCash ? 1 : 0,
    nuclear: (game.newsLog || []).some((n) => n.id === "nuclear") ? 1 : 0,
    satoshi: (game.total || 0) > 0 && (game.total || 0) >= game.startCash * 10 && ((game.btc * game.btcUsd * KRW_RATE) / (game.total || 1)) >= 0.7 ? 1 : 0,
    void: (stats.monthsAlive || 0) >= 24 && (stats.rareEventSurvived || 0) >= 2 ? 1 : 0,
    recoveredFromDrawdown: stats.recoveredFromDrawdown ? 1 : 0,
    legendaryTags: [...ownedTags].filter((id) => TAG_DEFS.find((t) => t.id === id)?.tier === "legendary").length,
  };

  const meetsReq = (req) => {
    if (!req || !req.key) return false;
    const v = metrics[req.key];
    if (typeof v === "boolean") return v;
    if (typeof v !== "number") return false;
    return v >= (req.min ?? 1);
  };

  TAG_DEFS.forEach((t) => {
    if (!ownedTags.has(t.id) && meetsReq(t.req)) {
      ownedTags.add(t.id);
      tagsUnlocked.push(t);
    }
  });

  // 태그 획득 후 전설 카운트 재계산
  metrics.legendaryTags = [...ownedTags].filter((id) => TAG_DEFS.find((t) => t.id === id)?.tier === "legendary").length;

  COLLECTIBLES.forEach((c) => {
    if (!collection.has(c.id) && meetsReq(c.req)) {
      collection.add(c.id);
      collUnlocked.push(c);
    }
  });

  return {
    ownedTags: [...ownedTags],
    collection: [...collection],
    tagsUnlocked,
    collUnlocked,
  };
}

function Setup({ onStart, onContinue, canContinue, roomList = [], roomListLoading = false, roomListConnected = false, onRefreshRooms }) {
  const [cash, setCash] = useState("1");
  const [unit, setUnit] = useState("억원");
  const [mode, setMode] = useState("single");
  const [nickname, setNickname] = useState("");
  const [endYear, setEndYear] = useState(2041);
  const [pauseLimit, setPauseLimit] = useState(3);
  const [fillBots, setFillBots] = useState(true);
  const [roomCode, setRoomCode] = useState("");
  const units = { 만원: 1e4, 천만원: 1e7, 억원: 1e8, 십억원: 1e9 };
  const startCash = clamp((parseFloat(cash || "0") || 1) * units[unit], 1e6, 1e13);
  const approxDays = Math.max(30, (endYear - 2026) * 365 + 295);
  const oneXMin = Math.round((approxDays * 3.5) / 60);
  const selectedRoom = useMemo(() => roomList.find((r) => r.code === roomCode), [roomList, roomCode]);
  return (
    <div style={S.bgCenter}>
      <div style={S.card}>
        <h1 style={S.h1}>비트코인 타이쿤</h1>
        <div style={{ ...S.muted, color: "#22c55e", fontWeight: 700 }}>BUILD: {BUILD_ID}</div>
        <div style={{ ...S.muted, color: "#93c5fd" }}>WS: {DEFAULT_WS_URL}</div>
        <input value={nickname} onChange={(e) => setNickname(e.target.value.slice(0, 12))} placeholder="트레이더 닉네임" style={S.input} />
        <div style={S.row}>
          <input value={cash} onChange={(e) => setCash(e.target.value)} style={S.input} />
          <select value={unit} onChange={(e) => setUnit(e.target.value)} style={S.select}>
            {Object.keys(units).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <p style={S.muted}>시작 자본 {fw(startCash)}</p>
        <div style={S.row}>
          <span style={S.muted}>종료 연도</span>
          <select value={endYear} onChange={(e) => setEndYear(parseInt(e.target.value, 10))} style={S.select}>
            {Array.from({ length: 20 }, (_, i) => 2028 + i).map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <span style={S.muted}>1배속 예상 약 {oneXMin}분</span>
        </div>
        <div style={S.row}>
          <button style={mode === "single" ? S.btnPri : S.speed} onClick={() => setMode("single")}>싱글</button>
          <button style={mode === "multi" ? S.btnPri : S.speed} onClick={() => setMode("multi")}>멀티</button>
        </div>
        {mode === "multi" && (
          <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
            <label style={S.muted}>
              <input type="checkbox" checked={fillBots} onChange={(e) => setFillBots(e.target.checked)} /> AI로 빈자리 채우기
            </label>
            <div style={S.row}>
              <span style={S.muted}>개인 일시정지 횟수</span>
              <select value={pauseLimit} onChange={(e) => setPauseLimit(parseInt(e.target.value, 10))} style={S.select}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>{n}회</option>
                ))}
              </select>
            </div>
            <div style={{ ...S.card, background: "#020617", borderColor: "#334155", padding: 8, gap: 6 }}>
              <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ ...S.muted, color: "#93c5fd", fontWeight: 700 }}>
                  공개 대기실 {roomListConnected ? `(${roomList.length}개)` : "(연결중)"}
                </div>
                <button style={S.chipBtn} onClick={() => onRefreshRooms?.()} disabled={!roomListConnected}>
                  {roomListLoading ? "새로고침..." : "새로고침"}
                </button>
              </div>
              <div style={{ maxHeight: 180, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
                {roomList.length === 0 && (
                  <div style={{ ...S.muted, color: roomListConnected ? "#94a3b8" : "#f59e0b" }}>
                    {roomListConnected ? "열린 대기실이 없습니다. 새 방으로 시작하세요." : "멀티 서버 연결 상태를 확인 중입니다."}
                  </div>
                )}
                {roomList.map((r) => (
                  <button
                    key={r.code}
                    style={{
                      ...S.item,
                      cursor: r.joinable ? "pointer" : "not-allowed",
                      borderColor: roomCode === r.code ? "#22c55e" : r.joinable ? "#334155" : "#7f1d1d",
                      opacity: r.joinable ? 1 : 0.55,
                      textAlign: "left",
                    }}
                    onClick={() => {
                      if (!r.joinable) return;
                      setRoomCode(r.code);
                    }}
                  >
                    <span>
                      <strong style={{ color: r.joinable ? "#22c55e" : "#ef4444" }}>{r.code}</strong>
                      <span style={{ ...S.muted, marginLeft: 8 }}>방장 {r.hostNickname}</span>
                    </span>
                    <span style={S.muted}>
                      {r.players}명 · {r.joinable ? "입장 가능" : "게임 진행중"}
                    </span>
                  </button>
                ))}
              </div>
              <div style={S.row}>
                <button style={S.chipBtn} onClick={() => setRoomCode("")}>
                  새 방 만들기
                </button>
                <input
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12))}
                  placeholder="직접 방코드 입력 (선택)"
                  style={{ ...S.input, minWidth: 180 }}
                />
              </div>
              <div style={{ ...S.muted, color: "#93c5fd" }}>
                {roomCode ? `선택된 방: ${roomCode}${selectedRoom ? ` · 현재 ${selectedRoom.players}명` : " (신규 생성 가능)"}` : "새 방으로 시작합니다."}
              </div>
            </div>
          </div>
        )}
        <button style={S.btnPri} onClick={() => onStart({ startCash, mode, nickname: nickname || "익명 트레이더", endYear, pauseLimit, fillBots, customMode: mode === "multi", roomCode })}>
          게임 시작
        </button>
        <div style={S.muted}>종료연도/일시정지/멀티옵션은 게임 시작 시 반영됩니다.</div>
        {canContinue && (
          <button style={S.speed} onClick={onContinue}>
            이어하기 (저장 데이터 있음)
          </button>
        )}
      </div>
    </div>
  );
}

function Lobby({ players, roomState, onReady, onStart, onBack, onApplySettings, onKick }) {
  const me = players.find((p) => !p.isBot && p.icon === "🎮") || players.find((p) => !p.isBot);
  const allReady = players.every((p) => p.ready);
  const isHost = !!me?.isHost;
  const [localEndYear, setLocalEndYear] = useState(roomState?.endYear || 2041);
  const [localPause, setLocalPause] = useState(roomState?.pauseLimit || 3);
  const [localSpeed, setLocalSpeed] = useState(roomState?.speed || 1);
  useEffect(() => {
    setLocalEndYear(roomState?.endYear || 2041);
    setLocalPause(roomState?.pauseLimit || 3);
    setLocalSpeed(roomState?.speed || 1);
  }, [roomState?.endYear, roomState?.pauseLimit, roomState?.speed]);
  return (
    <div style={S.bgCenter}>
      <div style={{ ...S.card, width: 560, maxWidth: "100%" }}>
        <h2 style={{ marginTop: 0, color: "#22c55e" }}>멀티 로비</h2>
        <div style={{ ...S.row, justifyContent: "space-between", marginBottom: 10 }}>
          <div style={S.muted}>준비 후 시작</div>
          <div style={{ ...S.muted, color: "#93c5fd", fontWeight: 700 }}>ROOM: {roomState?.code || "-"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          {players.map((p) => (
            <div key={p.id} style={S.item}>
              <span>{p.icon || "🎮"} {p.nickname} {p.isBot ? "(BOT)" : ""} {!p.isBot ? `· 정지 ${p.pauseLeft ?? 0}회` : ""}</span>
              <span style={S.row}>
                <strong style={{ color: p.ready ? "#22c55e" : "#f59e0b" }}>{p.ready ? "준비" : "대기"}</strong>
                {isHost && !p.isHost && (
                  <button style={S.btnDanger} onClick={() => onKick?.(p.id)}>강퇴</button>
                )}
              </span>
            </div>
          ))}
        </div>
        {isHost && (
          <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
            <div style={{ ...S.muted, marginBottom: 6 }}>방장 설정</div>
            <div style={S.row}>
              <span style={S.muted}>종료연도</span>
              <select value={localEndYear} onChange={(e) => setLocalEndYear(parseInt(e.target.value, 10))} style={S.select}>
                {Array.from({ length: 20 }, (_, i) => 2028 + i).map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
              <span style={S.muted}>일시정지</span>
              <select value={localPause} onChange={(e) => setLocalPause(parseInt(e.target.value, 10))} style={S.select}>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <option key={n} value={n}>{n}회</option>)}
              </select>
              <span style={S.muted}>기본 배속</span>
              <select value={localSpeed} onChange={(e) => setLocalSpeed(parseInt(e.target.value, 10))} style={S.select}>
                {[1, 2, 4, 10, 20].map((n) => <option key={n} value={n}>{n}x</option>)}
              </select>
              <button style={S.btnPri} onClick={() => onApplySettings?.({ endYear: localEndYear, pauseLimit: localPause, speed: localSpeed })}>설정 적용</button>
            </div>
          </div>
        )}
        <div style={S.row}>
          <button style={S.speed} onClick={onBack}>뒤로</button>
          <button style={me?.ready ? S.btnDanger : S.btnPri} onClick={onReady}>{me?.ready ? "준비취소" : "준비"}</button>
          <button style={allReady && isHost ? S.btnPri : S.speed} onClick={onStart} disabled={!allReady || !isHost}>시작</button>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{ ...S.tab, ...(active ? S.tabOn : null) }}>
      {children}
    </button>
  );
}

function aggregateCandles(candles, tf) {
  if (!candles || candles.length < 2) return [];
  if (tf === "1D") return [...candles];
  const parse = (k) => {
    const [y, m, d] = String(k).split("-").map((v) => parseInt(v, 10));
    return { y: y || 0, m: m || 1, d: d || 1 };
  };
  if (tf === "1W") {
    const out = [];
    for (let i = 0; i < candles.length; i += 7) {
      const bucket = candles.slice(i, i + 7);
      const first = bucket[0];
      const last = bucket[bucket.length - 1];
      out.push({
        k: first.k,
        o: first.o,
        h: Math.max(...bucket.map((x) => x.h)),
        l: Math.min(...bucket.map((x) => x.l)),
        c: last.c,
      });
    }
    return out;
  }
  const map = new Map();
  candles.forEach((c) => {
    const { y, m } = parse(c.k);
    const key = `${y}-${m}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  });
  const out = [];
  [...map.entries()].forEach(([key, bucket]) => {
    const first = bucket[0];
    const last = bucket[bucket.length - 1];
    out.push({
      k: `${key}-1`,
      o: first.o,
      h: Math.max(...bucket.map((x) => x.h)),
      l: Math.min(...bucket.map((x) => x.l)),
      c: last.c,
    });
  });
  return out;
}

function BinanceCandleChart({ candles, tf = "1D", h = 220, skin = "binance" }) {
  const data = aggregateCandles(candles, tf);
  const windowSize = tf === "1D" ? 72 : tf === "1W" ? 64 : 48;
  const [offset, setOffset] = useState(0);
  const dragRef = useRef({ active: false, x: 0, carry: 0 });
  const maxOffset = Math.max(0, data.length - windowSize);

  useEffect(() => {
    setOffset((v) => Math.min(v, maxOffset));
  }, [maxOffset, tf, data.length]);

  const start = Math.max(0, data.length - windowSize - offset);
  const view = data.slice(start, start + windowSize);

  if (!data || data.length < 2) {
    return <div style={{ ...S.muted, textAlign: "center", padding: 14 }}>차트 데이터 수집 중...</div>;
  }
  if (!view || view.length < 2) {
    return <div style={{ ...S.muted, textAlign: "center", padding: 14 }}>차트 탐색 데이터가 부족합니다.</div>;
  }
  const sk = CHART_SKINS[skin] || CHART_SKINS.binance;
  const W = 120;
  const PLOT_R = 86;
  const PLOT_L = 2;
  const CH = 80;
  const vals = view.flatMap((c) => [c.h, c.l]);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const range = max - min || 1;
  const py = (v) => CH - ((v - min) / range) * CH;
  const candleW = Math.max(0.2, 74 / view.length);
  const parse = (k) => {
    const [y, m, d] = String(k).split("-").map((v) => parseInt(v, 10));
    return { y: y || 0, m: m || 1, d: d || 1 };
  };
  const labelStep = Math.max(1, Math.floor(view.length / 6));
  const yTicks = 6;
  const xTicks = 6;
  const last = view[view.length - 1];
  const lastUp = last.c >= last.o;
  const canGoOlder = offset < maxOffset;
  const canGoNewer = offset > 0;
  const handleWheel = (e) => {
    e.preventDefault();
    const step = Math.max(1, Math.round(Math.abs(e.deltaY) / 38));
    if (e.deltaY > 0) setOffset((v) => Math.min(maxOffset, v + step));
    else setOffset((v) => Math.max(0, v - step));
  };
  const onDown = (e) => {
    dragRef.current.active = true;
    dragRef.current.x = e.clientX;
    dragRef.current.carry = 0;
  };
  const onMove = (e) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.x;
    dragRef.current.x = e.clientX;
    dragRef.current.carry += dx;
    const unit = 7;
    if (Math.abs(dragRef.current.carry) < unit) return;
    const steps = Math.trunc(Math.abs(dragRef.current.carry) / unit);
    dragRef.current.carry -= Math.sign(dragRef.current.carry) * steps * unit;
    if (dx > 0) setOffset((v) => Math.min(maxOffset, v + steps));
    else setOffset((v) => Math.max(0, v - steps));
  };
  const onUp = () => {
    dragRef.current.active = false;
    dragRef.current.carry = 0;
  };
  return (
    <div
      style={{ width: "100%", position: "relative", touchAction: "none", userSelect: "none" }}
      onWheel={handleWheel}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerLeave={onUp}
    >
      <svg viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" style={{ width: "100%", height: h, display: "block", background: sk.bg, borderRadius: 10 }}>
        {Array.from({ length: yTicks }, (_, i) => 8 + ((CH - 8) / (yTicks - 1)) * i).map((g) => (
          <line key={`gy_${g}`} x1="0" y1={g} x2={W} y2={g} stroke={sk.grid} strokeWidth="0.32" />
        ))}
        {Array.from({ length: xTicks }, (_, i) => i).map((i) => {
          const x = PLOT_L + (PLOT_R / (xTicks - 1)) * i;
          return <line key={`gx_${i}`} x1={x} y1="0" x2={x} y2={CH} stroke={sk.grid} strokeWidth="0.22" />;
        })}
        {view.map((c, i) => {
          const x = PLOT_L + (i / view.length) * PLOT_R;
          const up = c.c >= c.o;
          const col = up ? sk.up : sk.down;
          const yH = py(c.h);
          const yL = py(c.l);
          const yO = py(c.o);
          const yC = py(c.c);
          const yTop = Math.min(yO, yC);
          const bodyH = Math.max(0.7, Math.abs(yO - yC));
          return (
            <g key={c.k}>
              <line x1={x + candleW / 2} y1={yH} x2={x + candleW / 2} y2={yL} stroke={col} strokeWidth={Math.max(0.3, candleW * 0.16)} />
              <rect x={x} y={yTop} width={candleW} height={bodyH} fill={col} />
              {i % labelStep === 0 && (() => {
                const dt = parse(c.k);
                const label = tf === "1M" ? `${String(dt.y).slice(2)}.${String(dt.m).padStart(2, "0")}` : `${dt.m}/${dt.d}`;
                return <text x={x} y="97.2" fill={sk.text} fontSize="2.85">{label}</text>;
              })()}
            </g>
          );
        })}
        <text x={W * 0.5} y={CH * 0.58} textAnchor="middle" fill={sk.text} opacity="0.08" fontSize="9.2" fontWeight="800">
          {sk.watermark}
        </text>
        <line x1={0} y1={py(last.c)} x2={W} y2={py(last.c)} stroke={lastUp ? sk.up : sk.down} strokeWidth="0.28" strokeDasharray="1.6 1.4" opacity="0.8" />
      </svg>
      <div style={{ position: "absolute", left: 10, top: 8, fontSize: 11, color: sk.text, opacity: 0.9 }}>
        {canGoOlder ? "← 과거" : "최초 구간"} · {canGoNewer ? "최신으로 드래그→" : "최신 구간"}
      </div>
    </div>
  );
}

export default function App() {
  const wsRef = useRef(null);
  const setupWsRef = useRef(null);
  const setupWsRetryRef = useRef(null);
  const clientIdRef = useRef(`c_${Date.now()}_${Math.floor(Math.random() * 9999)}`);
  const [screen, setScreen] = useState("setup");
  const [run, setRun] = useState(false);
  const [spd, setSpd] = useState(1);
  const [tab, setTab] = useState("trade");
  const [toast, setToastRaw] = useState(null);
  const [eventModal, setEventModal] = useState(null);
  const [lastRank, setLastRank] = useState(null);
  const [G, setG] = useState(null);
  const [savedGame, setSavedGame] = useState(null);
  const [btcHist, setBtcHist] = useState([]);
  const [sfxMuted, setSfxMuted] = useState(false);
  const [multi, setMulti] = useState(null);
  const [players, setPlayers] = useState([]);
  const [stockQty, setStockQty] = useState({});
  const [aptQty, setAptQty] = useState({});
  const [cmdQty, setCmdQty] = useState({});
  const [aptRegionFilter, setAptRegionFilter] = useState("전체");
  const [aptTypeFilter, setAptTypeFilter] = useState("전체");
  const [stockMarketFilter, setStockMarketFilter] = useState("전체");
  const [stockTypeFilter, setStockTypeFilter] = useState("전체");
  const [inspectRivalId, setInspectRivalId] = useState(null);
  const [chartTf, setChartTf] = useState("1D");
  const [chartSkin, setChartSkin] = useState("binance");
  const [dateFx, setDateFx] = useState(null);
  const [spotForm, setSpotForm] = useState({
    side: "buy",
    type: "market",
    inputMode: "total", // total | qty
    priceKrw: "",
    qtyBtc: "",
    totalKrw: "",
  });
  const [futForm, setFutForm] = useState({ side: "long", type: "market", priceKrw: "", marginKrw: comma(5000000), lev: "", stopLoss: "", takeProfit: "" });
  const [rankModal, setRankModal] = useState(null);
  const [rankInspectId, setRankInspectId] = useState(null);
  const [pausedBy, setPausedBy] = useState(null);
  const [loanPct, setLoanPct] = useState(20);
  const [repayPct, setRepayPct] = useState(25);
  const [depJoinPct, setDepJoinPct] = useState(25);
  const [depWdPct, setDepWdPct] = useState(25);
  const [selectedTagId, setSelectedTagId] = useState(null);
  const [selectedCollectibleId, setSelectedCollectibleId] = useState(null);
  const [roomState, setRoomState] = useState(null);
  const [unlockFx, setUnlockFx] = useState(null);
  const [roomList, setRoomList] = useState([]);
  const [roomListLoading, setRoomListLoading] = useState(false);
  const [roomListConnected, setRoomListConnected] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.__BTC_TYCOON_BUILD__ = BUILD_ID;
    }
    console.log("[btc-tycoon] build:", BUILD_ID);
  }, []);

  const btcKrw = useMemo(() => (G ? G.btcUsd * KRW_RATE : 0), [G]);
  const rivalBoard = useMemo(() => {
    if (!G) return { all: [], myRank: 0 };
    return buildRivalBoard(G.startCash, G.year, G.month, G.btcUsd, G.total, G.gameSeed || 1);
  }, [G]);
  const spotBook = useMemo(() => {
    if (!G) return [];
    const b = G.btcUsd * KRW_RATE;
    return [0.01, 0.006, 0.003, 0, -0.003, -0.006, -0.01].map((r, i) => ({
      id: `lv_${i}`,
      side: r < 0 ? "bid" : r > 0 ? "ask" : "mid",
      px: Math.max(1, Math.round((b * (1 + r)) / 10000) * 10000),
    }));
  }, [G]);

  const toastPush = useCallback((msg, level = "info", priority = 1) => {
    if (!msg) return;
    setToastRaw((prev) => {
      const now = Date.now();
      if (prev && prev.msg === msg && now - prev.ts < 1400) return prev;
      if (prev && (prev.priority || 0) > priority && now - prev.ts < 900) return prev;
      return { msg, level, priority, ts: now };
    });
  }, []);

  useEffect(() => {
    if (!toast?.msg) return;
    const ttl = toast.level === "warn" ? 2600 : toast.level === "bad" ? 2800 : 2000;
    const id = setTimeout(() => setToastRaw(null), ttl);
    return () => clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!unlockFx) return;
    const id = setTimeout(() => setUnlockFx(null), 2100);
    return () => clearTimeout(id);
  }, [unlockFx]);

  const sendWs = (msg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  };

  const requestRoomList = useCallback(() => {
    const ws = setupWsRef.current;
    if (ws && ws.readyState === 1) {
      setRoomListLoading(true);
      ws.send(JSON.stringify({ type: "list_rooms" }));
    }
  }, []);

  useEffect(() => {
    if (screen !== "setup") {
      if (setupWsRetryRef.current) {
        clearTimeout(setupWsRetryRef.current);
        setupWsRetryRef.current = null;
      }
      if (setupWsRef.current) {
        try {
          setupWsRef.current.close();
        } catch (_e) {}
      }
      setupWsRef.current = null;
      setRoomListConnected(false);
      setRoomListLoading(false);
      return;
    }

    let closed = false;
    const connect = () => {
      if (closed || screen !== "setup") return;
      if (setupWsRef.current && setupWsRef.current.readyState <= 1) {
        requestRoomList();
        return;
      }
      setRoomListLoading(true);
      const ws = new WebSocket(DEFAULT_WS_URL);
      setupWsRef.current = ws;
      ws.onopen = () => {
        if (closed) return;
        setRoomListConnected(true);
        setRoomListLoading(true);
        ws.send(JSON.stringify({ type: "list_rooms" }));
      };
      ws.onmessage = (ev) => {
        if (closed) return;
        let m = null;
        try {
          m = JSON.parse(ev.data);
        } catch (_e) {
          return;
        }
        if (m?.type === "rooms_list") {
          setRoomList(Array.isArray(m.rooms) ? m.rooms : []);
          setRoomListLoading(false);
        }
      };
      ws.onerror = () => {
        if (closed) return;
        setRoomListConnected(false);
      };
      ws.onclose = () => {
        if (closed) return;
        setupWsRef.current = null;
        setRoomListConnected(false);
        setRoomListLoading(false);
        if (screen === "setup") {
          if (setupWsRetryRef.current) clearTimeout(setupWsRetryRef.current);
          setupWsRetryRef.current = setTimeout(() => connect(), 1500);
        }
      };
    };

    connect();
    return () => {
      closed = true;
      if (setupWsRetryRef.current) {
        clearTimeout(setupWsRetryRef.current);
        setupWsRetryRef.current = null;
      }
      if (setupWsRef.current) {
        try {
          setupWsRef.current.close();
        } catch (_e) {}
      }
      setupWsRef.current = null;
    };
  }, [screen, requestRoomList]);

  useEffect(() => {
    if (!multi?.enabled || !multi?.customMode || !multi?.serverUrl || (screen !== "lobby" && screen !== "game")) return;
    if (wsRef.current && wsRef.current.readyState <= 1) return;
    const ws = new WebSocket(multi.serverUrl);
    wsRef.current = ws;
    ws.onopen = () => {
      toastPush(`멀티 서버 연결됨 (${multi.serverUrl.replace(/^wss?:\/\//, "")})`, "good", 1);
      sendWs({
        type: "join",
        roomCode: multi.roomCode || "",
        clientId: clientIdRef.current,
        nickname: multi.nickname || "플레이어",
        startCash: G?.startCash || 100000000,
        pauseLimit: multi.pauseLimit || 3,
        endYear: G?.endYear || 2041,
        speed: spd || 1,
      });
    };
    ws.onmessage = (ev) => {
      let m = null;
      try {
        m = JSON.parse(ev.data);
      } catch (_e) {
        return;
      }
      if (!m) return;
      if (m.type === "room_state" && m.room) {
        setRoomState(m.room);
        setMulti((prev) => (prev && prev.enabled ? { ...prev, roomCode: m.room.code || prev.roomCode } : prev));
        setPlayers(
          (m.room.players || []).map((p) => ({
            id: p.id,
            nickname: p.nickname,
            icon: p.id === clientIdRef.current ? "🎮" : "🧑",
            isHost: !!p.isHost,
            ready: !!p.ready,
            pauseLeft: p.pauseLeft ?? 0,
            isBot: false,
            cash: 0,
            btc: 0,
            total: 0,
            roi: 0,
          })),
        );
        if (multi?.customMode) {
          if (typeof m.room.speed === "number") setSpd(m.room.speed);
          setG((prev) => (prev ? { ...prev, endYear: m.room.endYear || prev.endYear, pauseLimit: m.room.pauseLimit || prev.pauseLimit } : prev));
        }
      }
      if (m.type === "rooms_list") {
        setRoomList(Array.isArray(m.rooms) ? m.rooms : []);
      }
      if (m.type === "join_failed") {
        toastPush(m.reason || "방 입장 실패", "bad", 3);
        setRun(false);
        setScreen("setup");
        setMulti(null);
        setPlayers([]);
        setRoomState(null);
      }
      if (m.type === "start_game") {
        if (m.room) {
          setRoomState(m.room);
          if (typeof m.room.speed === "number") setSpd(m.room.speed);
          setG((prev) => (prev ? { ...prev, endYear: m.room.endYear || prev.endYear, pauseLimit: m.room.pauseLimit || prev.pauseLimit } : prev));
        }
        setScreen("game");
        setPausedBy(null);
        setRun(true);
      }
      if (m.type === "pause_game") {
        setPausedBy(m.by || "누군가");
        setRun(false);
      }
      if (m.type === "resume_game") {
        setPausedBy(null);
        setRun(true);
      }
      if (m.type === "kicked") {
        toastPush("방장에서 강퇴되었습니다", "bad", 3);
        setRun(false);
        setScreen("setup");
        setMulti(null);
        setPlayers([]);
        setRoomState(null);
      }
    };
    ws.onclose = () => {
      toastPush("멀티 서버 연결 종료", "warn", 1);
      wsRef.current = null;
    };
    ws.onerror = () => {
      toastPush("멀티 서버 연결 실패(주소/배포 상태 확인)", "bad", 3);
    };
    return () => {
      if (wsRef.current) wsRef.current.close();
      wsRef.current = null;
    };
  }, [multi, screen, toastPush, spd, G?.startCash, G?.endYear]);

  useEffect(() => {
    if (!G || screen !== "game") return;
    try {
      localStorage.setItem("btc_tycoon_save_v1", JSON.stringify({ ...G, multi, players }));
    } catch (_e) {}
  }, [G, screen, multi, players]);

  useEffect(() => {
    if (!G || screen !== "game") return;
    const key = `${G.year}-${G.month}-${G.day}`;
    setBtcHist((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.k === key && last.c === G.btcUsd) return prev;
      const prevClose = last ? last.c : G.btcPrev || G.btcUsd;
      const gSeed = G.gameSeed || 1;
      const gapSeed = gaussian(gSeed, "gap", G.year, G.month, G.day);
      const gap = clamp(gapSeed * (G.btcVol || 0.02) * 0.12, -0.06, 0.06);
      const o = prevClose * (1 + gap);
      const c = G.btcUsd;
      const baseVol = clamp((G.btcVol || 0.02) * (0.85 + Math.abs(gaussian(gSeed, "iv", G.year, G.month, G.day)) * 0.65), 0.004, 0.22);
      let hi = Math.max(o, c);
      let lo = Math.min(o, c);
      const steps = 18;
      let px = o;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const target = o + (c - o) * t;
        const nz = studentLike(gSeed, "intra", G.year, G.month, G.day, i);
        px += (target - px) * 0.42 + nz * baseVol * o * 0.22;
        hi = Math.max(hi, px);
        lo = Math.min(lo, px);
      }
      // Occasional extra wick spikes to create hammer/inverted/doji-like variety.
      const spikeRoll = rand01(gSeed, "spike", G.year, G.month, G.day);
      if (spikeRoll < 0.17) {
        hi *= 1 + baseVol * (0.25 + rand01(gSeed, "spikeU", G.year, G.month, G.day) * 1.8);
      } else if (spikeRoll < 0.34) {
        lo *= 1 - baseVol * (0.25 + rand01(gSeed, "spikeD", G.year, G.month, G.day) * 1.8);
      } else if (spikeRoll < 0.42) {
        hi *= 1 + baseVol * (0.18 + rand01(gSeed, "spikeU2", G.year, G.month, G.day) * 1.1);
        lo *= 1 - baseVol * (0.18 + rand01(gSeed, "spikeD2", G.year, G.month, G.day) * 1.1);
      }
      const h = Math.max(Math.max(o, c), hi);
      const l = Math.max(1000, Math.min(Math.min(o, c), lo));
      return [...prev.slice(-4999), { k: key, o, h, l, c }];
    });
  }, [G, screen]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("btc_tycoon_save_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const normalized = normalizeGame(parsed);
      if (normalized && normalized.startCash && normalized.year) setSavedGame(normalized);
    } catch (_e) {}
  }, []);

  useEffect(() => {
    if (!run || !G || eventModal || rankModal || pausedBy) return;
    const ms = { 1: 3500, 2: 2200, 4: 1300, 10: 700, 20: 350 }[spd] || 2200;
    const id = setInterval(() => {
      setG((p) => {
        if (!p) return p;
        const stats = ensureStats(p.stats, p.startCash);
        const prevY = p.year;
        const prevM = p.month;
        let { year: y, month: m, day: d } = p;
        d += 1;
        if (d > DIM[m - 1]) {
          d = 1;
          m += 1;
          if (m > 12) {
            m = 1;
            y += 1;
          }
        }

        if (y > (p.endYear || 2041)) {
          setRun(false);
          toastPush(`${p.endYear || 2041}년 게임 종료`, "warn", 2);
          return p;
        }
        const monthChanged = m !== prevM || y !== prevY;
        const yearChanged = y !== prevY;
        if (monthChanged) {
          setDateFx({ id: Date.now(), txt: yearChanged ? `🎉 ${y}년 진입` : `📅 ${m}월 시작`, color: yearChanged ? "#f59e0b" : "#22c55e" });
          setTimeout(() => setDateFx(null), 1200);
        }

        const sig = marketSignal(p.gameSeed || 1, y, m, d, p.scenario || makeScenario(p.gameSeed || 1));
        const macro = p.activeMacro;
        const macroMul = macro ? { btc: macro.btc || 0, eq: macro.eq || 0, re: macro.re || 0 } : { btc: 0, eq: 0, re: 0 };
        let marketPhase = p.marketPhase || null;
        if (d === 1) {
          if (marketPhase?.leftMonths > 0) {
            marketPhase = { ...marketPhase, leftMonths: marketPhase.leftMonths - 1 };
          } else {
            marketPhase = null;
          }
          if (!marketPhase) {
            const roll = h32(p.gameSeed || 1, y, m, "phase") / 0xffffffff;
            if (roll < 0.11) {
              marketPhase = { id: "sideways", name: "횡보장", btc: -0.002, eq: -0.001, re: -0.0006, leftMonths: 6 + Math.floor((roll * 100) % 4) };
            } else if (roll < 0.2) {
              marketPhase = { id: "bear", name: "약세장", btc: -0.012, eq: -0.007, re: -0.003, leftMonths: 8 + Math.floor((roll * 100) % 6) };
            } else if (roll < 0.24) {
              marketPhase = { id: "deep_bear", name: "대폭락장", btc: -0.022, eq: -0.012, re: -0.006, leftMonths: 5 + Math.floor((roll * 100) % 5) };
            }
            if (marketPhase) toastPush(`시장 레짐 전환: ${marketPhase.name}`);
          }
        }
        const hawkish = Math.max(0, getFedRate(y, m) - 4.25);
        const ratePenalty = {
          btc: -0.0025 * hawkish,
          eq: -0.0018 * hawkish,
          re: -0.0012 * hawkish,
        };
        const phasePenalty = marketPhase ? { btc: marketPhase.btc, eq: marketPhase.eq, re: marketPhase.re } : { btc: 0, eq: 0, re: 0 };
        const prevRet = p.btcPrevRet || 0;
        const prevVol = p.btcVol || 0.028;
        const prevEps = p.btcEps || 0;
        const prevTrend = p.btcTrend || 0;
        let btcRegime = p.btcRegime || "chop";
        let btcRegimeLeft = p.btcRegimeLeft || 0;
        let btcBlockStart = p.btcBlockStart || 0;
        let btcBlockOffset = p.btcBlockOffset || 0;
        let btcBlockRemain = p.btcBlockRemain || 0;
        const regimeTransition = {
          chop: [
            ["chop", 0.91], ["bull", 0.035], ["bear", 0.04], ["panic", 0.008], ["squeeze", 0.007],
          ],
          bull: [
            ["bull", 0.93], ["chop", 0.04], ["squeeze", 0.016], ["bear", 0.01], ["panic", 0.004],
          ],
          bear: [
            ["bear", 0.935], ["chop", 0.045], ["panic", 0.014], ["bull", 0.004], ["squeeze", 0.002],
          ],
          panic: [
            ["panic", 0.78], ["bear", 0.16], ["chop", 0.05], ["bull", 0.005], ["squeeze", 0.005],
          ],
          squeeze: [
            ["squeeze", 0.8], ["bull", 0.13], ["chop", 0.05], ["bear", 0.01], ["panic", 0.01],
          ],
        };
        if (btcRegimeLeft <= 0) {
          const tr = regimeTransition[btcRegime] || regimeTransition.chop;
          const u = rand01(p.gameSeed || 1, "btc_regime", y, m, d);
          let acc = 0;
          let nextReg = tr[0][0];
          for (let i = 0; i < tr.length; i++) {
            acc += tr[i][1];
            if (u <= acc) { nextReg = tr[i][0]; break; }
          }
          btcRegime = nextReg;
          const durMap = { chop: [3, 45], bear: [6, 55], bull: [5, 44], panic: [2, 12], squeeze: [2, 10] };
          const [lo, hi] = durMap[btcRegime] || [2, 16];
          btcRegimeLeft = lo + Math.floor(rand01(p.gameSeed || 1, "btc_regime_dur", y, m, d) * (hi - lo + 1));
        } else {
          btcRegimeLeft -= 1;
        }
        const reg = {
          chop: { drift: 0.0, volMul: 0.86, phi: 0.08, scale: 0.95, jumpExtra: 0.0 },
          bear: { drift: -0.0010, volMul: 1.16, phi: 0.17, scale: 1.06, jumpExtra: 0.004 },
          bull: { drift: 0.00085, volMul: 1.04, phi: 0.15, scale: 1.02, jumpExtra: 0.002 },
          panic: { drift: -0.0023, volMul: 1.42, phi: 0.23, scale: 1.18, jumpExtra: 0.009 },
          squeeze: { drift: 0.0021, volMul: 1.35, phi: 0.21, scale: 1.16, jumpExtra: 0.009 },
        }[btcRegime] || { drift: 0, volMul: 1, phi: 0.1, scale: 1, jumpExtra: 0 };
        // GARCH-like volatility update calibrated to real BTC daily return stats (2019+).
        const omega = 0.000018;
        const alpha = 0.19;
        const beta = 0.79;
        const prevVar = Math.max(0.00003, prevVol * prevVol);
        const newVar = clamp(omega + alpha * prevRet * prevRet + beta * prevVar, 0.00002, 0.07);
        const btcVol = clamp(Math.sqrt(newVar) * reg.volMul, 0.008, 0.11);
        // Slowly varying latent trend and persistence without deterministic wave patterns.
        const trendNoise = gaussian(p.gameSeed || 1, "btc_trend", y, m, d) * 0.00032;
        const btcTrend = clamp(prevTrend * 0.989 + trendNoise + reg.drift * 0.07, -0.0052, 0.0052);

        // Empirical block bootstrap from real BTC daily returns.
        if (btcBlockRemain <= 0) {
          const bucket = btcRegime === "bull" ? BTC_RET_BUCKETS.bull : btcRegime === "bear" || btcRegime === "panic" ? BTC_RET_BUCKETS.bear : BTC_RET_BUCKETS.chop;
          const pick = bucket[Math.floor(rand01(p.gameSeed || 1, "btc_block_start", y, m, d) * bucket.length)] ?? 0;
          const lenMap = { chop: [4, 30], bull: [5, 24], bear: [6, 28], panic: [2, 8], squeeze: [2, 7] };
          const [lo, hi] = lenMap[btcRegime] || [4, 20];
          const bl = lo + Math.floor(rand01(p.gameSeed || 1, "btc_block_len", y, m, d) * (hi - lo + 1));
          btcBlockStart = pick;
          btcBlockOffset = 0;
          btcBlockRemain = bl;
        } else {
          btcBlockOffset += 1;
          btcBlockRemain -= 1;
        }
        const srcIdx = (btcBlockStart + btcBlockOffset) % BTC_RET_REAL.length;
        const empiricalRet = BTC_RET_REAL[srcIdx] || 0;
        const empiricalScaled = empiricalRet * reg.scale;

        // Residual heavy-tail shock (small), keeps unpredictability without absurd 40% daily jumps.
        const tail = studentLike(p.gameSeed || 1, "btc_tail", y, m, d) * btcVol * 0.35;
        const eps = clamp(prevEps * 0.35 + tail, -0.12, 0.12);
        const drift = reg.drift + (p.scenario?.btcBias || 0) * 0.08 + macroMul.btc * 0.22 + phasePenalty.btc * 0.25 + ratePenalty.btc * 0.55 + btcTrend;
        const ar = clamp(prevRet * reg.phi, -0.08, 0.08);
        const jRoll = rand01(p.gameSeed || 1, "btc_jump", y, m, d);
        const jProb = clamp(0.003 + btcVol * 0.09 + reg.jumpExtra, 0.003, 0.035);
        const jMagSeed = rand01(p.gameSeed || 1, "btc_jump_mag", y, m, d);
        const dirSeed = gaussian(p.gameSeed || 1, "btc_jump_dir", y, m, d);
        const dirBias = (btcRegime === "bear" ? -0.35 : 0) + (btcRegime === "panic" ? -0.55 : 0) + (btcRegime === "bull" ? 0.28 : 0) + (btcRegime === "squeeze" ? 0.45 : 0);
        const jDir = (dirSeed + dirBias) >= 0 ? 1 : -1;
        const jump = jRoll < jProb ? jDir * (0.018 + Math.pow(jMagSeed, 0.72) * 0.06) : 0;
        const dailyRet = clamp(empiricalScaled + drift + ar + eps + jump, -0.18, 0.18);
        let btcUsd = Math.max(7000, p.btcUsd * (1 + dailyRet));
        const ev = EVENTS.find((e) => e.y === y && e.m === m && e.d === d);
        if (ev && !p.doneEvents.includes(`${ev.y}-${ev.m}-${ev.d}`)) {
          btcUsd *= Math.max(0.2, 1 + ev.shock);
          setEventModal({ ev });
          setRun(false);
          stats.eventCount += 1;
          if (!sfxMuted) beep(ev.et === "crash" ? 220 : 880, 0.06, 0.15, ev.et === "crash" ? "sawtooth" : "sine");
        }
        let rareEv = null;
        let memeEv = null;
        if (d === 1) {
          const roll = h32(p.gameSeed || 1, y, m, "rare") / 0xffffffff;
          const candidate = RARE_EVENTS.find((r2) => roll < r2.chance);
          if (candidate && !(p.newsLog || []).some((n) => n.id === candidate.id && n.y === y && n.m === m)) {
            rareEv = candidate;
            btcUsd *= Math.max(0.15, 1 + candidate.btc);
            setEventModal({ ev: { e: `⚠ 레어 이벤트: ${candidate.name}`, et: "rare" } });
            setRun(false);
            stats.eventCount += 1;
            stats.rareEventSurvived += 1;
          }
          if (!rareEv) {
            const roll2 = h32(p.gameSeed || 1, y, m, "meme") / 0xffffffff;
            let acc2 = 0;
            for (let i = 0; i < MEME_EVENTS.length; i++) {
              acc2 += MEME_EVENTS[i].chance;
              if (roll2 <= acc2) {
                memeEv = MEME_EVENTS[i];
                break;
              }
            }
            if (memeEv && !(p.newsLog || []).some((n) => n.id === memeEv.id && n.y === y && n.m === m)) {
              btcUsd *= Math.max(0.78, 1 + memeEv.btc);
              stats.eventCount += 1;
              toastPush(`밈 이벤트: ${memeEv.name}`, "warn", 1);
              if (!sfxMuted) beep(memeEv.btc >= 0 ? 980 : 240, 0.04, 0.08, memeEv.btc >= 0 ? "triangle" : "square");
            } else {
              memeEv = null;
            }
          }
        }

        let cash = p.cash;
        let btc = p.btc;
        let monthlyIncome = 0;
        if (d === 1) {
          cash += MONTHLY_SALARY;
          monthlyIncome += MONTHLY_SALARY;
          toastPush(`월급 ${fw(MONTHLY_SALARY)} 입금`);
          stats.monthsAlive += 1;
          if (btc > 0) stats.btcHoldMonths += 1;
          if (!sfxMuted) beep(1040, 0.05, 0.09, "triangle");
        }

        const depRate = getDepositRate(y, m);
        const loanRate = getLoanRate(y, m);

        const deposits = p.deposits.map((dep) => {
          const intr = monthlyInterest(dep.principal, depRate);
          cash += intr;
          stats.interestIncome += intr;
          return { ...dep, rate: depRate, totalInterest: dep.totalInterest + intr };
        });

        const loans = p.loans.map((loan) => ({ ...loan, rate: loanRate }));
        let monthlyLoanInterest = loans.reduce((sum, loan) => sum + monthlyInterest(loan.principal, loanRate), 0);

        const reDrift = projectedDrift("krRe", y, m) + sig.re + macroMul.re + phasePenalty.re + ratePenalty.re;
        const usEqDrift = projectedDrift("usEq", y, m) + sig.eq + macroMul.eq + phasePenalty.eq + ratePenalty.eq;
        const cmdDrift = projectedDrift("usEq", y, m) * 0.6 + sig.eq * 0.7 + macroMul.eq * 0.55 + phasePenalty.eq * 0.8;
        const apts = p.apts.map((a) => {
          const idNoise = Math.sin((y * 29 + m * 7 + d + a.id.charCodeAt(0)) * 0.13) * 0.0025;
          return { ...a, cur: a.cur * (1 + a.g / 24 + reDrift + idNoise) };
        });
        const stocks = p.stocks.map((s) => {
          const idNoise = Math.sin((y * 31 + m * 11 + d + s.id.charCodeAt(0)) * 0.17) * 0.004;
          return { ...s, cur: s.cur * (1 + s.g / 20 + usEqDrift + idNoise) };
        });
        const commodities = (p.commodities || []).map((c) => {
          const idNoise = Math.sin((y * 27 + m * 13 + d + c.id.charCodeAt(0)) * 0.21) * (c.vol || 0.01);
          return { ...c, cur: c.cur * (1 + c.g / 22 + cmdDrift + idNoise) };
        });
        stats.maxStockKinds = Math.max(stats.maxStockKinds, stocks.filter((s) => s.shares > 0).length);
        if (d === 1) {
          // 배당 주식: 월급과 같은 월정산 시점에 월배당으로 지급
          let monthlyDiv = 0;
          stocks.forEach((s) => {
            if (s.divYield > 0) monthlyDiv += s.cur * s.shares * (s.divYield / 12);
          });
          if (monthlyDiv > 0) {
            cash += monthlyDiv;
            monthlyIncome += monthlyDiv;
            toastPush(`월배당 ${fw(monthlyDiv)} 입금`);
            if (!sfxMuted) beep(1320, 0.04, 0.08, "triangle");
          }
        }
        if (d === 1 && [3, 6, 9, 12].includes(m)) {
          const currentTotal =
            cash +
            btc * btcUsd * KRW_RATE +
            apts.reduce((sum, a) => sum + a.cur, 0) +
            stocks.reduce((sum, s) => sum + s.cur * s.shares, 0) +
            commodities.reduce((sum, c) => sum + c.cur * c.qty, 0);
          const board = buildRivalBoard(p.startCash, y, m, btcUsd, currentTotal, p.gameSeed || 1);
          setLastRank({ y, m, rank: board.myRank, total: board.all.length, point: 0 });
          toastPush(`분기 ${board.myRank}위`);
          setRankInspectId(null);
          setRankModal({ y, m, rank: board.myRank, total: board.all.length, point: 0, rows: board.all.slice(0, 6) });
          setRun(false);
        }

        let spotOrders = [...(p.spotOrders || [])];
        let futOrders = [...(p.futOrders || [])];
        const futPositions = [...(p.futures || [])];
        // 현물 지정가 체결
        const remainSpot = [];
        spotOrders.forEach((od) => {
          const px = od.priceKrw / KRW_RATE;
          const hit = od.side === "buy" ? btcUsd <= px : btcUsd >= px;
          if (!hit) {
            remainSpot.push(od);
            return;
          }
          if (od.side === "buy") {
            if (cash >= od.amountKrw) {
              const q = od.amountKrw / (btcUsd * KRW_RATE);
              btc += q;
              cash -= od.amountKrw;
              stats.spotTrades += 1;
              toastPush(`지정가 매수 체결 ${q.toFixed(4)} BTC`);
            }
          } else if (btc > 0) {
            const q = Math.min(btc, od.qtyBtc);
            btc -= q;
            cash += q * btcUsd * KRW_RATE;
            stats.spotTrades += 1;
            toastPush(`지정가 매도 체결 ${q.toFixed(4)} BTC`);
          }
        });
        spotOrders = remainSpot;

        // 선물 지정가 진입 체결
        const remainFutOrders = [];
        futOrders.forEach((od) => {
          const px = od.priceKrw / KRW_RATE;
          const hit = od.side === "long" ? btcUsd <= px : btcUsd >= px;
          if (!hit) {
            remainFutOrders.push(od);
            return;
          }
          if (cash >= od.margin) {
            const liq = od.side === "long" ? btcUsd * (1 - 0.9 / od.lev) : btcUsd * (1 + 0.9 / od.lev);
            futPositions.push({
              side: od.side,
              lev: od.lev,
              margin: od.margin,
              entry: btcUsd,
              liq,
              stopLoss: od.stopLoss,
              takeProfit: od.takeProfit,
            });
            cash -= od.margin;
            toastPush(`선물 지정가 ${od.side === "long" ? "롱" : "숏"} 체결`);
          }
        });
        futOrders = remainFutOrders;

        const futs = futPositions.filter((f) => {
          const stopHit = f.stopLoss
            ? (f.side === "long" ? btcUsd <= f.stopLoss : btcUsd >= f.stopLoss)
            : false;
          const tpHit = f.takeProfit
            ? (f.side === "long" ? btcUsd >= f.takeProfit : btcUsd <= f.takeProfit)
            : false;
          if (stopHit) {
            const r = f.side === "long" ? (btcUsd - f.entry) / f.entry : (f.entry - btcUsd) / f.entry;
            const pnl = f.margin * f.lev * r;
            cash += Math.max(0, f.margin + pnl);
            stats.futClosed += 1;
            stats.stopLossHits += 1;
            stats.bestFutRoi = Math.max(stats.bestFutRoi, r * f.lev * 100);
            toastPush("선물 스탑로스 발동");
            return false;
          }
          if (tpHit) {
            const r = f.side === "long" ? (btcUsd - f.entry) / f.entry : (f.entry - btcUsd) / f.entry;
            const pnl = f.margin * f.lev * r;
            cash += Math.max(0, f.margin + pnl);
            stats.futClosed += 1;
            stats.bestFutRoi = Math.max(stats.bestFutRoi, r * f.lev * 100);
            toastPush("선물 테이크프로핏 체결");
            return false;
          }
          const liq = f.side === "long" ? btcUsd <= f.liq : btcUsd >= f.liq;
          if (liq) {
            toastPush("선물 포지션 강제청산");
            stats.liqHits += 1;
            if (!sfxMuted) beep(180, 0.08, 0.14, "square");
          }
          return !liq;
        });

        const futPnl = futs.reduce((sum, f) => {
          const r = f.side === "long" ? (btcUsd - f.entry) / f.entry : (f.entry - btcUsd) / f.entry;
          return sum + f.margin * f.lev * r;
        }, 0);

        const aptVal = apts.reduce((sum, a) => sum + a.cur, 0);
        const stVal = stocks.reduce((sum, s) => sum + s.cur * s.shares, 0);
        const cmdVal = commodities.reduce((sum, c) => sum + c.cur * c.qty, 0);
        const btcVal = btc * btcUsd * KRW_RATE;
        let loanVal = loans.reduce((sum, l) => sum + l.principal, 0);
        const depVal = deposits.reduce((sum, d2) => sum + d2.principal, 0);
        // 월급+배당 흐름보다 이자가 크면 담보 일부 강제매각 후 원금 상환
        if (d === 1 && monthlyLoanInterest > monthlyIncome && loanVal > 0) {
          const avgLoanRate = loanRate > 0 ? loanRate : 4.5;
          let reducePrincipalNeed = ((monthlyLoanInterest - monthlyIncome) * 12) / (avgLoanRate / 100);
          if (reducePrincipalNeed > 0) {
            toastPush("경고: 이자>월현금흐름, 자동 담보청산 실행", "warn", 2);
            // 0) 원자재
            for (let i = 0; i < commodities.length && reducePrincipalNeed > 0; i++) {
              const c = commodities[i];
              const val = c.cur * c.qty;
              if (val <= 0) continue;
              const sell = Math.min(val, reducePrincipalNeed);
              const q = Math.min(c.qty, Math.ceil(sell / c.cur));
              const realized = q * c.cur;
              c.qty -= q;
              cash += realized;
              reducePrincipalNeed -= realized;
            }
            // 1) BTC
            if (reducePrincipalNeed > 0 && btc > 0) {
              const sellKrw = Math.min(reducePrincipalNeed, btc * btcUsd * KRW_RATE);
              const q = sellKrw / (btcUsd * KRW_RATE);
              btc = Math.max(0, btc - q);
              cash += sellKrw;
              reducePrincipalNeed -= sellKrw;
            }
            // 2) 주식
            for (let i = 0; i < stocks.length && reducePrincipalNeed > 0; i++) {
              const s = stocks[i];
              const val = s.cur * s.shares;
              if (val <= 0) continue;
              const sell = Math.min(val, reducePrincipalNeed);
              const q = Math.min(s.shares, Math.ceil(sell / s.cur));
              const realized = q * s.cur;
              s.shares -= q;
              cash += realized;
              reducePrincipalNeed -= realized;
            }
            // 3) 부동산
            if (reducePrincipalNeed > 0 && apts.length > 0) {
              apts.sort((a, b) => a.cur - b.cur);
              while (reducePrincipalNeed > 0 && apts.length > 0) {
                const sold = apts.shift();
                if (!sold) break;
                cash += sold.cur;
                reducePrincipalNeed -= sold.cur;
              }
            }
            // 4) 예금
            for (let i = 0; i < deposits.length && reducePrincipalNeed > 0; i++) {
              const dep = deposits[i];
              const w = Math.min(dep.principal, reducePrincipalNeed);
              dep.principal -= w;
              cash += w;
              reducePrincipalNeed -= w;
            }
            for (let i = deposits.length - 1; i >= 0; i--) {
              if ((deposits[i]?.principal || 0) <= 0) deposits.splice(i, 1);
            }
            // 확보 현금으로 원금 상환
            let repayPool = cash;
            for (let i = 0; i < loans.length && repayPool > 0; i++) {
              const pay = Math.min(loans[i].principal, repayPool);
              loans[i].principal -= pay;
              repayPool -= pay;
              cash -= pay;
              stats.repaidPrincipal += pay;
            }
            for (let i = loans.length - 1; i >= 0; i--) {
              if (loans[i].principal <= 0) loans.splice(i, 1);
            }
            loanVal = loans.reduce((sum, l) => sum + l.principal, 0);
            monthlyLoanInterest = loans.reduce((sum, loan) => sum + monthlyInterest(loan.principal, loanRate), 0);
          }
        }

        // 월 이자 일괄 차감 (월급+배당 후 1회)
        if (d === 1 && monthlyLoanInterest > 0) {
          if (cash < monthlyLoanInterest) {
            // 부족분을 담보 매각으로 충당
            let need = monthlyLoanInterest - cash;
            for (let i = 0; i < commodities.length && need > 0; i++) {
              const c = commodities[i];
              const val = c.cur * c.qty;
              if (val <= 0) continue;
              const sell = Math.min(val, need);
              const q = Math.min(c.qty, Math.ceil(sell / c.cur));
              const realized = q * c.cur;
              c.qty -= q;
              cash += realized;
              need -= realized;
            }
            if (need > 0 && btc > 0) {
              const sell = Math.min(need, btc * btcUsd * KRW_RATE);
              const q = sell / (btcUsd * KRW_RATE);
              btc = Math.max(0, btc - q);
              cash += sell;
              need -= sell;
            }
            for (let i = 0; i < stocks.length && need > 0; i++) {
              const s = stocks[i];
              const val = s.cur * s.shares;
              if (val <= 0) continue;
              const sell = Math.min(val, need);
              const q = Math.min(s.shares, Math.ceil(sell / s.cur));
              const realized = q * s.cur;
              s.shares -= q;
              cash += realized;
              need -= realized;
            }
            while (need > 0 && apts.length > 0) {
              const sold = apts.shift();
              if (!sold) break;
              cash += sold.cur;
              need -= sold.cur;
            }
          }
          const paid = Math.min(cash, monthlyLoanInterest);
          cash -= paid;
          loans.forEach((loan) => {
            const intr = monthlyInterest(loan.principal, loanRate);
            loan.totalInterest += intr;
          });
        }
        // 담보: 현금 + 예금 + BTC + 주식 + 부동산
        const collateral = cash + depVal + btcVal + stVal + aptVal + cmdVal;
        const maxLoanByLtv = collateral * 0.6;
        if (loanVal > maxLoanByLtv && loanVal > 0) {
          let repayNeed = loanVal - maxLoanByLtv;
          // 0) 예금 자동 해지
          if (repayNeed > 0 && deposits.length > 0) {
            for (let i = 0; i < deposits.length && repayNeed > 0; i++) {
              const dep = deposits[i];
              if (!dep || dep.principal <= 0) continue;
              const w = Math.min(dep.principal, repayNeed);
              dep.principal -= w;
              cash += w;
              repayNeed -= w;
            }
            for (let i = deposits.length - 1; i >= 0; i--) {
              if ((deposits[i]?.principal || 0) <= 0) deposits.splice(i, 1);
            }
          }
          // 1) BTC 자동 청산
          if (repayNeed > 0 && btc > 0) {
            const sellKrw = Math.min(repayNeed, btc * btcUsd * KRW_RATE);
            const q = sellKrw / (btcUsd * KRW_RATE);
            btc = Math.max(0, btc - q);
            cash += sellKrw;
            repayNeed -= sellKrw;
          }
          // 2) 주식 자동 청산
          if (repayNeed > 0) {
            for (let i = 0; i < stocks.length && repayNeed > 0; i++) {
              const s = stocks[i];
              const val = s.cur * s.shares;
              if (val <= 0) continue;
              const sellKrw = Math.min(repayNeed, val);
              const sellShares = Math.min(s.shares, Math.ceil(sellKrw / s.cur));
              const realized = sellShares * s.cur;
              s.shares -= sellShares;
              cash += realized;
              repayNeed -= realized;
            }
          }
          // 3) 부동산 자동 청산 (채 단위)
          if (repayNeed > 0 && apts.length > 0) {
            apts.sort((a, b) => a.cur - b.cur);
            while (repayNeed > 0 && apts.length > 0) {
              const sold = apts.shift();
              if (!sold) break;
              cash += sold.cur;
              repayNeed -= sold.cur;
            }
          }
          // 3.5) 원자재 자동 청산
          if (repayNeed > 0) {
            for (let i = 0; i < commodities.length && repayNeed > 0; i++) {
              const c = commodities[i];
              const val = c.cur * c.qty;
              if (val <= 0) continue;
              const sell = Math.min(val, repayNeed);
              const q = Math.min(c.qty, Math.ceil(sell / c.cur));
              const realized = q * c.cur;
              c.qty -= q;
              cash += realized;
              repayNeed -= realized;
            }
          }
          // 현금으로 대출 원금 상환
          let repayCash = Math.min(cash, loanVal - maxLoanByLtv);
          for (let i = 0; i < loans.length && repayCash > 0; i++) {
            const pay = Math.min(loans[i].principal, repayCash);
            loans[i].principal -= pay;
            repayCash -= pay;
            cash -= pay;
            stats.repaidPrincipal += pay;
          }
          for (let i = loans.length - 1; i >= 0; i--) {
            if (loans[i].principal <= 0) loans.splice(i, 1);
          }
          loanVal = loans.reduce((sum, l) => sum + l.principal, 0);
          toastPush("담보가치 하락: 자동 담보 청산/상환", "warn", 2);
          if (!sfxMuted) beep(260, 0.07, 0.1, "square");
        }

        cash = Math.max(0, cash);
        const postAptVal = apts.reduce((sum, a) => sum + a.cur, 0);
        const postStVal = stocks.reduce((sum, s) => sum + s.cur * s.shares, 0);
        const postCmdVal = commodities.reduce((sum, c) => sum + c.cur * c.qty, 0);
        const postBtcVal = btc * btcUsd * KRW_RATE;
        const total = cash + postBtcVal + postAptVal + postStVal + postCmdVal + depVal - loanVal + futs.reduce((sum, f) => sum + f.margin, 0) + futPnl;
        stats.maxTotal = Math.max(stats.maxTotal, total);
        stats.minTotal = Math.min(stats.minTotal, total);
        const dd = stats.maxTotal > 0 ? ((stats.maxTotal - total) / stats.maxTotal) * 100 : 0;
        stats.maxDrawdown = Math.max(stats.maxDrawdown, dd);
        if (stats.maxDrawdown >= 35 && total >= p.startCash) stats.recoveredFromDrawdown = true;
        if (Math.abs(sig.btc) >= 0.01) stats.highVolSurvived = true;
        if (total <= 0) {
          setRun(false);
          toastPush("파산: 게임 탈락", "bad", 3);
        }

        const next = {
          ...p,
          year: y,
          month: m,
          day: d,
          btcPrev: p.btcUsd,
          btcUsd,
          btcPrevRet: dailyRet,
          btcVol,
          btcEps: eps,
          btcTrend,
          btcRegime,
          btcRegimeLeft,
          btcBlockStart,
          btcBlockOffset,
          btcBlockRemain,
          cash,
          btc,
          deposits,
          loans,
          apts,
          stocks,
          commodities,
          futures: futs,
          spotOrders,
          futOrders,
          points: 0,
          marketPhase,
          stats,
          total,
        };

        if (p.activeMacro && monthChanged) {
          const left = (p.activeMacro.leftMonths || 0) - 1;
          next.activeMacro = left > 0 ? { ...p.activeMacro, leftMonths: left } : null;
        } else {
          next.activeMacro = p.activeMacro || null;
        }

        if (rareEv) {
          next.activeMacro = { id: rareEv.id, name: rareEv.name, btc: rareEv.btc / 6, eq: rareEv.eq / 6, re: rareEv.re / 6, leftMonths: rareEv.months };
          next.newsLog = [...(p.newsLog || []), { id: rareEv.id, title: rareEv.name, y, m, d, et: "rare" }];
        } else {
          next.newsLog = p.newsLog || [];
        }
        if (memeEv) {
          next.newsLog = [...(next.newsLog || []), { id: memeEv.id, title: memeEv.name, y, m, d, et: "meme" }];
        }

        if (ev) {
          next.doneEvents = [...next.doneEvents, `${ev.y}-${ev.m}-${ev.d}`];
          next.newsLog = [...(next.newsLog || []), { id: `event_${ev.y}_${ev.m}_${ev.d}`, title: ev.e, y, m, d, et: ev.et }];
        }

        const unlocked = evaluateUnlocks(next);
        next.ownedTags = unlocked.ownedTags;
        next.collection = unlocked.collection;
        if (unlocked.tagsUnlocked.length > 0) {
          const t = unlocked.tagsUnlocked[0];
          const ts = TAG_TIER_STYLE[t.tier] || TAG_TIER_STYLE.common;
          toastPush(`새 태그 획득: ${t.icon} ${t.name}`, "good", 2);
          setUnlockFx({ msg: `태그 해금 · ${t.icon} ${t.name}`, color: ts.color, tier: t.tier });
        }
        if (unlocked.collUnlocked.length > 0) {
          const c = unlocked.collUnlocked[0];
          const cc = c.rarity === "전설" ? "#c084fc" : c.rarity === "레어" ? "#22c55e" : "#94a3b8";
          toastPush(`수집 해금: ${c.icon} ${c.name}`, "good", 2);
          setUnlockFx({ msg: `도감 등록 · ${c.icon} ${c.name}`, color: cc, tier: c.rarity === "전설" ? "legendary" : c.rarity === "레어" ? "epic" : "common" });
        }
        if (next.ownedTags.length >= TAG_DEFS.length && next.collection.length >= COLLECTIBLES.length && !next.codexCrown) {
          next.codexCrown = true;
          toastPush("도감 100% 달성: 오버클록 수집가 칭호 해금", "good", 3);
          setUnlockFx({ msg: "🏆 도감 완성! 오버클록 수집가", color: "#c084fc", tier: "legendary" });
        }

        if (multi?.enabled) {
          if (multi?.customMode) {
            setPlayers((prevPlayers) =>
              prevPlayers.map((pl) => {
                if (pl.id === clientIdRef.current) {
                  return { ...pl, cash: next.cash, btc: next.btc, total: next.total, roi: ((next.total - next.startCash) / next.startCash) * 100 };
                }
                return pl;
              }),
            );
          } else {
            setPlayers((prevPlayers) =>
              prevPlayers.map((pl) => {
                if (pl.id === clientIdRef.current) return { ...pl, cash: next.cash, btc: next.btc, total: next.total, roi: ((next.total - next.startCash) / next.startCash) * 100 };
                return botTick(pl, btcUsd, y, m, d, next.startCash);
              }),
            );
          }
        }
        return next;
      });
    }, ms);
    return () => clearInterval(id);
  }, [run, spd, G, eventModal, sfxMuted, multi, rankModal, pausedBy]);

  if (screen === "setup") {
    return (
      <Setup
        canContinue={!!savedGame}
        roomList={roomList}
        roomListLoading={roomListLoading}
        roomListConnected={roomListConnected}
        onRefreshRooms={requestRoomList}
        onContinue={() => {
          if (!savedGame) return;
          const g2 = normalizeGame(savedGame);
          setG(g2);
          setMulti(g2.multi || null);
          setPlayers(g2.players || []);
          setBtcHist([{ k: `${g2.year}-${g2.month}-${g2.day}`, o: g2.btcPrev || g2.btcUsd, h: g2.btcUsd, l: g2.btcUsd, c: g2.btcUsd }]);
          setScreen("game");
        }}
        onStart={({ startCash, mode, nickname, endYear, pauseLimit, fillBots, customMode, roomCode }) => {
          const gameSeed = (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
          const bp = getBtcUsd(2026, 3, 11);
          const baseGame = normalizeGame({
            year: 2026,
            month: 3,
            day: 11,
            gameSeed,
            scenario: makeScenario(gameSeed),
            endYear,
            myNick: nickname,
            pauseLimit,
            startCash,
            cash: startCash,
            btc: 0,
            btcUsd: bp,
            btcPrev: bp,
            apts: [],
            stocks: [],
            commodities: [],
            futures: [],
            spotOrders: [],
            futOrders: [],
            deposits: [],
            loans: [],
            points: 0,
            ownedTags: [],
            collection: [],
            doneEvents: [],
            total: startCash,
            multi: mode === "multi" ? { enabled: true, nickname, fillBots, customMode, roomCode, serverUrl: DEFAULT_WS_URL, pauseLimit } : null,
            players: [],
          });
          setG(baseGame);
          if (mode === "multi") {
            const me = { id: clientIdRef.current, nickname, icon: "🎮", isHost: true, pauseLeft: pauseLimit, isBot: false, ready: false, cash: startCash, btc: 0, total: startCash, roi: 0 };
            const bots = fillBots ? makeBots(customMode ? 0 : 5, startCash).map((b) => ({ ...b, pauseLeft: 0 })) : [];
            setPlayers([me, ...bots]);
            setMulti({ enabled: true, nickname, fillBots, customMode, pauseLimit, roomCode, serverUrl: DEFAULT_WS_URL });
            setRoomState({ code: roomCode || null, endYear, pauseLimit, speed: 1, players: [me, ...bots], hostId: me.id });
            setScreen("lobby");
          } else {
            setPlayers([]);
            setMulti(null);
            setRoomState(null);
            setScreen("game");
          }
          setBtcHist([{ k: "2026-3-11", o: bp, h: bp, l: bp, c: bp }]);
        }}
      />
    );
  }

  if (screen === "lobby") {
    return (
      <Lobby
        players={players}
        roomState={roomState}
        onBack={() => {
          setScreen("setup");
          setMulti(null);
          setPlayers([]);
          setRoomState(null);
        }}
        onReady={() => {
          if (multi?.customMode) {
            const me = players.find((x) => x.id === clientIdRef.current);
            sendWs({ type: "ready", ready: !(me?.ready || false) });
            return;
          }
          setPlayers((p) => p.map((x) => (x.id === clientIdRef.current ? { ...x, ready: !x.ready } : x)));
        }}
        onStart={() => {
          if (multi?.customMode) {
            sendWs({ type: "start" });
            return;
          }
          setPlayers((p) => p.map((x) => (x.id === clientIdRef.current ? { ...x, ready: true } : x)));
          setRun(true);
          setScreen("game");
        }}
        onApplySettings={({ endYear, pauseLimit, speed }) => {
          if (multi?.customMode) {
            sendWs({ type: "update_settings", endYear, pauseLimit, speed });
            return;
          }
          setPlayers((p) => p.map((x) => ({ ...x, pauseLeft: Math.min(x.pauseLeft ?? pauseLimit, pauseLimit) })));
          setG((prev) => (prev ? { ...prev, endYear, pauseLimit } : prev));
          setSpd(speed || 1);
          setRoomState((rs) => ({ ...(rs || {}), endYear, pauseLimit, speed }));
        }}
        onKick={(targetId) => {
          if (multi?.customMode) {
            sendWs({ type: "kick", targetId });
            return;
          }
          setPlayers((p) => p.filter((x) => x.id !== targetId));
        }}
      />
    );
  }

  if (!G) return null;

  const dayPct = ((G.btcUsd - G.btcPrev) / (G.btcPrev || 1)) * 100;
  const elapsedMonths = Math.max(0, (G.year - 2026) * 12 + (G.month - 3));
  const investedBase = G.startCash + elapsedMonths * MONTHLY_SALARY;
  const roi = investedBase > 0 ? ((G.total - investedBase) / investedBase) * 100 : 0;
  const futPnl = G.futures.reduce((sum, f) => {
    const r = f.side === "long" ? (G.btcUsd - f.entry) / f.entry : (f.entry - G.btcUsd) / f.entry;
    return sum + f.margin * f.lev * r;
  }, 0);

  const aptVal = G.apts.reduce((sum, a) => sum + a.cur, 0);
  const stVal = G.stocks.reduce((sum, s) => sum + s.cur * s.shares, 0);
  const cmdVal = (G.commodities || []).reduce((sum, c) => sum + c.cur * c.qty, 0);
  const filteredAptCatalog = APTS_WITH_AREA.filter((a) => matchAptFilters(a, aptRegionFilter, aptTypeFilter));
  const filteredStockCatalog = STOCKS.filter((s) => matchStockFilters(s, stockMarketFilter, stockTypeFilter));
  const depVal = G.deposits.reduce((sum, d) => sum + d.principal, 0);
  const loanVal = G.loans.reduce((sum, l) => sum + l.principal, 0);

  const num = (v) => parseFloat(String(v || "").replace(/,/g, "")) || 0;
  const placeSpotOrder = () => {
    const side = spotForm.side;
    const type = spotForm.type;
    const px = num(spotForm.priceKrw);
    if (type === "market") {
      setG((p) => {
        const bkrw = p.btcUsd * KRW_RATE;
        const orderPx = bkrw;
        const qtyByInput = spotForm.inputMode === "qty" ? Math.max(0, num(spotForm.qtyBtc)) : Math.max(0, num(spotForm.totalKrw)) / orderPx;
        const totalByInput = spotForm.inputMode === "total" ? Math.max(0, num(spotForm.totalKrw)) : Math.max(0, num(spotForm.qtyBtc)) * orderPx;
        if (side === "buy") {
          const amount = totalByInput;
          const q = qtyByInput;
          if (amount <= 0 || q <= 0 || amount > p.cash) return p;
          toastPush(`시장가 매수 ${q.toFixed(4)} BTC`);
          const stats = ensureStats(p.stats, p.startCash);
          stats.spotTrades += 1;
          return { ...p, cash: p.cash - amount, btc: p.btc + q, stats };
        }
        const q = qtyByInput;
        if (q <= 0 || q > p.btc) return p;
        toastPush(`시장가 매도 ${q.toFixed(4)} BTC`);
        const stats = ensureStats(p.stats, p.startCash);
        stats.spotTrades += 1;
        return { ...p, btc: p.btc - q, cash: p.cash + q * orderPx, stats };
      });
      return;
    }
    if (px <= 0) return;
    setG((p) => {
      const qtyByInput = spotForm.inputMode === "qty" ? Math.max(0, num(spotForm.qtyBtc)) : Math.max(0, num(spotForm.totalKrw)) / px;
      const totalByInput = spotForm.inputMode === "total" ? Math.max(0, num(spotForm.totalKrw)) : Math.max(0, num(spotForm.qtyBtc)) * px;
      const od =
        side === "buy"
          ? { id: `s_${Date.now()}`, side, priceKrw: px, amountKrw: totalByInput, qtyBtc: qtyByInput }
          : { id: `s_${Date.now()}`, side, priceKrw: px, qtyBtc: qtyByInput, amountKrw: totalByInput };
      if ((od.amountKrw || od.qtyBtc || 0) <= 0) return p;
      toastPush("현물 지정가 주문 접수");
      return { ...p, spotOrders: [...(p.spotOrders || []), od] };
    });
  };

  const placeFuturesOrder = () => {
    const side = futForm.side;
    const type = futForm.type;
    const levRaw = Math.floor(num(futForm.lev) || 0);
    if (levRaw < 2 || levRaw > 25) {
      toastPush("레버리지는 2x~25x로 입력", "warn", 2);
      return;
    }
    const lev = clamp(levRaw, 2, 25);
    const margin = Math.max(0, num(futForm.marginKrw));
    const stopPct = clamp(num(futForm.stopLoss), 0, 90);
    const tpPct = clamp(num(futForm.takeProfit), 0, 300);
    if (margin < 100000) return;
    if (type === "market") {
      setG((p) => {
        if (margin > p.cash) return p;
        const entry = p.btcUsd;
        const liq = side === "long" ? entry * (1 - 0.9 / lev) : entry * (1 + 0.9 / lev);
        const stopLoss = stopPct > 0 ? (side === "long" ? entry * (1 - stopPct / 100) : entry * (1 + stopPct / 100)) : null;
        const takeProfit = tpPct > 0 ? (side === "long" ? entry * (1 + tpPct / 100) : entry * (1 - tpPct / 100)) : null;
        toastPush(`선물 ${side === "long" ? "롱" : "숏"} ${lev}x 진입`);
        return { ...p, cash: p.cash - margin, futures: [...p.futures, { side, lev, margin, entry, liq, stopLoss, takeProfit }] };
      });
      return;
    }
    const px = num(futForm.priceKrw);
    if (px <= 0) return;
    setG((p) => {
      if (margin > p.cash) return p;
      const stopLoss = stopPct > 0 ? (side === "long" ? (px / KRW_RATE) * (1 - stopPct / 100) : (px / KRW_RATE) * (1 + stopPct / 100)) : null;
      const takeProfit = tpPct > 0 ? (side === "long" ? (px / KRW_RATE) * (1 + tpPct / 100) : (px / KRW_RATE) * (1 - tpPct / 100)) : null;
      const od = { id: `f_${Date.now()}`, side, lev, margin, priceKrw: px, stopLoss, takeProfit };
      toastPush("선물 지정가 주문 접수");
      return { ...p, futOrders: [...(p.futOrders || []), od] };
    });
  };

  const closeFuture = (idx) => {
    setG((p) => {
      const f = p.futures[idx];
      if (!f) return p;
      const r = f.side === "long" ? (p.btcUsd - f.entry) / f.entry : (f.entry - p.btcUsd) / f.entry;
      const pnl = f.margin * f.lev * r;
      const refund = Math.max(0, f.margin + pnl);
      const stats = ensureStats(p.stats, p.startCash);
      stats.futClosed += 1;
      stats.bestFutRoi = Math.max(stats.bestFutRoi, r * f.lev * 100);
      toastPush(`선물 청산 ${fw(pnl)}`);
      return { ...p, cash: p.cash + refund, futures: p.futures.filter((_, i) => i !== idx), stats };
    });
  };

  const collateralForLoan = G.cash + depVal + G.btc * G.btcUsd * KRW_RATE + stVal + aptVal + cmdVal;
  const loanLimit = collateralForLoan * 0.6;
  const availableLoan = Math.max(0, loanLimit - loanVal);
  const loanBySlider = Math.floor((availableLoan * loanPct) / 100 / 100000) * 100000;
  const repayBySlider = Math.floor((Math.min(loanVal, G.cash) * repayPct) / 100 / 100000) * 100000;
  const depJoinBySlider = Math.floor((G.cash * depJoinPct) / 100 / 100000) * 100000;
  const depWdBySlider = Math.floor((depVal * depWdPct) / 100 / 100000) * 100000;
  const pastEvents = [...(G.newsLog || [])].reverse().slice(0, 40);
  const fedRate = getFedRate(G.year, G.month);
  const exRateNow = getExRate(G.year, G.month, G.day);
  let py = G.year;
  let pm = G.month - 1;
  if (pm < 1) {
    pm = 12;
    py -= 1;
  }
  const exRatePrev = getExRate(py, pm, Math.min(G.day, DIM[pm - 1] || 28));
  const exMom = exRatePrev > 0 ? ((exRateNow - exRatePrev) / exRatePrev) * 100 : 0;
  const mkNow = marketSignal(G.gameSeed || 1, G.year, G.month, G.day, G.scenario || makeScenario(G.gameSeed || 1));
  const riskOn = mkNow.eq + mkNow.btc * 0.6 - Math.max(0, mkNow.re * 0.2);
  const macroRows = [
    { k: "미국 연준금리", v: `${fedRate.toFixed(2)}%`, c: "#60a5fa", d: fedRate >= 5 ? "긴축" : fedRate <= 3 ? "완화" : "중립" },
    { k: "한국 기준금리", v: `${getBaseRate(G.year, G.month).toFixed(2)}%`, c: "#22c55e", d: "연 8회 결정" },
    { k: "USD/KRW", v: `₩${comma(exRateNow)}`, c: exMom >= 0 ? "#ef4444" : "#22c55e", d: `전월 대비 ${fp(exMom)}` },
    { k: "위험자산 모멘텀", v: riskOn >= 0 ? "Risk-On" : "Risk-Off", c: riskOn >= 0 ? "#22c55e" : "#ef4444", d: `신호 ${riskOn >= 0 ? "+" : ""}${riskOn.toFixed(2)}` },
    { k: "현재 시장 레짐", v: G.marketPhase?.name || "중립", c: G.marketPhase ? "#f59e0b" : "#94a3b8", d: G.marketPhase ? `${G.marketPhase.leftMonths}개월 남음` : "레짐 없음" },
    { k: "레어 이벤트 위험도", v: `${((RARE_EVENTS.reduce((s, x) => s + x.chance, 0)) * 100).toFixed(2)}%/월`, c: "#c084fc", d: "대공황/핵전쟁 포함" },
  ];
  const eventRiskPct = (RARE_EVENTS.reduce((s, x) => s + x.chance, 0)) * 100;
  const phaseProbs = regimeProbabilities({
    phaseName: G.marketPhase?.name || "중립",
    fedRate,
    riskOn,
    btcVol: G.btcVol || 0,
    eventRiskPct,
  });
  const newsBrief = buildNewsBriefing(G, macroRows, phaseProbs);
  const assetMix = [
    { k: "현금", v: G.cash, c: "#94a3b8" },
    { k: "BTC", v: G.btc * G.btcUsd * KRW_RATE, c: "#f59e0b" },
    { k: "주식", v: stVal, c: "#38bdf8" },
    { k: "부동산", v: aptVal, c: "#a78bfa" },
    { k: "원자재", v: cmdVal, c: "#22c55e" },
  ].sort((a, b) => b.v - a.v);
  const topAsset = assetMix[0];
  const topRival = rivalBoard.all.find((x) => x.id !== "me");
  const tagOwnedCount = (G.ownedTags || []).length;
  const collOwnedCount = (G.collection || []).length;
  const codexProgress = ((tagOwnedCount + collOwnedCount) / Math.max(1, TAG_DEFS.length + COLLECTIBLES.length)) * 100;
  const rivalStyleLabel = {
    lev: "선물/레버리지",
    hodl: "비트 존버",
    apt: "부동산 집중",
    quant: "퀀트 분산",
    div: "배당 중시",
    tech: "기술주 추종",
    yolo: "하이리스크",
    safe: "안전자산",
  };

  return (
    <div style={S.bg}>
      {toast?.msg && (
        <div
          style={{
            ...S.toast,
            borderColor: toast.level === "bad" ? "#ef444499" : toast.level === "warn" ? "#f59e0b88" : toast.level === "good" ? "#22c55e88" : "#38bdf888",
            color: toast.level === "bad" ? "#fecaca" : toast.level === "warn" ? "#fbbf24" : toast.level === "good" ? "#86efac" : "#7dd3fc",
          }}
        >
          {toast.msg}
        </div>
      )}
      {dateFx && <div style={{ ...S.dateFx, color: dateFx.color }}>{dateFx.txt}</div>}
      {unlockFx && (
        <div
          style={{
            position: "fixed",
            top: 90,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 31,
            background: unlockFx.tier === "legendary" ? "#2a1540f0" : unlockFx.tier === "epic" ? "#1f1b45f0" : "#10223bf0",
            border: `1px solid ${unlockFx.color || "#60a5fa"}`,
            boxShadow: `0 0 24px ${unlockFx.color || "#60a5fa"}66`,
            borderRadius: 14,
            padding: "10px 14px",
            fontWeight: 800,
            color: unlockFx.color || "#e2e8f0",
          }}
        >
          {unlockFx.msg}
        </div>
      )}
      {eventModal && (
        <div style={S.overlay}>
          <div style={{ ...S.card, width: 440, maxWidth: "100%", borderColor: "#f59e0b" }}>
            <h3 style={{ margin: 0, color: "#f59e0b" }}>📢 이벤트 발생</h3>
            <p style={S.muted}>{fdate(G.year, G.month, G.day)} · BTC {fw(btcKrw)}</p>
            <div style={{ ...S.item, marginBottom: 6, justifyContent: "flex-start", textAlign: "left" }}>
              <strong style={{ color: "#e6edf3" }}>{eventModal.ev.e}</strong>
            </div>
            <button style={S.btnPri} onClick={() => { setEventModal(null); setRun(true); }}>확인 후 계속</button>
          </div>
        </div>
      )}
      {rankModal && (
        <div style={S.overlay}>
          <div style={{ ...S.card, width: 390, maxWidth: "100%", maxHeight: "68vh", borderColor: "#f59e0b", boxShadow: "0 0 24px #f59e0b55", paddingBottom: 8 }}>
            <h3 style={{ margin: 0, color: "#f59e0b", textAlign: "center" }}>분기 중간정산</h3>
            <div style={S.item}>
              <span>{rankModal.y}.{String(rankModal.m).padStart(2, "0")} 분기 랭킹</span>
              <strong>{rankModal.rank}위 / {rankModal.total}명</strong>
            </div>
            <div style={{ overflowY: "auto", maxHeight: "36vh", display: "flex", flexDirection: "column", gap: 6, paddingRight: 2 }}>
              {rankModal.rows.map((r, i) => (
                <div
                  key={r.id}
                  style={{ ...S.item, cursor: r.id !== "me" ? "pointer" : "default" }}
                  onClick={() => {
                    if (r.id === "me") return;
                    setRankInspectId(r.id);
                  }}
                >
                  <span>{i + 1}. {r.icon} {r.name}</span>
                  <span><strong>{fw(r.wealth)}</strong> <span style={{ color: r.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(r.roi)}</span></span>
                </div>
              ))}
            </div>
            <button style={{ ...S.btnPri, width: "100%", marginTop: 6 }} onClick={() => { setRankInspectId(null); setRankModal(null); setRun(true); }}>계속 진행</button>
          </div>
          {rankInspectId && (() => {
            const p = RIVAL_PROFILES[rankInspectId];
            const rival = RIVALS.find((r) => r.id === rankInspectId);
            const row = rivalBoard.all.find((x) => x.id === rankInspectId);
            if (!p || !rival || !row) return null;
            return (
              <div style={{ ...S.card, width: 420, maxWidth: "100%", maxHeight: "74vh", overflowY: "auto", borderColor: "#22c55e", marginLeft: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#22c55e" }}>{rival.icon} {rival.name}</strong>
                  <button style={S.chipBtn} onClick={() => setRankInspectId(null)}>정산으로 복귀</button>
                </div>
                <div style={S.row}>
                  {(p.tags || []).map((t) => (
                    <span key={t} style={{ ...S.tagChip, background: `${pickTagColor(t)}1f`, borderColor: `${pickTagColor(t)}99`, color: pickTagColor(t) }}>#{t}</span>
                  ))}
                </div>
                <div style={S.item}><span>총자산</span><strong>{fw(row.wealth)}</strong></div>
                <div style={S.item}><span>ROI</span><strong style={{ color: row.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(row.roi)}</strong></div>
                <div style={S.item}><span>현금</span><strong>{fw(row.pf.cashVal)}</strong></div>
                <div style={S.item}><span>BTC</span><strong>{fw(row.pf.btcVal)}</strong></div>
                <div style={S.item}><span>부동산</span><strong>{fw(row.pf.aptVal)}</strong></div>
                <div style={S.item}><span>주식</span><strong>{fw(row.pf.stockVal)}</strong></div>
                <div style={S.item}><span>레버리지</span><strong>{fw(row.pf.debt || 0)} / LTV {fp(row.pf.ltv || 0).replace("+", "")}</strong></div>
              </div>
            );
          })()}
        </div>
      )}
      {pausedBy && (
        <div style={S.overlay}>
          <div style={{ ...S.card, width: 460, maxWidth: "100%", borderColor: "#22c55e" }}>
            <h3 style={{ margin: 0, color: "#22c55e" }}>⏸ 멀티 일시정지</h3>
            <div style={S.muted}>{pausedBy} 님이 일시정지 사용</div>
            <button style={S.btnPri} onClick={() => { if (multi?.customMode) sendWs({ type: "resume" }); else { setPausedBy(null); setRun(true); } }}>방장 권한으로 재개</button>
          </div>
        </div>
      )}

      <header style={S.header}>
        <div>
          <div style={S.title}>₿ 비트코인 타이쿤</div>
          <div style={S.muted}>{fdate(G.year, G.month, G.day)} · {G.myNick} · 목표 {G.endYear}년</div>
          {G.equippedTagId && (
            <div style={{ ...S.muted, color: pickTagColor(G.equippedTagId), fontWeight: 700 }}>
              {TAG_DEFS.find((t) => t.id === G.equippedTagId)?.icon} {TAG_DEFS.find((t) => t.id === G.equippedTagId)?.name}
            </div>
          )}
          <div style={S.row}>
            <span style={S.memeChip}>
              {G.marketPhase?.name ? `📌 레짐: ${G.marketPhase.name}` : "📌 레짐: 중립"}
            </span>
            <span style={S.memeChip}>
              {newsBrief.headlines[0] ? `📰 ${newsBrief.headlines[0]}` : "📰 뉴스 대기 중"}
            </span>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={S.price}>
            {fw(btcKrw)} <span style={S.muted}>({fusd(G.btcUsd)})</span>
          </div>
          <div style={{ color: dayPct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 800 }}>{fp(dayPct)}</div>
        </div>
      </header>

      <section style={S.stats}>
        <div style={S.cardMini}><div style={S.muted}>총자산</div><div style={S.big}>{fw(G.total)}</div></div>
        <div style={S.cardMini}><div style={S.muted}>현금</div><div style={S.big}>{fw(G.cash)}</div></div>
        <div style={S.cardMini}><div style={S.muted}>BTC</div><div style={S.big}>{G.btc.toFixed(4)}</div></div>
        <div style={S.cardMini}><div style={S.muted}>원자재</div><div style={S.big}>{fw(cmdVal)}</div></div>
        <div style={S.cardMini}><div style={S.muted}>ROI</div><div style={{ ...S.big, color: roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(roi)}</div></div>
      </section>
      <section style={{ ...S.card, marginBottom: 10, background: "linear-gradient(135deg,#111827,#0b1220)", borderColor: "#334155" }}>
        <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ color: "#f8fafc" }}>오늘의 하이라이트</strong>
          <span style={S.muted}>{newsBrief.summary}</span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
          <div style={{ ...S.item, borderColor: "#334155" }}>
            <span>우세 레짐</span>
            <strong style={{ color: "#f59e0b" }}>{G.marketPhase?.name || "중립"} · {phaseProbs.chop.toFixed(0)}% 횡보</strong>
          </div>
          <div style={{ ...S.item, borderColor: "#334155" }}>
            <span>핵심 자산</span>
            <strong style={{ color: topAsset?.c || "#e5e7eb" }}>{topAsset?.k || "-"} {topAsset ? fw(topAsset.v) : ""}</strong>
          </div>
          <div style={{ ...S.item, borderColor: "#334155" }}>
            <span>현재 1위 라이벌</span>
            <strong style={{ color: "#22c55e" }}>{topRival ? `${topRival.icon} ${topRival.name}` : "-"}</strong>
          </div>
        </div>
      </section>

      <div style={S.tabs}>
        <TabButton active={tab === "profile"} onClick={() => setTab("profile")}>👤 프로필</TabButton>
        <TabButton active={tab === "trade"} onClick={() => setTab("trade")}>₿ 매매</TabButton>
        <TabButton active={tab === "futures"} onClick={() => setTab("futures")}>🎰 선물</TabButton>
        <TabButton active={tab === "apt"} onClick={() => setTab("apt")}>🏠 부동산</TabButton>
        <TabButton active={tab === "stock"} onClick={() => setTab("stock")}>📈 주식</TabButton>
        <TabButton active={tab === "commodity"} onClick={() => setTab("commodity")}>⛏ 원자재</TabButton>
        <TabButton active={tab === "bank"} onClick={() => setTab("bank")}>🏦 금융</TabButton>
        <TabButton active={tab === "codex"} onClick={() => setTab("codex")}>📚 도감</TabButton>
        <TabButton active={tab === "rivals"} onClick={() => setTab("rivals")}>🧠 라이벌</TabButton>
        {multi?.enabled && <TabButton active={tab === "live"} onClick={() => setTab("live")}>🌐 라이브</TabButton>}
        <TabButton active={tab === "macro"} onClick={() => setTab("macro")}>🌐 거시지표</TabButton>
        <TabButton active={tab === "news"} onClick={() => setTab("news")}>📰 뉴스</TabButton>
      </div>

      <main style={S.main}>
        {tab === "trade" && (
          <div style={S.card}>
            <div style={S.item}>
              <span>BTC/KRW</span>
              <strong style={{ color: dayPct >= 0 ? "#22c55e" : "#ef4444" }}>{fp(dayPct)}</strong>
            </div>
            <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
              <div style={S.row}>
                {["1D", "1W", "1M"].map((tf) => (
                  <button key={tf} style={{ ...S.speed, ...(chartTf === tf ? S.speedOn : null) }} onClick={() => setChartTf(tf)}>
                    {tf === "1D" ? "일봉" : tf === "1W" ? "주봉" : "월봉"}
                  </button>
                ))}
              </div>
              <div style={S.row}>
                {Object.entries(CHART_SKINS).map(([k, v]) => (
                  <button key={k} style={{ ...S.speed, ...(chartSkin === k ? S.speedOn : null) }} onClick={() => setChartSkin(k)}>
                    {v.name}
                  </button>
                ))}
              </div>
            </div>
            <BinanceCandleChart candles={btcHist} tf={chartTf} h={280} skin={chartSkin} />
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155", gap: 6 }}>
              <div style={S.muted}>전략 프리셋</div>
              <div style={S.row}>
                <button
                  style={S.chipBtn}
                  onClick={() => setSpotForm((f) => ({ ...f, side: "buy", type: "market", inputMode: "total", totalKrw: comma(Math.floor(G.cash * 0.1)) }))}
                >
                  분할매수 10%
                </button>
                <button
                  style={S.chipBtn}
                  onClick={() => setSpotForm((f) => ({ ...f, side: "buy", type: "limit", priceKrw: comma(Math.round((btcKrw * 0.995) / 10000) * 10000), inputMode: "total", totalKrw: comma(Math.floor(G.cash * 0.15)) }))}
                >
                  눌림목 매수
                </button>
                <button
                  style={S.chipBtn}
                  onClick={() => setSpotForm((f) => ({ ...f, side: "sell", type: "market", inputMode: "qty", qtyBtc: (G.btc * 0.3).toFixed(6) }))}
                >
                  익절 30%
                </button>
                <button
                  style={S.chipBtn}
                  onClick={() => setFutForm((f) => ({ ...f, side: "short", type: "market", marginKrw: comma(Math.floor(G.cash * 0.12)), lev: "4", stopLoss: "4.5", takeProfit: "7.5" }))}
                >
                  헤지 숏 세팅
                </button>
              </div>
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.row}>
                {["buy", "sell"].map((side) => (
                  <button key={side} style={{ ...S.speed, ...(spotForm.side === side ? (side === "buy" ? S.buyOn : S.sellOn) : null) }} onClick={() => setSpotForm((f) => ({ ...f, side }))}>
                    {side === "buy" ? "매수" : "매도"}
                  </button>
                ))}
                {["market", "limit"].map((type) => (
                  <button key={type} style={{ ...S.speed, ...(spotForm.type === type ? S.speedOn : null) }} onClick={() => setSpotForm((f) => ({ ...f, type }))}>
                    {type === "market" ? "시장가" : "지정가"}
                  </button>
                ))}
                {["qty", "total"].map((mode) => (
                  <button key={mode} style={{ ...S.speed, ...(spotForm.inputMode === mode ? S.speedOn : null) }} onClick={() => setSpotForm((f) => ({ ...f, inputMode: mode }))}>
                    {mode === "qty" ? "수량 입력" : "총액 입력"}
                  </button>
                ))}
              </div>
              {spotForm.type === "limit" && (
                <>
                  <input
                    style={S.input}
                    placeholder="지정가 (KRW)"
                    value={spotForm.priceKrw}
                    onChange={(e) => setSpotForm((f) => ({ ...f, priceKrw: fmtIntInput(e.target.value) }))}
                  />
                  <div style={S.muted}>지정가: {spotForm.priceKrw ? fw(num(spotForm.priceKrw)) : "미입력"}</div>
                  <div style={{ ...S.card, background: "#020617", borderColor: "#334155", padding: 8, gap: 4 }}>
                    <div style={{ ...S.muted, marginBottom: 2 }}>간이 호가창 (클릭해서 지정가 입력)</div>
                    {spotBook.map((lv) => (
                      <button
                        key={lv.id}
                        style={{
                          ...S.item,
                          cursor: "pointer",
                          justifyContent: "space-between",
                          borderColor: lv.side === "ask" ? "#7f1d1d" : lv.side === "bid" ? "#14532d" : "#334155",
                        }}
                        onClick={() => setSpotForm((f) => ({ ...f, priceKrw: comma(lv.px) }))}
                      >
                        <span style={{ color: lv.side === "ask" ? "#ef4444" : lv.side === "bid" ? "#22c55e" : "#cbd5e1" }}>
                          {lv.side === "ask" ? "매도호가" : lv.side === "bid" ? "매수호가" : "현재가"}
                        </span>
                        <strong style={{ color: lv.side === "ask" ? "#ef4444" : lv.side === "bid" ? "#22c55e" : "#f59e0b" }}>{fw(lv.px)}</strong>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={S.row}>
                <input
                  style={S.input}
                  placeholder="주문 수량 (BTC)"
                  value={spotForm.qtyBtc}
                  onChange={(e) => setSpotForm((f) => ({ ...f, qtyBtc: e.target.value.replace(/[^0-9.]/g, "") }))}
                />
                <input
                  style={S.input}
                  placeholder="주문 총액 (KRW)"
                  value={spotForm.totalKrw}
                  onChange={(e) => setSpotForm((f) => ({ ...f, totalKrw: fmtIntInput(e.target.value) }))}
                />
              </div>
              {spotForm.side === "buy" ? (
                <>
                  <div style={S.muted}>
                    매수 예상: {spotForm.inputMode === "qty" ? `${num(spotForm.qtyBtc).toFixed(6)} BTC` : `${(num(spotForm.totalKrw) / ((spotForm.type === "limit" ? num(spotForm.priceKrw) : btcKrw) || 1)).toFixed(6)} BTC`}
                    {" · "}
                    총액 {fw(spotForm.inputMode === "total" ? num(spotForm.totalKrw) : num(spotForm.qtyBtc) * ((spotForm.type === "limit" ? num(spotForm.priceKrw) : btcKrw) || 0))}
                  </div>
                  <div style={S.row}>
                    {[5, 10, 25, 30, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        style={S.chipBtn}
                        onClick={() =>
                          setSpotForm((f) => {
                            const px = (f.type === "limit" ? num(f.priceKrw) : btcKrw) || btcKrw || 1;
                            if (f.inputMode === "qty") {
                              const q = ((G.cash * pct) / 100) / px;
                              return { ...f, qtyBtc: q > 0 ? q.toFixed(6) : "" };
                            }
                            return { ...f, totalKrw: comma(Math.floor((G.cash * pct) / 100)) };
                          })
                        }
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <div style={S.muted}>매도 예상대금: {fw((spotForm.inputMode === "qty" ? num(spotForm.qtyBtc) : num(spotForm.totalKrw) / (btcKrw || 1)) * btcKrw)}</div>
                  <div style={S.row}>
                    {[5, 10, 25, 30, 50, 75, 100].map((pct) => (
                      <button
                        key={pct}
                        style={S.chipBtn}
                        onClick={() =>
                          setSpotForm((f) => {
                            if (f.inputMode === "total") {
                              const px = (f.type === "limit" ? num(f.priceKrw) : btcKrw) || btcKrw || 1;
                              const total = (G.btc * pct / 100) * px;
                              return { ...f, totalKrw: comma(Math.floor(total)) };
                            }
                            return { ...f, qtyBtc: (G.btc * pct / 100).toFixed(6) };
                          })
                        }
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div style={{ ...S.card, background: "#020617", borderColor: "#334155", padding: 8, gap: 3 }}>
                <div style={S.item}><span>주문가</span><strong>{fw(spotForm.type === "limit" ? num(spotForm.priceKrw) : btcKrw)}</strong></div>
                <div style={S.item}><span>주문수량</span><strong>{(spotForm.inputMode === "qty" ? num(spotForm.qtyBtc) : num(spotForm.totalKrw) / ((spotForm.type === "limit" ? num(spotForm.priceKrw) : btcKrw) || 1)).toFixed(6)} BTC</strong></div>
                <div style={S.item}><span>총주문금액</span><strong>{fw(spotForm.inputMode === "total" ? num(spotForm.totalKrw) : num(spotForm.qtyBtc) * ((spotForm.type === "limit" ? num(spotForm.priceKrw) : btcKrw) || 0))}</strong></div>
                <div style={S.item}><span>가용</span><strong>{spotForm.side === "buy" ? fw(G.cash) : `${G.btc.toFixed(6)} BTC`}</strong></div>
              </div>
              <button style={spotForm.side === "buy" ? S.btnPri : S.btnDanger} onClick={placeSpotOrder}>
                {spotForm.type === "market" ? "시장가 주문" : "지정가 주문"}
              </button>
            </div>
            {(G.spotOrders || []).length > 0 && (
              <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
                <strong style={{ color: "#cbd5e1" }}>현물 지정가 대기</strong>
                {(G.spotOrders || []).map((od) => (
                  <div key={od.id} style={S.item}>
                    <span>{od.side === "buy" ? "🟢 매수" : "🔴 매도"} · {fw(od.priceKrw)}</span>
                    <span style={S.muted}>{od.side === "buy" ? fw(od.amountKrw) : `${od.qtyBtc?.toFixed(4)} BTC`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "futures" && (
          <div style={S.card}>
            <div style={S.item}>
              <span>선물 미실현손익</span>
              <strong style={{ color: futPnl >= 0 ? "#22c55e" : "#ef4444" }}>{fw(futPnl)}</strong>
            </div>
            <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
              <span style={S.muted}>선물 차트 ({CHART_SKINS[chartSkin]?.name || "바이낸스"})</span>
              <div style={S.row}>
                {["1D", "1W", "1M"].map((tf) => (
                  <button key={`f_${tf}`} style={{ ...S.speed, ...(chartTf === tf ? S.speedOn : null) }} onClick={() => setChartTf(tf)}>
                    {tf === "1D" ? "일봉" : tf === "1W" ? "주봉" : "월봉"}
                  </button>
                ))}
              </div>
            </div>
            <BinanceCandleChart candles={btcHist} tf={chartTf} h={190} skin={chartSkin} />
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155", gap: 10 }}>
              <div style={S.row}>
                {["long", "short"].map((side) => (
                  <button key={side} style={{ ...S.speed, ...(futForm.side === side ? (side === "long" ? S.buyOn : S.sellOn) : null) }} onClick={() => setFutForm((f) => ({ ...f, side }))}>
                    {side === "long" ? "롱" : "숏"}
                  </button>
                ))}
                {["market", "limit"].map((type) => (
                  <button key={type} style={{ ...S.speed, ...(futForm.type === type ? S.speedOn : null) }} onClick={() => setFutForm((f) => ({ ...f, type }))}>
                    {type === "market" ? "시장가" : "지정가"}
                  </button>
                ))}
              </div>
              <div style={{ ...S.muted, fontSize: 11 }}>주문 조건</div>
              <div style={S.row}>
                <input style={S.input} placeholder="증거금 (KRW)" value={futForm.marginKrw} onChange={(e) => setFutForm((f) => ({ ...f, marginKrw: fmtIntInput(e.target.value) }))} />
                <input style={{ ...S.input, maxWidth: 130 }} placeholder="레버리지(x) 2~25" value={String(futForm.lev)} onChange={(e) => setFutForm((f) => ({ ...f, lev: e.target.value.replace(/[^0-9]/g, "") }))} />
              </div>
              <div style={S.row}>
                <input style={{ ...S.input, maxWidth: 160 }} placeholder="손절폭(%)" value={futForm.stopLoss} onChange={(e) => setFutForm((f) => ({ ...f, stopLoss: e.target.value.replace(/[^0-9.]/g, "") }))} />
                <input style={{ ...S.input, maxWidth: 160 }} placeholder="익절폭 TP(%)" value={futForm.takeProfit} onChange={(e) => setFutForm((f) => ({ ...f, takeProfit: e.target.value.replace(/[^0-9.]/g, "") }))} />
              </div>
              <div style={S.row}>
                {[10, 25, 50, 75, 100].map((pct) => (
                  <button key={`m_${pct}`} style={S.chipBtn} onClick={() => setFutForm((f) => ({ ...f, marginKrw: comma(Math.floor((G.cash * pct) / 100)) }))}>
                    증거금 {pct}%
                  </button>
                ))}
              </div>
              <div style={S.muted}>설정: 레버리지 {futForm.lev || "-"}x · 손절폭 {futForm.stopLoss || "-"}% · 익절폭 {futForm.takeProfit || "-"}% · 증거금 {fw(num(futForm.marginKrw))}</div>
              {futForm.type === "limit" && (
                <>
                  <input style={S.input} placeholder="지정가 (KRW)" value={futForm.priceKrw} onChange={(e) => setFutForm((f) => ({ ...f, priceKrw: fmtIntInput(e.target.value) }))} />
                  <div style={S.muted}>지정가: {futForm.priceKrw ? fw(num(futForm.priceKrw)) : "미입력"}</div>
                </>
              )}
              <div style={{ ...S.card, background: "#020617", borderColor: "#334155", padding: 8, gap: 3 }}>
                <div style={S.item}><span>주문방향</span><strong>{futForm.side === "long" ? "LONG" : "SHORT"}</strong></div>
                <div style={S.item}><span>주문가</span><strong>{fw(futForm.type === "limit" ? num(futForm.priceKrw) : btcKrw)}</strong></div>
                <div style={S.item}><span>증거금</span><strong>{fw(num(futForm.marginKrw))}</strong></div>
                <div style={S.item}><span>레버리지</span><strong>{futForm.lev || "-"}x</strong></div>
              </div>
              <button style={futForm.side === "long" ? S.btnPri : S.btnDanger} onClick={placeFuturesOrder}>
                {futForm.type === "market" ? "시장가 진입" : "지정가 진입"}
              </button>
            </div>
            {(G.futures || []).length > 0 && (
              <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
                <strong style={{ color: "#cbd5e1" }}>보유 포지션</strong>
                {G.futures.map((f, idx) => {
                  const r = f.side === "long" ? (G.btcUsd - f.entry) / f.entry : (f.entry - G.btcUsd) / f.entry;
                  const pnl = f.margin * f.lev * r;
                  return (
                    <div key={`${f.side}_${idx}`} style={S.item}>
                      <span>
                        {f.side === "long" ? "🟢 LONG" : "🔴 SHORT"} {f.lev}x · 증거금 {fw(f.margin)}
                        <br />
                        <span style={S.muted}>진입 {fw(f.entry * KRW_RATE)} / 청산 {fw(f.liq * KRW_RATE)} / SL {f.stopLoss ? fw(f.stopLoss * KRW_RATE) : "없음"} / TP {f.takeProfit ? fw(f.takeProfit * KRW_RATE) : "없음"}</span>
                      </span>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444", fontWeight: 800 }}>{fw(pnl)}</div>
                        <button style={S.chipBtn} onClick={() => closeFuture(idx)}>청산</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {(G.futOrders || []).length > 0 && (
              <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
                <strong style={{ color: "#cbd5e1" }}>선물 지정가 대기</strong>
                {(G.futOrders || []).map((od) => (
                  <div key={od.id} style={S.item}>
                    <span>{od.side === "long" ? "🟢 롱" : "🔴 숏"} {od.lev}x · {fw(od.priceKrw)}</span>
                    <span style={S.muted}>증거금 {fw(od.margin)} · SL {od.stopLoss ? fw(od.stopLoss * KRW_RATE) : "-"} · TP {od.takeProfit ? fw(od.takeProfit * KRW_RATE) : "-"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "apt" && (
          <div style={S.card}>
            <div style={S.muted}>보유 가치 {fw(aptVal)}</div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.muted}>지역 필터</div>
              <div style={S.row}>
                {["전체", "서울", "수도권", "지방"].map((f) => (
                  <button key={`apt_r_${f}`} style={{ ...S.speed, ...(aptRegionFilter === f ? S.speedOn : null) }} onClick={() => setAptRegionFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={S.muted}>건물 유형 필터</div>
              <div style={S.row}>
                {["전체", "아파트", "빌라/오피스텔"].map((f) => (
                  <button key={`apt_t_${f}`} style={{ ...S.speed, ...(aptTypeFilter === f ? S.speedOn : null) }} onClick={() => setAptTypeFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={S.muted}>조건 일치: {filteredAptCatalog.length}개</div>
            </div>
            {filteredAptCatalog.map((a) => (
              <div key={a.id} style={S.item}>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div>{a.icon || "🏠"} {a.name} <span style={{ ...S.muted, fontSize: 11 }}>({aptRegionOf(a.id)} · {aptTypeOf(a)})</span></div>
                  <div style={S.muted}>{a.sqm}㎡ / {a.py.toFixed(1)}평 · {fw(a.p)}</div>
                  <div style={{ ...S.row, marginTop: 6 }}>
                    {[1, 2, 5, 10].map((n) => (
                      <button key={n} style={S.chipBtn} onClick={() => setAptQty((q) => ({ ...q, [a.id]: n }))}>{n}채</button>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth: 170 }}>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={aptQty[a.id] || 1}
                    onChange={(e) => setAptQty((q) => ({ ...q, [a.id]: +e.target.value }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ ...S.muted, marginBottom: 6, textAlign: "right" }}>{aptQty[a.id] || 1}채</div>
                  <button
                    style={S.btnPri}
                    onClick={() =>
                      setG((p) => {
                        const qty = Math.max(1, aptQty[a.id] || 1);
                        const affordable = Math.floor(p.cash / a.p);
                        const finalQty = Math.min(qty, affordable);
                        if (finalQty <= 0) return p;
                        return {
                          ...p,
                          cash: p.cash - a.p * finalQty,
                          apts: [...p.apts, ...Array.from({ length: finalQty }, () => ({ ...a, cur: a.p }))],
                        };
                      })
                    }
                  >
                    매입
                  </button>
                </div>
              </div>
            ))}
            {filteredAptCatalog.length === 0 && <div style={S.muted}>필터 조건에 맞는 매물이 없습니다.</div>}
            {G.apts.map((a, idx) => (
              <div key={`${a.id}_${idx}`} style={S.item}>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div>{a.icon || "🏠"} {a.name}</div>
                  <div style={S.muted}>{a.sqm || 84}㎡ / {(a.py || 25.4).toFixed(1)}평 · 현재 {fw(a.cur)}</div>
                </div>
                <button style={S.btnDanger} onClick={() => setG((p) => ({ ...p, cash: p.cash + a.cur, apts: p.apts.filter((_, i) => i !== idx) }))}>
                  매도
                </button>
              </div>
            ))}
          </div>
        )}

        {tab === "stock" && (
          <div style={S.card}>
            <div style={S.muted}>보유 가치 {fw(stVal)}</div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <strong style={{ color: "#cbd5e1" }}>보유 종목</strong>
              {G.stocks.length === 0 && <div style={S.muted}>보유 주식이 없습니다.</div>}
              {G.stocks.map((s, idx) => (
                <div key={`${s.id}_${idx}`} style={S.item}>
                  <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                    <div>{s.icon || "📈"} {s.name} {comma(s.shares)}주</div>
                    <div style={S.muted}>현재 {fw(s.cur * s.shares)}</div>
                  </div>
                  <div style={S.row}>
                    <button
                      style={S.chipBtn}
                      onClick={() =>
                        setG((p) => {
                          const cur = p.stocks[idx].cur;
                          const shares = p.stocks[idx].shares;
                          const q = Math.max(1, Math.floor(shares * 0.25));
                          return {
                            ...p,
                            cash: p.cash + cur * q,
                            stocks: p.stocks
                              .map((x, i) => (i === idx ? { ...x, shares: x.shares - q } : x))
                              .filter((x) => x.shares > 0),
                          };
                        })
                      }
                    >
                      25%
                    </button>
                    <button
                      style={S.btnDanger}
                      onClick={() =>
                        setG((p) => {
                          const cur = p.stocks[idx].cur;
                          const shares = p.stocks[idx].shares;
                          const cashIn = cur * shares;
                          return { ...p, cash: p.cash + cashIn, stocks: p.stocks.filter((_, i) => i !== idx) };
                        })
                      }
                    >
                      전량매도
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.muted}>시장 필터</div>
              <div style={S.row}>
                {["전체", "국내", "미국"].map((f) => (
                  <button key={`stk_m_${f}`} style={{ ...S.speed, ...(stockMarketFilter === f ? S.speedOn : null) }} onClick={() => setStockMarketFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={S.muted}>유형 필터</div>
              <div style={S.row}>
                {["전체", "ETF", "개별주", "배당주", "채권"].map((f) => (
                  <button key={`stk_t_${f}`} style={{ ...S.speed, ...(stockTypeFilter === f ? S.speedOn : null) }} onClick={() => setStockTypeFilter(f)}>
                    {f}
                  </button>
                ))}
              </div>
              <div style={S.muted}>조건 일치: {filteredStockCatalog.length}개</div>
            </div>
            {filteredStockCatalog.map((s) => (
              <div key={s.id} style={S.item}>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div>
                    {s.icon || "📈"} {s.name}{" "}
                    {s.etfDesc && <span style={{ ...S.muted, fontSize: 11 }}>({s.etfDesc})</span>}
                    <span style={{ ...S.muted, fontSize: 11, marginLeft: 6 }}>
                      [{isBondStock(s) ? "채권" : isEtfStock(s) ? "ETF" : "개별주"} · {isDomesticStock(s) ? "국내" : "미국"}]
                    </span>
                  </div>
                  <div style={S.muted}>{fw(s.p)}</div>
                  <div style={{ ...S.row, marginTop: 6 }}>
                    {[1, 10, 100, 500, 1000].map((n) => (
                      <button key={n} style={S.chipBtn} onClick={() => setStockQty((q) => ({ ...q, [s.id]: n }))}>{n}주</button>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth: 210 }}>
                  <input
                    type="range"
                    min={1}
                    max={2000}
                    value={stockQty[s.id] || 1}
                    onChange={(e) => setStockQty((q) => ({ ...q, [s.id]: +e.target.value }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ ...S.muted, marginBottom: 6, textAlign: "right" }}>{comma(stockQty[s.id] || 1)}주</div>
                  <button
                    style={S.btnPri}
                    onClick={() =>
                      setG((p) => {
                        const qty = Math.max(1, stockQty[s.id] || 1);
                        const affordable = Math.floor(p.cash / s.p);
                        const finalQty = Math.min(qty, affordable);
                        if (finalQty <= 0) return p;
                        const found = p.stocks.find((x) => x.id === s.id);
                        const stocks = found
                          ? p.stocks.map((x) => (x.id === s.id ? { ...x, shares: x.shares + finalQty } : x))
                          : [...p.stocks, { ...s, shares: finalQty, cur: s.p }];
                        return { ...p, cash: p.cash - s.p * finalQty, stocks };
                      })
                    }
                  >
                    매수
                  </button>
                </div>
              </div>
            ))}
            {filteredStockCatalog.length === 0 && <div style={S.muted}>필터 조건에 맞는 종목이 없습니다.</div>}
          </div>
        )}

        {tab === "commodity" && (
          <div style={S.card}>
            <div style={S.muted}>보유 가치 {fw(cmdVal)}</div>
            {COMMODITIES.map((c) => (
              <div key={c.id} style={S.item}>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div>{c.icon} {c.name} <span style={{ ...S.muted, fontSize: 11 }}>({c.etf})</span></div>
                  <div style={S.muted}>{fw(c.p)}</div>
                  <div style={{ ...S.row, marginTop: 6 }}>
                    {[1, 5, 10, 50, 100].map((n) => (
                      <button key={n} style={S.chipBtn} onClick={() => setCmdQty((q) => ({ ...q, [c.id]: n }))}>{n}계약</button>
                    ))}
                  </div>
                </div>
                <div style={{ minWidth: 210 }}>
                  <input
                    type="range"
                    min={1}
                    max={500}
                    value={cmdQty[c.id] || 1}
                    onChange={(e) => setCmdQty((q) => ({ ...q, [c.id]: +e.target.value }))}
                    style={{ width: "100%" }}
                  />
                  <div style={{ ...S.muted, marginBottom: 6, textAlign: "right" }}>{comma(cmdQty[c.id] || 1)}계약</div>
                  <button
                    style={S.btnPri}
                    onClick={() =>
                      setG((p) => {
                        const qty = Math.max(1, cmdQty[c.id] || 1);
                        const affordable = Math.floor(p.cash / c.p);
                        const finalQty = Math.min(qty, affordable);
                        if (finalQty <= 0) return p;
                        const found = (p.commodities || []).find((x) => x.id === c.id);
                        const commodities = found
                          ? p.commodities.map((x) => (x.id === c.id ? { ...x, qty: x.qty + finalQty } : x))
                          : [...(p.commodities || []), { ...c, qty: finalQty, cur: c.p }];
                        return { ...p, cash: p.cash - c.p * finalQty, commodities };
                      })
                    }
                  >
                    매수
                  </button>
                  {(() => {
                    const owned = G.stocks.find((x) => x.id === s.id);
                    if (!owned) return null;
                    return (
                      <div style={{ ...S.row, justifyContent: "flex-end", marginTop: 6 }}>
                        <button
                          style={S.chipBtn}
                          onClick={() =>
                            setG((p) => {
                              const idx = p.stocks.findIndex((x) => x.id === s.id);
                              if (idx < 0) return p;
                              const cur = p.stocks[idx].cur;
                              const shares = p.stocks[idx].shares;
                              const q = Math.max(1, Math.floor(shares * 0.25));
                              return {
                                ...p,
                                cash: p.cash + cur * q,
                                stocks: p.stocks.map((x, i) => (i === idx ? { ...x, shares: x.shares - q } : x)).filter((x) => x.shares > 0),
                              };
                            })
                          }
                        >
                          25% 매도
                        </button>
                        <button
                          style={S.btnDanger}
                          onClick={() =>
                            setG((p) => {
                              const idx = p.stocks.findIndex((x) => x.id === s.id);
                              if (idx < 0) return p;
                              const cur = p.stocks[idx].cur;
                              const shares = p.stocks[idx].shares;
                              return { ...p, cash: p.cash + cur * shares, stocks: p.stocks.filter((_, i) => i !== idx) };
                            })
                          }
                        >
                          전량매도
                        </button>
                      </div>
                    );
                  })()}
                </div>
              </div>
            ))}
            {(G.commodities || []).map((c, idx) => (
              <div key={`${c.id}_${idx}`} style={S.item}>
                <div style={{ textAlign: "left", flex: 1, minWidth: 0 }}>
                  <div>{c.icon} {c.name} {comma(c.qty)}계약</div>
                  <div style={S.muted}>현재 {fw(c.cur * c.qty)}</div>
                </div>
                <div style={S.row}>
                  <button
                    style={S.chipBtn}
                    onClick={() =>
                      setG((p) => {
                        const cur = p.commodities[idx].cur;
                        const qty = p.commodities[idx].qty;
                        const q = Math.max(1, Math.floor(qty * 0.25));
                        return {
                          ...p,
                          cash: p.cash + cur * q,
                          commodities: p.commodities
                            .map((x, i) => (i === idx ? { ...x, qty: x.qty - q } : x))
                            .filter((x) => x.qty > 0),
                        };
                      })
                    }
                  >
                    25%
                  </button>
                  <button
                    style={S.btnDanger}
                    onClick={() =>
                      setG((p) => {
                        const cur = p.commodities[idx].cur;
                        const qty = p.commodities[idx].qty;
                        const cashIn = cur * qty;
                        return { ...p, cash: p.cash + cashIn, commodities: p.commodities.filter((_, i) => i !== idx) };
                      })
                    }
                  >
                    전량매도
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "bank" && (
          <div style={S.card}>
            <div style={S.item}><span>연준 기준금리 (Fed)</span><strong style={{ color: "#60a5fa" }}>{fedRate.toFixed(2)}%</strong></div>
            <div style={S.item}><span>기준금리</span><strong>{getBaseRate(G.year, G.month).toFixed(2)}%</strong></div>
            <div style={S.item}><span>대출금리</span><strong style={{ color: "#ef4444" }}>{getLoanRate(G.year, G.month).toFixed(2)}%</strong></div>
            <div style={S.item}><span>예금금리</span><strong style={{ color: "#22c55e" }}>{getDepositRate(G.year, G.month).toFixed(2)}%</strong></div>
            <div style={S.item}><span>담보평가(현금+예금+BTC+주식+부동산+원자재)</span><strong>{fw(collateralForLoan)}</strong></div>
            <div style={S.item}><span>LTV 한도</span><strong>60%</strong></div>
            <div style={S.item}><span>대출 가능액</span><strong>{fw(availableLoan)}</strong></div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.item}><span>대출 슬라이더</span><strong>{loanPct}%</strong></div>
              <input type="range" min={0} max={100} value={loanPct} onChange={(e) => setLoanPct(parseInt(e.target.value, 10) || 0)} style={{ width: "100%" }} />
              <div style={S.muted}>선택 금액: {fw(loanBySlider)} ({comma(loanBySlider)}원)</div>
              <div style={S.row}>
                {[10, 25, 50, 75, 100].map((p) => (
                  <button key={`loan_${p}`} style={S.chipBtn} onClick={() => setLoanPct(p)}>{p}%</button>
                ))}
              </div>
            </div>
            <div style={S.row}>
              <button
                style={S.btnPri}
                onClick={() =>
                  setG((p) => {
                    const amount = Math.min(availableLoan, loanBySlider);
                    if (amount < 1_000_000) return p;
                    const stats = ensureStats(p.stats, p.startCash);
                    stats.bankingActions += 1;
                    return { ...p, cash: p.cash + amount, loans: [...p.loans, { principal: amount, rate: getLoanRate(p.year, p.month), totalInterest: 0 }], stats };
                  })
                }
              >
                선택 금액 대출
              </button>
              <button
                style={S.btnDanger}
                onClick={() =>
                  setG((p) => {
                    if (p.loans.length === 0 || repayBySlider < 100000) return p;
                    let remain = repayBySlider;
                    const loans = p.loans.map((l) => ({ ...l }));
                    let cash = p.cash;
                    const stats = ensureStats(p.stats, p.startCash);
                    for (let i = 0; i < loans.length && remain > 0 && cash > 0; i++) {
                      const pay = Math.min(loans[i].principal, remain, cash);
                      loans[i].principal -= pay;
                      remain -= pay;
                      cash -= pay;
                      stats.repaidPrincipal += pay;
                    }
                    stats.bankingActions += 1;
                    return { ...p, cash, loans: loans.filter((l) => l.principal > 0), stats };
                  })
                }
              >
                선택 금액 상환
              </button>
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.item}><span>대출 상환 슬라이더</span><strong>{repayPct}%</strong></div>
              <input type="range" min={0} max={100} value={repayPct} onChange={(e) => setRepayPct(parseInt(e.target.value, 10) || 0)} style={{ width: "100%" }} />
              <div style={S.muted}>상환 예정: {fw(repayBySlider)} / 최대 {fw(Math.min(loanVal, G.cash))}</div>
            </div>
            <div style={S.row}>
              <button
                style={S.btnPri}
                onClick={() =>
                  setG((p) => {
                    const amount = depJoinBySlider;
                    if (amount < 100_000) return p;
                    const stats = ensureStats(p.stats, p.startCash);
                    stats.bankingActions += 1;
                    return { ...p, cash: p.cash - amount, deposits: [...p.deposits, { principal: amount, rate: getDepositRate(p.year, p.month), totalInterest: 0 }], stats };
                  })
                }
              >
                선택 금액 예금 가입
              </button>
              <button
                style={S.btnDanger}
                onClick={() =>
                  setG((p) => {
                    if (p.deposits.length === 0 || depWdBySlider < 100000) return p;
                    let remain = depWdBySlider;
                    const deps = p.deposits.map((d) => ({ ...d }));
                    let cash = p.cash;
                    const stats = ensureStats(p.stats, p.startCash);
                    for (let i = 0; i < deps.length && remain > 0; i++) {
                      const w = Math.min(deps[i].principal, remain);
                      deps[i].principal -= w;
                      remain -= w;
                      cash += w;
                    }
                    stats.bankingActions += 1;
                    return { ...p, cash, deposits: deps.filter((d) => d.principal > 0), stats };
                  })
                }
              >
                선택 금액 해지
              </button>
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.item}><span>예금 가입 슬라이더</span><strong>{depJoinPct}%</strong></div>
              <input type="range" min={0} max={100} value={depJoinPct} onChange={(e) => setDepJoinPct(parseInt(e.target.value, 10) || 0)} style={{ width: "100%" }} />
              <div style={S.muted}>가입 예정: {fw(depJoinBySlider)} / 가용 현금 {fw(G.cash)}</div>
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={S.item}><span>예금 해지 슬라이더</span><strong>{depWdPct}%</strong></div>
              <input type="range" min={0} max={100} value={depWdPct} onChange={(e) => setDepWdPct(parseInt(e.target.value, 10) || 0)} style={{ width: "100%" }} />
              <div style={S.muted}>해지 예정: {fw(depWdBySlider)} / 예금 잔액 {fw(depVal)}</div>
            </div>
            <div style={S.item}><span>예금 잔액</span><strong>{fw(depVal)}</strong></div>
            <div style={S.item}><span>대출 잔액</span><strong style={{ color: "#ef4444" }}>{fw(loanVal)}</strong></div>
          </div>
        )}

        {tab === "profile" && (
          <div style={S.card}>
            <div style={S.item}><span>닉네임</span><strong>{G.myNick}</strong></div>
            <div style={S.item}><span>장착 태그</span><strong>{G.equippedTagId ? `${TAG_DEFS.find((t) => t.id === G.equippedTagId)?.icon || ""} ${TAG_DEFS.find((t) => t.id === G.equippedTagId)?.name || ""}` : "없음"}</strong></div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#f8fafc" }}>프로필 쇼케이스</strong>
                <span style={{ color: codexProgress >= 90 ? "#c084fc" : "#93c5fd", fontWeight: 800 }}>도감 {codexProgress.toFixed(1)}%</span>
              </div>
              <div style={S.item}><span>총자산</span><strong>{fw(G.total)}</strong></div>
              <div style={S.item}><span>태그 해금</span><strong>{tagOwnedCount} / {TAG_DEFS.length}</strong></div>
              <div style={S.item}><span>수집품 해금</span><strong>{collOwnedCount} / {COLLECTIBLES.length}</strong></div>
              <div style={S.item}><span>대표 성향</span><strong style={{ color: topAsset?.c || "#e5e7eb" }}>{topAsset?.k || "현금"} 중심</strong></div>
              {codexProgress >= 100 && (
                <div style={{ ...S.item, borderColor: "#c084fc", boxShadow: "0 0 14px #c084fc66" }}>
                  <span>도감 완성 보상</span>
                  <strong style={{ color: "#c084fc" }}>🏆 오버클록 수집가</strong>
                </div>
              )}
            </div>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={{ ...S.muted, marginBottom: 6 }}>획득한 태그에서 선택</div>
              {(G.ownedTags || []).length === 0 && <div style={S.muted}>아직 획득한 태그가 없습니다.</div>}
              {(G.ownedTags || []).map((tid) => {
                const t = TAG_DEFS.find((x) => x.id === tid);
                if (!t) return null;
                const ts = TAG_TIER_STYLE[t.tier] || TAG_TIER_STYLE.common;
                return (
                  <button
                    key={tid}
                    style={{
                      ...S.item,
                      width: "100%",
                      cursor: "pointer",
                      borderColor: G.equippedTagId === tid ? ts.color : "#334155",
                      boxShadow: G.equippedTagId === tid ? ts.glow : "none",
                    }}
                    onClick={() => setG((p) => ({ ...p, equippedTagId: tid }))}
                  >
                    <span style={{ color: ts.color, fontWeight: 800 }}>{t.icon} {t.name} ({ts.label})</span>
                    <span style={S.muted}>{G.equippedTagId === tid ? "장착중" : "장착"}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {tab === "codex" && (
          <div style={S.card}>
            <div style={S.item}>
              <span>도감 진행률</span>
              <strong style={{ color: codexProgress >= 90 ? "#c084fc" : "#93c5fd" }}>
                {codexProgress.toFixed(1)}%
              </strong>
            </div>
            {G.codexCrown && (
              <div style={{ ...S.item, borderColor: "#c084fc", boxShadow: "0 0 14px #c084fc66" }}>
                <span>완성 보상</span>
                <strong style={{ color: "#c084fc" }}>🏆 오버클록 수집가</strong>
              </div>
            )}
            <div style={S.item}>
              <span>태그 도감</span>
              <strong>{(G.ownedTags || []).length} / {TAG_DEFS.length}</strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
              {TAG_DEFS.map((t) => {
                const owned = (G.ownedTags || []).includes(t.id);
                const ts = TAG_TIER_STYLE[t.tier] || TAG_TIER_STYLE.common;
                return (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTagId(t.id)}
                    style={{
                      background: owned ? "#111827" : "#0b1220",
                      border: `1px solid ${owned ? ts.color : "#334155"}`,
                      borderRadius: 12,
                      padding: 10,
                      textAlign: "left",
                      color: owned ? ts.color : "#94a3b8",
                      boxShadow: owned ? ts.glow : "none",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{t.icon} {t.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>{(TAG_TIER_STYLE[t.tier] || TAG_TIER_STYLE.common).label}</div>
                  </button>
                );
              })}
            </div>

            <div style={S.item}>
              <span>수집품 도감</span>
              <strong>{(G.collection || []).length} / {COLLECTIBLES.length}</strong>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 8 }}>
              {COLLECTIBLES.map((c) => {
                const owned = (G.collection || []).includes(c.id);
                const rareColor = c.rarity === "전설" ? "#c084fc" : c.rarity === "레어" ? "#22c55e" : "#94a3b8";
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCollectibleId(c.id)}
                    style={{
                      background: owned ? "#111827" : "#0b1220",
                      border: `1px solid ${owned ? rareColor : "#334155"}`,
                      borderRadius: 12,
                      padding: 10,
                      textAlign: "left",
                      color: owned ? rareColor : "#94a3b8",
                      boxShadow: owned && c.rarity === "전설" ? "0 0 18px #c084fcaa" : "none",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>{c.icon} {c.name}</div>
                    <div style={{ fontSize: 11, opacity: 0.9 }}>{c.rarity}</div>
                  </button>
                );
              })}
            </div>

          </div>
        )}
        {selectedTagId && (() => {
          const t = TAG_DEFS.find((x) => x.id === selectedTagId);
          if (!t) return null;
          const ts = TAG_TIER_STYLE[t.tier] || TAG_TIER_STYLE.common;
          return (
            <div style={S.overlay} onClick={() => setSelectedTagId(null)}>
              <div style={{ ...S.card, width: 460, maxWidth: "100%", borderColor: ts.color, boxShadow: ts.glow }} onClick={(e) => e.stopPropagation()}>
                <div style={S.item}>
                  <strong style={{ color: ts.color }}>{t.icon} {t.name}</strong>
                  <button style={S.chipBtn} onClick={() => setSelectedTagId(null)}>닫기</button>
                </div>
                <div style={S.muted}>{t.desc}</div>
                <div style={S.muted}>해금 조건: {t.cond}</div>
                <div style={S.muted}>난이도: {ts.label}</div>
                <div style={S.muted}>상태: {(G.ownedTags || []).includes(t.id) ? "획득 완료" : "미획득"}</div>
              </div>
            </div>
          );
        })()}

        {selectedCollectibleId && (() => {
          const c = COLLECTIBLES.find((x) => x.id === selectedCollectibleId);
          if (!c) return null;
          const rc = c.rarity === "전설" ? "#c084fc" : c.rarity === "레어" ? "#22c55e" : "#94a3b8";
          return (
            <div style={S.overlay} onClick={() => setSelectedCollectibleId(null)}>
              <div style={{ ...S.card, width: 460, maxWidth: "100%", borderColor: rc, boxShadow: c.rarity === "전설" ? "0 0 18px #c084fcaa" : "none" }} onClick={(e) => e.stopPropagation()}>
                <div style={S.item}>
                  <strong style={{ color: rc }}>{c.icon} {c.name}</strong>
                  <button style={S.chipBtn} onClick={() => setSelectedCollectibleId(null)}>닫기</button>
                </div>
                <div style={S.muted}>등급: {c.rarity}</div>
                <div style={S.muted}>{c.desc}</div>
                <div style={S.muted}>해금 조건: {c.cond}</div>
                <div style={S.muted}>상태: {(G.collection || []).includes(c.id) ? "획득 완료" : "미획득"}</div>
              </div>
            </div>
          );
        })()}

        {tab === "rivals" && (
          <div style={S.card}>
            {lastRank && (
              <div style={S.item}>
                <span>최근 분기 ({lastRank.y}.{String(lastRank.m).padStart(2, "0")})</span>
                <strong style={{ color: "#f7931a" }}>
                  {lastRank.rank}위 / {lastRank.total}명
                </strong>
              </div>
            )}
            {inspectRivalId && (() => {
              const p = RIVAL_PROFILES[inspectRivalId];
              const rival = RIVALS.find((r) => r.id === inspectRivalId);
              const row = rivalBoard.all.find((x) => x.id === inspectRivalId);
              if (!p || !rival || !row) return null;
              const segs = [
                { k: "현금", v: row.pf.cashVal },
                { k: "BTC", v: row.pf.btcVal },
                { k: "부동산", v: row.pf.aptVal },
                { k: "주식", v: row.pf.stockVal },
              ];
              const best = [...segs].sort((a, b) => b.v - a.v)[0];
              const weak = [...segs].sort((a, b) => a.v - b.v)[0];
              return (
                <div style={{ ...S.card, background: "#111827", borderColor: "#f59e0b", position: "sticky", top: 6, zIndex: 5 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong style={{ color: "#f59e0b" }}>{rival.icon} {rival.name}</strong>
                  <button style={S.chipBtn} onClick={() => setInspectRivalId(null)}>닫기</button>
                </div>
                <div style={S.item}>
                  <span>전략 타입</span>
                  <strong style={{ color: "#93c5fd" }}>{rivalStyleLabel[row.style] || "혼합형"}</strong>
                </div>
                <div style={S.row}>
                  {p.tags.map((t) => (
                    <span key={t} style={{ ...S.tagChip, background: `${pickTagColor(t)}1f`, borderColor: `${pickTagColor(t)}99`, color: pickTagColor(t) }}>#{t}</span>
                  ))}
                </div>
                  <div style={{ color: "#fef3c7", fontWeight: 700 }}>\"{p.quote}\"</div>
                  <div style={{ color: "#fcd34d", fontSize: 13 }}>🎯 {p.quirk}</div>
                  <div style={{ ...S.item, background: "#0b1220", borderColor: "#374151" }}>
                    <span>포트폴리오</span>
                    <strong>{fw(row.wealth)}</strong>
                  </div>
                  <div style={S.item}>
                    <span>강한 자산</span>
                    <strong style={{ color: "#22c55e" }}>{best.k}</strong>
                  </div>
                  <div style={S.item}>
                    <span>약한 자산</span>
                    <strong style={{ color: "#ef4444" }}>{weak.k}</strong>
                  </div>
                  <div style={S.item}>
                    <span>레버리지/대출</span>
                    <strong style={{ color: "#f59e0b" }}>{fw(row.pf.debt || 0)} (LTV {fp(row.pf.ltv || 0).replace("+", "")})</strong>
                  </div>
                  <div style={S.muted}>
                    현금이 낮아 보이는 이유: 담보대출을 투자자산으로 전환해서 현금 비중을 줄인 전략입니다.
                  </div>
                  <div style={S.item}><span>현금</span><strong>{fw(row.pf.cashVal)}</strong></div>
                  <div style={S.item}><span>BTC</span><strong>{fw(row.pf.btcVal)}</strong></div>
                  <div style={S.item}><span>부동산</span><strong>{fw(row.pf.aptVal)}</strong></div>
                  <div style={S.item}><span>주식</span><strong>{fw(row.pf.stockVal)}</strong></div>
                  {row.pf.apts.length > 0 && (
                    <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
                      <strong style={{ color: "#cbd5e1" }}>부동산 상세</strong>
                      {row.pf.apts.map((a) => (
                        <div key={a.id} style={S.item}>
                          <span>{a.icon || "🏠"} {a.name} · {a.count}채</span>
                          <span style={{ color: a.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(a.roi)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {row.pf.stocks.length > 0 && (
                    <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
                      <strong style={{ color: "#cbd5e1" }}>주식 상세</strong>
                      {row.pf.stocks.map((s) => (
                        <div key={s.id} style={S.item}>
                          <span>{s.icon || "📈"} {s.name} · {comma(s.count)}주</span>
                          <span style={{ color: s.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(s.roi)} · 투자 {fw(s.bought)} → 현재 {fw(s.cur)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
            {rivalBoard.all.map((r, idx) => (
              <div key={r.id} style={{ ...S.item, cursor: r.id === "me" ? "default" : "pointer" }} onClick={() => r.id !== "me" && setInspectRivalId(r.id)}>
                <span>
                  {idx + 1}. {r.icon} {r.name}
                  {r.id !== "me" && (
                    <span style={{ ...S.muted, marginLeft: 8, color: "#93c5fd" }}>{rivalStyleLabel[r.style] || "혼합형"}</span>
                  )}
                  {r.id !== "me" && (
                    <span style={{ marginLeft: 8 }}>
                      {(RIVAL_PROFILES[r.id]?.tags || []).slice(0, 2).map((t) => (
                        <span key={t} style={{ ...S.tagChip, marginLeft: 4, fontSize: 10, padding: "1px 6px", background: `${pickTagColor(t)}1f`, borderColor: `${pickTagColor(t)}99`, color: pickTagColor(t) }}>#{t}</span>
                      ))}
                    </span>
                  )}
                </span>
                <span>
                  <strong>{fw(r.wealth)}</strong>{" "}
                  <span style={{ color: r.roi >= 0 ? "#22c55e" : "#ef4444" }}>{fp(r.roi)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "live" && multi?.enabled && (
          <div style={S.card}>
            <div style={S.item}>
              <span>방 상태</span>
              <strong style={{ color: "#22c55e" }}>LIVE · {players.length}명</strong>
            </div>
            {[...players].sort((a, b) => (b.total || 0) - (a.total || 0)).map((p, idx) => (
              <div key={p.id} style={S.item}>
                <span>{idx + 1}. {p.icon || "🎮"} {p.nickname} {p.isBot ? "(BOT)" : ""}</span>
                <span>
                  <strong>{fw(p.total || 0)}</strong>{" "}
                  <span style={{ color: (p.roi || 0) >= 0 ? "#22c55e" : "#ef4444" }}>{fp(p.roi || 0)}</span>
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "news" && (
          <div style={S.card}>
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={{ ...S.row, justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ color: "#f8fafc" }}>{newsBrief.title}</strong>
                <span style={{ ...S.muted, color: "#fbbf24" }}>{newsBrief.summary}</span>
              </div>
              <div style={{ ...S.muted, color: "#cbd5e1" }}>핵심 헤드라인</div>
              {newsBrief.headlines.length === 0 && <div style={S.muted}>아직 핵심 뉴스가 없습니다.</div>}
              {newsBrief.headlines.map((h, i) => (
                <div key={`brief_h_${i}`} style={S.item}>
                  <span>{i + 1}. {h}</span>
                </div>
              ))}
              <div style={{ ...S.muted, color: "#93c5fd" }}>거시 요약</div>
              {newsBrief.macros.map((m, i) => (
                <div key={`brief_m_${i}`} style={S.item}>
                  <span>{m}</span>
                </div>
              ))}
            </div>
            {pastEvents.length === 0 && <div style={S.muted}>아직 발생한 뉴스가 없습니다.</div>}
            {pastEvents.map((e, i) => (
              <div key={i} style={S.item}>
                <span>
                  {e.y}.{String(e.m).padStart(2, "0")}.{String(e.d).padStart(2, "0")}
                </span>
                <span style={{ color: e.et === "rare" ? "#c084fc" : e.et === "meme" ? "#f59e0b" : "#e5e7eb" }}>{e.title || e.e}</span>
              </div>
            ))}
          </div>
        )}
        {tab === "macro" && (
          <div style={S.card}>
            <div style={S.item}>
              <span>글로벌 거시 변동 한눈에 보기</span>
              <strong style={{ color: "#f59e0b" }}>{G.year}.{String(G.month).padStart(2, "0")}</strong>
            </div>
            {macroRows.map((r) => (
              <div key={r.k} style={S.item}>
                <span>{r.k}</span>
                <span>
                  <strong style={{ color: r.c }}>{r.v}</strong>
                  <span style={{ ...S.muted, marginLeft: 8 }}>{r.d}</span>
                </span>
              </div>
            ))}
            <div style={{ ...S.card, background: "#0b1220", borderColor: "#334155" }}>
              <div style={{ ...S.muted, color: "#f8fafc" }}>다음 레짐 확률 (추정)</div>
              {[
                { k: "상승장", v: phaseProbs.bull, c: "#22c55e" },
                { k: "횡보장", v: phaseProbs.chop, c: "#94a3b8" },
                { k: "약세장", v: phaseProbs.bear, c: "#ef4444" },
                { k: "대폭락장", v: phaseProbs.deepBear, c: "#f97316" },
                { k: "쇼트스퀴즈", v: phaseProbs.squeeze, c: "#06b6d4" },
              ].map((r) => (
                <div key={r.k} style={{ marginBottom: 6 }}>
                  <div style={{ ...S.row, justifyContent: "space-between" }}>
                    <span style={S.muted}>{r.k}</span>
                    <strong style={{ color: r.c }}>{r.v.toFixed(1)}%</strong>
                  </div>
                  <div style={{ height: 6, borderRadius: 999, background: "#1f2937", overflow: "hidden" }}>
                    <div style={{ width: `${r.v}%`, height: "100%", background: r.c }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={S.muted}>그래프 없이 월별 변화만 빠르게 확인하도록 구성했습니다.</div>
          </div>
        )}
      </main>

      <footer style={S.footer}>
        {!multi?.enabled ? (
          <button style={run ? S.btnDanger : S.btnPri} onClick={() => setRun((v) => !v)}>
            {run ? "일시정지" : "시작"}
          </button>
        ) : (
          <>
            <button
              style={run ? S.btnDanger : S.btnPri}
              onClick={() => {
                if (multi?.customMode) {
                  if (run) sendWs({ type: "pause" });
                  else sendWs({ type: "resume" });
                  return;
                }
                setRun((v) => !v);
              }}
            >
              {run ? "전체 일시정지" : "재개"}
            </button>
            <button
              style={S.speed}
              onClick={() => {
                const me = players.find((x) => x.id === clientIdRef.current);
                if (!me || (me.pauseLeft || 0) <= 0) return;
                if (multi?.customMode) {
                  sendWs({ type: "pause" });
                } else {
                  setPlayers((ps) => ps.map((pl) => (pl.id === clientIdRef.current ? { ...pl, pauseLeft: Math.max(0, (pl.pauseLeft || 0) - 1) } : pl)));
                  setPausedBy(me.nickname);
                  setRun(false);
                }
              }}
            >
              개인정지 {players.find((x) => x.id === clientIdRef.current)?.pauseLeft ?? 0}회
            </button>
          </>
        )}
        {[1, 2, 4, 10, 20].map((s) => (
          <button key={s} disabled={!!multi?.customMode} onClick={() => setSpd(s)} style={{ ...S.speed, ...(spd === s ? S.speedOn : null), opacity: multi?.customMode ? 0.45 : 1 }}>
            {s}x
          </button>
        ))}
        <button
          style={S.speed}
          onClick={() => {
            try {
              localStorage.setItem("btc_tycoon_save_v1", JSON.stringify({ ...G, multi, players }));
              setSavedGame({ ...G, multi, players });
              toastPush("게임 저장 완료");
            } catch (_e) {
              toastPush("저장 실패", "bad", 2);
            }
          }}
        >
          저장하기
        </button>
        <button
          style={S.speed}
          onClick={() => {
            setRun(false);
            setScreen("setup");
          }}
        >
          새 게임
        </button>
        <button style={S.speed} onClick={() => setSfxMuted((v) => !v)}>
          {sfxMuted ? "🔇" : "🔊"}
        </button>
      </footer>
    </div>
  );
}

const S = {
  bg: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 15% 5%, #1f2937 0%, #0f172a 45%, #020617 100%)",
    color: "#e5e7eb",
    padding: 12,
    fontFamily: "Pretendard, sans-serif",
  },
  bgCenter: {
    minHeight: "100vh",
    background: "radial-gradient(circle at 15% 5%, #1f2937 0%, #0f172a 45%, #020617 100%)",
    color: "#e5e7eb",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 12,
    fontFamily: "Pretendard, sans-serif",
  },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 8, background: "#111827cc", border: "1px solid #f59e0b66", borderRadius: 16, padding: 12 },
  title: { fontWeight: 900, fontSize: 20, color: "#f59e0b" },
  price: { fontWeight: 900, fontSize: 18, color: "#f8fafc" },
  muted: { color: "#94a3b8", fontSize: 12 },
  stats: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(130px,1fr))", gap: 8, marginBottom: 10 },
  cardMini: { background: "#0b1220", border: "1px solid #1f2937", borderRadius: 14, padding: 10, boxShadow: "0 6px 16px #00000066" },
  big: { fontSize: 16, fontWeight: 800, color: "#f8fafc" },
  tabs: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 },
  tab: { border: "1px solid #334155", background: "#0f172a", color: "#94a3b8", borderRadius: 999, padding: "7px 12px", cursor: "pointer", fontWeight: 700 },
  tabOn: { borderColor: "#f59e0b", color: "#f59e0b", background: "#1f2937" },
  main: { marginBottom: 10 },
  card: { background: "#111827dd", border: "1px solid #1f2937", borderRadius: 16, padding: 12, display: "flex", flexDirection: "column", gap: 8, boxShadow: "0 8px 20px #00000055" },
  item: { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, padding: "8px 10px", border: "1px solid #1f2937", borderRadius: 10, background: "#0b1220", flexWrap: "wrap" },
  row: { display: "flex", gap: 6, flexWrap: "wrap" },
  btnPri: { background: "linear-gradient(135deg,#f59e0b,#f97316)", border: "none", borderRadius: 10, padding: "8px 12px", color: "#111827", fontWeight: 900, cursor: "pointer", boxShadow: "0 6px 14px #f59e0b44" },
  btnDanger: { background: "#3f1d1d", border: "1px solid #ef4444", borderRadius: 10, padding: "8px 12px", color: "#fecaca", fontWeight: 800, cursor: "pointer" },
  footer: { display: "flex", gap: 6, flexWrap: "wrap" },
  speed: { background: "#0b1220", border: "1px solid #334155", borderRadius: 10, padding: "7px 10px", color: "#cbd5e1", cursor: "pointer", fontWeight: 700 },
  speedOn: { borderColor: "#f59e0b", color: "#f59e0b", background: "#1f2937" },
  input: { flex: 1, minWidth: 120, background: "#0b1220", color: "#e5e7eb", border: "1px solid #334155", borderRadius: 10, padding: "9px 10px" },
  select: { background: "#0b1220", color: "#e5e7eb", border: "1px solid #334155", borderRadius: 10, padding: "9px 10px" },
  h1: { marginTop: 0, marginBottom: 8, color: "#f59e0b" },
  toast: { position: "fixed", top: 12, right: 12, background: "#111827", border: "1px solid #f59e0b66", borderRadius: 12, padding: "8px 12px", color: "#fbbf24", fontWeight: 700, zIndex: 30 },
  dateFx: {
    position: "fixed",
    top: 56,
    left: "50%",
    transform: "translateX(-50%)",
    background: "#0f172aee",
    border: "1px solid #334155",
    borderRadius: 999,
    padding: "8px 14px",
    fontWeight: 900,
    zIndex: 31,
    boxShadow: "0 8px 20px #00000066",
  },
  overlay: { position: "fixed", inset: 0, zIndex: 20, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 12 },
  chipBtn: { background: "#111827", border: "1px solid #475569", borderRadius: 999, padding: "4px 8px", color: "#e2e8f0", fontSize: 12, cursor: "pointer", fontWeight: 700 },
  tagChip: { background: "#1f2937", border: "1px solid #f59e0b66", borderRadius: 999, padding: "3px 8px", color: "#fbbf24", fontSize: 12, fontWeight: 700 },
  memeChip: { background: "#1f2937", border: "1px solid #334155", borderRadius: 999, padding: "2px 8px", color: "#cbd5e1", fontSize: 11, fontWeight: 700 },
  buyOn: { borderColor: "#22c55e", color: "#22c55e", background: "#14532d44" },
  sellOn: { borderColor: "#ef4444", color: "#ef4444", background: "#7f1d1d44" },
};




