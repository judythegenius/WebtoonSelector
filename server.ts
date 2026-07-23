import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import cors from "cors";

async function searchNaverWeb(query, display = 10) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  const res = await fetch(`https://openapi.naver.com/v1/search/webkr.json?query=${encodeURIComponent(query)}&display=${display}`, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret }
  });
  if (!res.ok) throw new Error(`네이버 검색 API 실패: ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function searchNaverImage(query) {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  const res = await fetch(`https://openapi.naver.com/v1/search/image?query=${encodeURIComponent(query)}&display=3&sort=sim`, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret }
  });
  if (!res.ok) return null;
  const data = await res.json();
  const items = data.items || [];
  return items.length > 0 ? items[0].link : null;
}

// 기존 webtoon 하나의 링크/썸네일 보강 (page.kakao.com 또는 webtoon.kakao.com)
async function renderKakaoPage(pageUrl, title) {
  const isKakaoPage = pageUrl.includes("page.kakao.com");
  const platformLabel = isKakaoPage ? "카카오페이지" : "카카오웹툰";

  // 1. 링크 검증: 이 제목으로 검색했을 때 진짜 해당 사이트 링크가 나오는지 확인
  const webItems = await searchNaverWeb(`${title} ${platformLabel}`, 5);
  const domainFilter = isKakaoPage ? "page.kakao.com/content/" : "webtoon.kakao.com/content/";
  const matched = webItems.find(item => item.link.includes(domainFilter));

  // 2. 썸네일: 네이버 이미지 검색
  const thumbnail = await searchNaverImage(`${title} ${platformLabel} 웹툰 표지`);

  return {
    thumbnail,
    title: matched ? matched.title.replace(/<[^>]+>/g, "") : title,
    validatedUrl: matched ? matched.link : null,
    relatedIds: [] // 아래 3단계에서 별도 처리
  };
}

import https from "https";
import http from "http";

// Load environment variables
dotenv.config();

const __dirname = (() => {
  try {
    return path.dirname(new URL(import.meta.url).pathname);
  } catch {
    return process.cwd();
  }
})();

const app = express();
const PORT = 3000;

app.use(cors({
  origin: "*"
}));
app.use(express.json());

// Local DB Path
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "webtoons.json");
const STATS_PATH = path.join(DATA_DIR, "stats.json");

// Create Data Directory
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Global log list for admin dashboard
let serverLogs: string[] = ["서버가 가동되었습니다. 로컬 데이터베이스를 확인 중입니다."];
function log(msg: string) {
  const time = new Date().toLocaleTimeString("ko-KR");
  const fullMsg = `[${time}] ${msg}`;
  console.log(fullMsg);
  serverLogs.push(fullMsg);
  if (serverLogs.length > 100) {
    serverLogs.shift();
  }
}

// Seed Data
const SEED_WEBTOONS: any[] = [];

let cachedWebtoons: any[] | null = null;
let cacheTime = 0;
// Helper to Load database
function loadWebtoons(): any[] {
  const now = Date.now();
  if (cachedWebtoons && now - cacheTime < 30000) { // 30 seconds cache
    return cachedWebtoons;
  }
  try {
    let list: any[] = [];
    if (!fs.existsSync(DB_PATH)) {
      log("로컬 데이터베이스 파일이 없습니다. 프리시드(Pre-seeded) 데이터를 주입합니다.");
      list = SEED_WEBTOONS;
      fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), "utf-8");
      return list;
    }
    const data = fs.readFileSync(DB_PATH, "utf-8");
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      log("데이터베이스가 비어 있습니다. 프리시드 데이터를 주입합니다.");
      list = SEED_WEBTOONS;
      fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), "utf-8");
      return list;
    }
    list = parsed;

    let hasChanges = false;

    // Clean up obsolete / incorrect IDs (e.g. Kakao novel IDs that were wrongly used as webtoon IDs, and old incorrect webtoon IDs)
    const obsoleteIds = ["kakaoPage_50866481", "kakaoPage_59850123", "kakao_1122", "kakao_1155", "kakao_6244"];
    const initialLength = list.length;
    list = list.filter(w => !obsoleteIds.includes(w.id));
    if (list.length !== initialLength) {
      log(`스마트 데이터베이스 정리: 잘못된 카카오/카카오페이지 소설 ID ${initialLength - list.length}개를 정리했습니다.`);
      hasChanges = true;
    }

    SEED_WEBTOONS.forEach(seedItem => {
      const existingIdx = list.findIndex(w => w.id === seedItem.id);
      if (existingIdx === -1) {
        list.push(seedItem);
        hasChanges = true;
      } else {
        // Overwrite or update Kakao/KakaoPage items to ensure they have the newly enriched fields
        if (seedItem.platform === "kakao" || seedItem.platform === "kakaoPage") {
          const existing = list[existingIdx];
          // If we added detailed billing or changed genres, let's merge
          if (!existing.totalEpisodes || existing.isFree === undefined || (existing.updateDays && existing.updateDays[0] === "finished" && seedItem.updateDays[0] !== "finished")) {
            list[existingIdx] = { ...existing, ...seedItem };
            hasChanges = true;
          }
        }
      }
    });

    if (hasChanges) {
      log("스마트 데이터베이스 동기화: 카카오/카카오페이지 필터 보강 데이터가 데이터베이스에 병합되었습니다.");
      fs.writeFileSync(DB_PATH, JSON.stringify(list, null, 2), "utf-8");
    }

    cachedWebtoons = list;
  cacheTime = Date.now();
  return list;
} catch (err: any) {
    log(`데이터베이스 로드 중 에러 발생: ${err.message}. 복구용 프리시드 데이터를 사용합니다.`);
    return SEED_WEBTOONS;
  }
}

// Helper to Save database
let saveQueue = Promise.resolve();
function saveWebtoons(data: any[]) {
  cachedWebtoons = data;
  cacheTime = Date.now();
  saveQueue = saveQueue.then(async () => {
    // 고유한 임시 파일명 사용 (동시 저장 시 충돌 방지)
    const tmpPath = `${DB_PATH}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const maxRetries = 5;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
        fs.renameSync(tmpPath, DB_PATH); // 임시파일로 먼저 쓰고 통째로 교체 → 중간에 깨질 일이 없음
        return; // 성공하면 종료
      } catch (err: any) {
        if ((err.code === "EPERM" || err.code === "EBUSY") && attempt < maxRetries) {
          // 파일이 잠겨있을 때: 짧게 대기 후 재시도
          await new Promise(resolve => setTimeout(resolve, 100 * attempt));
          continue;
        }
        log(`데이터베이스 저장 중 에러 발생: ${err.message}`);
        // 최후 수단: rename 대신 직접 덮어쓰기 시도
        try {
          fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
        } catch (fallbackErr: any) {
          log(`데이터베이스 직접 저장도 실패: ${fallbackErr.message}`);
        } finally {
          // 남은 임시 파일 정리 시도
          try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch {}
        }
        return;
      }
    }
  });
  return saveQueue;
}
// Stats helper
function loadStats() {
  try {
    if (fs.existsSync(STATS_PATH)) {
      return JSON.parse(fs.readFileSync(STATS_PATH, "utf-8"));
    }
  } catch (e) {}
  return {
    lastCrawlRun: null,
    lastEnrichRun: null,
  };
}

function saveStats(stats: any) {
  try {
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
  } catch (e) {}
}

// Normalize Day helper
function normalizeDay(day: string): string {
  const map: Record<string, string> = {
    "월요일": "MON", "화요일": "TUE", "수요일": "WED", "목요일": "THU", "금요일": "FRI", "토요일": "SAT", "일요일": "SUN",
    "월": "MON", "화": "TUE", "수": "WED", "목": "THU", "금": "FRI", "토": "SAT", "일": "SUN",
    "mon": "MON", "tue": "TUE", "wed": "WED", "thu": "THU", "fri": "FRI", "sat": "SAT", "sun": "SUN"
  };
  return map[day.toLowerCase()] || day.toUpperCase();
}

// Local Fallback Genre Classifier
const LOCAL_GENRE_MAP: Record<string, string[]> = {
  "화산귀환": ["판타지", "액션", "무협"],
  "신의 탑": ["판타지", "액션"],
  "연애혁명": ["로맨스/순정", "일상", "드라마"],
  "외모지상주의": ["액션", "드라마", "학원"],
  "재혼 황후": ["로맨스/순정", "드라마", "판타지"],
  "나 혼자만 레벨업": ["판타지", "액션"],
  "데뷔 못 하면 죽는 병 걸림": ["판타지", "드라마", "아이돌"],
  "남편을 죽여줘요": ["드라마", "스릴러"],
  "가비지타임": ["드라마", "스포츠", "학원"],
  "세기말 풋사과 보습학원": ["로맨스/순정", "일상", "드라마"],
  "사내맞선": ["로맨스/순정", "드라마"],
  "입학용병": ["액션", "학원"],
  "김부장": ["액션", "느와르"],
  "작전명 순정": ["로맨스/순정", "학원"],
  "팔이피플": ["드라마", "스릴러", "개그"],
  "윈드브레이커": ["스포츠", "드라마", "학원"],
  "참교육": ["액션", "드라마", "학원"],
  "전지적 독자 시점": ["판타지", "액션"],
  "나 혼자 탑에서 농사": ["판타지", "일상", "힐링"],
  "퀘스트지상주의": ["액션", "학원", "판타지"],
  "약한영웅": ["액션", "드라마", "학원"],
  "가짜 동맹": ["로맨스/순정", "학원", "드라마"],
  "스위트홈": ["스릴러", "판타지"],
  "타인은 지옥이다": ["스릴러", "미스터리"],
  "유미의 세포들": ["로맨스/순정", "일상", "개그"],
  "마흔 즈음에": ["드라마", "일상", "개그"],
  "방구석 재민이": ["일상", "개그"],
  "99강화나무몽둥이": ["판타지", "액션", "개그"],
  "폭풍의 전학생": ["학원", "개그"],
  "동생 왔다": ["일상", "개그"],
  "극한견주": ["일상", "개그"],
  "뇌전증 일기": ["일상", "개그"],
  "땅콩일기": ["일상", "개그"],
  "신체": ["개그", "일상"],
};

// Auto guess genre based on words in title
function guessGenreByTitle(title: string): string[] {
  // 1. 정확한 타이틀 매칭
  for (const key of Object.keys(LOCAL_GENRE_MAP)) {
    if (title.includes(key) || key.includes(title)) {
      return LOCAL_GENRE_MAP[key];
    }
  }

  // 2. 키워드 기반 추론 (복수 장르 반환)
  const genres: string[] = [];

  // 개그/일상
  if (title.match(/일기|생활|브이로그|관찰기|썰|아저씨|아줌마|주부|백수|직장인|사원|대리|과장|부장|사장|알바|알바생|편의점|카페|식당|요리사|요리|먹방|맛집|반려|강아지|고양이|고냥이|집사|개잡이|개키우|냥이|냥집사/)) {
    genres.push("일상");
  }
  if (title.match(/개그|코믹|웃음|웃긴|병맛|망가|개소리|허당|눈치|눈치없|4컷|4칸|유머|개판|황당|어이없|웃대|빵터|빵빵|키득/)) {
    genres.push("개그", "일상");
  }

  // 로맨스/순정
  if (title.match(/연애|사랑|너와|그녀|남자친구|여자친구|썸|설레|두근|고백|키스|남친|여친|남편|아내|부부|결혼|혼인|약혼|프러포즈|로맨스|순정|달달|달콤|핑크/)) {
    genres.push("로맨스/순정");
  }

  // 로판 (로맨스+판타지)
  if (title.match(/황녀|공주|황후|왕비|귀족|백작|공작|후작|남작|영애|아가씨|소저|빙의|환생|회귀.*황|황.*회귀|궁|황궁|이세계.*여|여.*이세계/)) {
    genres.push("로맨스/순정", "판타지");
  }

  // 판타지/액션
  if (title.match(/레벨업|귀환|빙의|헌터|용사|마왕|마법사|아카데미|소환사|스킬|SSS|던전|영주|드래곤|검사|검객|무사|기사|마검|성기사|성검|성배|용기사|신수|엘프|오크|몬스터|이세계|차원|게이트|리셋|리플레이|회귀|환생|전생|탑|클리어|플레이어|랭커|랭킹|최강|무적|불사|불멸|제왕|마제|천재|천마|신화/)) {
    genres.push("판타지", "액션");
  }

  // 무협
  if (title.match(/무림|강호|협객|문파|장문인|장로|사부|사형|사매|천마|마교|정파|사파|검법|검결|검기|검강|내공|기공|무공|신공|절기|밀기|비급|천하|강산|협|의협|쾌협|대협|협도|강자|고수|전설|소설|무협/)) {
    genres.push("무협", "액션");
  }

  // 스릴러/미스터리
  if (title.match(/살인|죽여|죽이|피|복수|감옥|범죄|범인|탐정|형사|경찰|수사|공포|귀신|유령|저주|오컬트|미스터리|추리|의문|실종|납치|감금|스토커|사이코|연쇄|지옥|악마|악귀|빙의귀|공포증/)) {
    genres.push("스릴러");
  }

  // 학원
  if (title.match(/학교|학생|중학|고등|대학|학원|교실|선생|교사|교수|입학|졸업|수험|입시|동아리|학과|청춘|10대/)) {
    genres.push("학원");
  }

  // 스포츠
  if (title.match(/야구|축구|농구|배구|테니스|달리기|마라톤|수영|복싱|격투|격투기|무도|유도|태권|검도|씨름|레슬링|스포츠|선수|감독|코치|팀|리그|토너먼트|경기|시합|대회|우승|챔피언/)) {
    genres.push("스포츠", "드라마");
  }

  // BL
  if (title.match(/BL|보이즈러브|남남|형×제|형제×|순×|순정×남/)) {
    genres.push("BL");
  }

  // 의학
  if (title.match(/의사|의대|병원|환자|수술|간호사|간호|응급|진단|치료|암|종양|외과|내과|정형|신경외과|흉부|이비인후|피부과|정신과|의학/)) {
    genres.push("의학", "드라마");
  }

  // 힐링
  if (title.match(/힐링|위로|쉬어가|따뜻|포근|느긋|귀농|귀촌|전원|자연|숲속|시골|농사|텃밭|정원|카페|카페인|음식|요리|소소|작은|느린|여유|산책|여행/)) {
    if (!genres.includes("일상")) genres.push("일상");
    genres.push("힐링");
  }

  if (genres.length > 0) return [...new Set(genres)];
  return ["드라마"]; // Default fallback
}

// Function to enrich billing and episode details for a target webtoon
async function enrichBillingInfo(webtoon: any): Promise<boolean> {
  if (webtoon.platform !== "naver" || !webtoon.webtoonId) return false;
  try {
    const titleId = webtoon.webtoonId;
    const url = `https://comic.naver.com/api/article/list?titleId=${titleId}&page=1&sort=DESC`;
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    
    const totalEpisodes = data.totalCount || 0;
    const isDailyPass = data.dailyPass === true;
    const dailyPassDuration = data.dailyPassDuration || 0;
    
    let paidEpisodes = 0;
    if (data.articleList && Array.isArray(data.articleList)) {
      // count how many have charge = true
      paidEpisodes = data.articleList.filter((a: any) => a.charge === true).length;
    }
    
    const freeEpisodes = totalEpisodes - paidEpisodes;
    
    webtoon.totalEpisodes = totalEpisodes;
    webtoon.isDailyPass = isDailyPass;
    webtoon.dailyPassDuration = dailyPassDuration;
    webtoon.paidEpisodes = paidEpisodes;
    webtoon.freeEpisodes = freeEpisodes;
    // Set isFree flag: If it's a daily pass, or has any strictly paid/cookie-only episodes, it is not completely free
    if (webtoon.isFree !== true) {
  webtoon.isFree = !isDailyPass && paidEpisodes === 0;
}
    
    return true;
  } catch (e) {
    return false;
  }
}

// Background billing enrichment queue
let isEnrichingBilling = false;
async function enrichMissingBillingBackground() {
  if (isEnrichingBilling) return;
  isEnrichingBilling = true;
  
  try {
    const webtoons = loadWebtoons();
    // completed Naver webtoons that don't have totalEpisodes yet
    const targets = webtoons.filter(w => w.platform === "naver" && (w.isEnd || w.updateDays.includes("finished") || w.updateDays.includes("FINISHED")) && w.totalEpisodes === undefined);
    
    if (targets.length === 0) {
      isEnrichingBilling = false;
      return;
    }
    
    // Take a batch of 15 webtoons to enrich in background
    const batch = targets.slice(0, 15);
    log(`[Billing Enricher] ${batch.length}개 완결 웹툰의 유료/무료 편수 및 요금 정보를 보강 중...`);
    
    let successCount = 0;
    for (const item of batch) {
      const success = await enrichBillingInfo(item);
      if (success) successCount++;
      // polite delay to prevent rate limit issues
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    if (successCount > 0) {
      // Update in our master list
      batch.forEach(bItem => {
        const idx = webtoons.findIndex(w => w.id === bItem.id);
        if (idx !== -1) {
          webtoons[idx] = bItem;
        }
      });
      saveWebtoons(webtoons);
      log(`[Billing Enricher] 성공적으로 완결 과금 정보 보강 완료 (성공: ${successCount}건 / 대상: ${batch.length}건)`);
    }
  } catch (e: any) {
    log(`[Billing Enricher] 보강 도중 오류 발생: ${e.message}`);
  } finally {
    isEnrichingBilling = false;
  }
}

// API Route: Webtoons list
app.get("/api/webtoons", (req, res) => {
  const { platform, day, status, genre, q, price } = req.query;
  const pageNum = parseInt((req.query.page as string) || "1");
  const limitNum = parseInt((req.query.limit as string) || "6");
  let webtoons = loadWebtoons();

  // Trigger background enrichment for completed webtoons missing billing info
  enrichMissingBillingBackground().catch(() => {});

  // Filter: platform
  if (platform && platform !== "all") {
    webtoons = webtoons.filter(w => w.platform.toLowerCase() === (platform as string).toLowerCase());
  }

  // Filter: day
  if (day && day !== "all") {
    if (day === "finished") {
      webtoons = webtoons.filter(w => w.isEnd === true || w.updateDays.includes("finished") || w.updateDays.includes("FINISHED"));
    } else {
      const targetDay = (day as string).toUpperCase();
      webtoons = webtoons.filter(w => !w.isEnd && w.updateDays.map(d => d.toUpperCase()).includes(targetDay));
    }
  }

  // Filter: status
  if (status && status !== "all") {
    if (status === "ongoing") {
      webtoons = webtoons.filter(w => !w.isEnd);
    } else if (status === "finished") {
      webtoons = webtoons.filter(w => w.isEnd);
    } else if (status === "hiatus") {
      webtoons = webtoons.filter(w => w.isHiatus);
    }
  }

  // Filter: price (free vs paid)
        if (price && price !== "all") {
      if (price === "free") {
        webtoons = webtoons.filter(w => w.isFree === true);
      } else if (price === "paid") {
      webtoons = webtoons.filter(w => w.isFree === false);
    }
  }

// Filter: genres (OR, 멀티선택)
const GENRE_NORMALIZE: Record<string, string> = {
  ACTION_WUXIA:          "무협",
  COMIC_EVERYDAY_LIFE:   "일상",
  FANTASY_DRAMA:         "판타지",
  HORROR_THRILLER:       "스릴러",
  SCHOOL_ACTION_FANTASY: "학원",
  BL:                    "BL",
  // 중복 장르 통합 (방향: 데이터에 있는 이름 → 화면 버튼 이름)
  "의학":                "메디컬",
  "공포":                "스릴러",
  "힐링":                "일상",
  "학원/액션":           "학원",
};
const normalizeGenre = (g: string) => GENRE_NORMALIZE[g] ?? g;

const genresParam = req.query.genres as string | undefined;
if (genresParam) {
  const selectedGenres = genresParam.split(",").map(g => g.trim()).filter(Boolean);
  const wants18 = selectedGenres.includes("18+");
  const otherGenres = selectedGenres.filter(g => g !== "18+");

  webtoons = webtoons.filter(w => {
    // 장르 조건: 선택한 장르가 없으면(18+만 눌렀으면) 통과, 있으면 매치되는지 확인
    const genreMatch = otherGenres.length === 0
      ? true
      : (w.genres && w.genres.some((g: string) => otherGenres.includes(normalizeGenre(g))));
    // 18+ 조건: 체크했으면 성인 웹툰만, 안 했으면 상관없음
    const adultMatch = wants18 ? w.isAdult === true : true;
    return genreMatch && adultMatch;
  });
}
  // Filter: query (title or author)
  if (q && typeof q === "string") {
    const search = q.toLowerCase().trim();
    webtoons = webtoons.filter(w => 
      w.title.toLowerCase().includes(search) || 
      w.author.toLowerCase().includes(search)
    );
  }
const sort = String(req.query.sort || "default");
if (sort === "updated") {
  webtoons = [...webtoons].sort((a, b) => (b.isUp ? 1 : 0) - (a.isUp ? 1 : 0));
} else if (sort === "newest") {
  webtoons = [...webtoons].sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0));
} else if (sort === "free") {
  webtoons = [...webtoons].sort((a, b) => (b.freeEpisodes || 0) - (a.freeEpisodes || 0));
}

const ids = req.query.ids as string;
if (ids) {
  const idList = ids.split(",");
  webtoons = webtoons.filter(w => idList.includes(w.id));
}

const start = (pageNum - 1) * limitNum;
  const paginated = webtoons.slice(start, start + limitNum);
  
  res.json({ 
    webtoons: paginated,
    total: webtoons.length,
    hasMore: start + limitNum < webtoons.length
  });
});

// API Route: Single webtoon live update and self-healing
app.post("/api/webtoons/:id/update-info", async (req, res) => {
  const { id } = req.params;
  try {
    const webtoons = loadWebtoons();
    const idx = webtoons.findIndex(w => w.id === id);
    if (idx === -1) {
      return res.status(404).json({ success: false, error: "웹툰을 찾을 수 없습니다." });
    }

    const webtoon = webtoons[idx];
    log(`[Live Updater] '${webtoon.title}' (${webtoon.platform}) 상세 정보 실시간 크롤링 및 자가 치유를 가동합니다.`);

    let success = false;

    if (webtoon.platform === "naver") {
      // 1. Fetch Naver API billing info
      const titleId = webtoon.webtoonId;
      const apiRes = await fetch(`https://comic.naver.com/api/article/list?titleId=${titleId}&page=1&sort=DESC`);
      if (apiRes.ok) {
        const data = await apiRes.json();
        const totalEpisodes = data.totalCount || 0;
        const isDailyPass = data.dailyPass === true;
        const dailyPassDuration = data.dailyPassDuration || 0;
        
        let paidEpisodes = 0;
        if (data.articleList && Array.isArray(data.articleList)) {
          paidEpisodes = data.articleList.filter((a: any) => a.charge === true).length;
        }
        
        const freeEpisodes = totalEpisodes - paidEpisodes;
        
        webtoon.totalEpisodes = totalEpisodes;
        webtoon.isDailyPass = isDailyPass;
        webtoon.dailyPassDuration = dailyPassDuration;
        webtoon.paidEpisodes = paidEpisodes;
        webtoon.freeEpisodes = freeEpisodes;
        if (webtoon.isFree !== true) {
  webtoon.isFree = !isDailyPass && paidEpisodes === 0;
}

        // If completed, detect end preview counts
        if (webtoon.isEnd && paidEpisodes > 0) {
          webtoon.previewCount = paidEpisodes;
        }
      }

      // 2. Fetch Naver web page for image healing and paid conversion notices
      try {
        const pageRes = await fetch(`https://comic.naver.com/webtoon/list?titleId=${titleId}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
          }
        });
        if (pageRes.ok) {
          const htmlText = await pageRes.text();
          
          // Image healing
          const ogImgMatch = htmlText.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) || 
                             htmlText.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
          if (ogImgMatch && ogImgMatch[1]) {
            webtoon.img = ogImgMatch[1];
          }

          // Pay conversion notice (e.g. "7월 14일 (화) 부터 유료로 제공될 예정입니다")
          if (htmlText.includes("유료로 제공될 예정") || htmlText.includes("유료로 전환") || htmlText.includes("유료 전환")) {
            webtoon.isPayNotice = true;
            const dateMatch = htmlText.match(/(\d+월\s*\d+일)/);
            if (dateMatch) {
              webtoon.payNoticeDate = dateMatch[1];
            } else {
              webtoon.payNoticeDate = "가까운 요일 내 유료 전환 예정";
            }
          } else {
            webtoon.isDailyPass = webtoon.isDailyPass || false;
          }
        }
      } catch (e: any) {
        log(`[API 에러] '${webtoon.title}' 네이버 페이지 파싱 실패: ${e.message}`);
      }

       webtoon.url = `https://comic.naver.com/webtoon/list?titleId=${titleId}`; 
      success = true;

} else if (webtoon.platform === "kakaoPage") {
  webtoon.url = `https://page.kakao.com/content/${webtoon.webtoonId}`;
  success = true;
} else {
  // For Kakao (webtoon.kakao.com)
  try {
    const contentUrl = itemUrlString(webtoon);
    webtoon.url = contentUrl;
    const resHtml = await fetch(contentUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Referer": "https://webtoon.kakao.com"
      }
    });

    if (resHtml.ok) {
      const htmlText = await resHtml.text();
      const ogImgMatch = htmlText.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) ||
                         htmlText.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
      const videoSourceMatch = htmlText.match(/<source\s+[^>]*(?:data-src|src)=["']([^"']+\.(?:webm|mp4|mov)[^"']*)["']/i) ||
                               htmlText.match(/(?:data-src|src)=["']([^"']+\.(?:webm|mp4|mov)[^"']*)["']/i);

      if (videoSourceMatch && videoSourceMatch[1]) {
        webtoon.img = videoSourceMatch[1];
        log(`[Live Updater] '${webtoon.title}'의 카카오 비디오 썸네일 복구 완료`);
      } else if (ogImgMatch && ogImgMatch[1]) {
        webtoon.img = ogImgMatch[1];
        log(`[Live Updater] '${webtoon.title}'의 카카오 이미지 치유 완료: ${webtoon.img}`);
      }

      const isWaitFree = htmlText.includes("기다무") || htmlText.includes("기다리면 무료");
      webtoon.isDailyPass = isWaitFree;
      webtoon.isFree = !isWaitFree && htmlText.includes("FREE_PUBLISHING");
      if (isWaitFree) webtoon.dailyPassDuration = htmlText.includes("12시간") ? 12 : 24;

      const totalMatch = htmlText.match(/전체\s*(\d+)화/);
      if (totalMatch) {
        webtoon.totalEpisodes = parseInt(totalMatch[1], 10);
        webtoon.freeEpisodes = isWaitFree ? Math.max(5, Math.floor(webtoon.totalEpisodes * 0.1)) : webtoon.totalEpisodes;
        webtoon.paidEpisodes = webtoon.totalEpisodes - webtoon.freeEpisodes;
      }
      success = true;
    }
  } catch (e: any) {
    log(`[Kakao API 에러] '${webtoon.title}': ${e.message}`);
  }
}

    if (success) {
      webtoons[idx] = webtoon;
      saveWebtoons(webtoons);
      res.json({ success: true, webtoon: webtoon, message: `성공적으로 '${webtoon.title}'의 완결/과금 요금 정보를 보강 및 복구했습니다.` });
    } else {
      res.status(500).json({ success: false, error: "과금 정보 보강에 실패했습니다." });
    }

  } catch (err: any) {
    log(`[Live Updater 실패] 에러: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Helper for live updater content URL
function itemUrlString(w: any): string {
  if (w.platform === "kakaoPage") {
    return `https://page.kakao.com/content/${w.webtoonId}`;
  }
  if (w.platform === "kakao") {
    // Kakao Webtoon uses webtoon.kakao.com/content/title/id format
    return `https://webtoon.kakao.com/content/${encodeURIComponent(w.title)}/${w.webtoonId}`;
  }
  return w.url;
}

// 네이버 완결 전체 페이지네이션 수집 (공용 함수)
const fetchNaverFinished = async (): Promise<any[]> => {
  const all: any[] = [];
  let page = 1;
  while (true) {
    try {
      const res = await fetch(
        `https://comic.naver.com/api/webtoon/titlelist/finished?page=${page}`
      );
      if (!res.ok) break;
      const data = await res.json();
      const list: any[] = Array.isArray(data.titleList) ? data.titleList : [];
      if (list.length === 0) break;
      all.push(...list.map((item: any) => ({ ...item, crawledWeek: "finished" })));
      log(`[네이버 완결] page=${page} → ${list.length}건 (누적 ${all.length}건)`);
      const totalCount = data.totalCount ?? null;
      if (totalCount != null && all.length >= totalCount) break;
      if (list.length < 20) break;
      page++;
      await new Promise(r => setTimeout(r, 150));
      if (page > 500) break;
    } catch (e: any) {
      log(`[네이버 완결] page=${page} 에러: ${e.message}`);
      break;
    }
  }
  log(`[네이버 완결] 완료 — 총 ${all.length}건`);
  return all;
};

function itemUrl(url: string): string {
  if (url.startsWith("//")) return "https:" + url;
  return url;
}

async function resGovText(res: any): Promise<string> {
  return await res.text();
}

// API Route: Crawl korea-webtoon-api (daily crawl mock / trigger) -> Scrapes Naver Webtoon Official API directly
app.post("/api/admin/crawl", async (req, res) => {
  try {
    log("실시간 공식 네이버웹툰 API 연동 수집기 가동 중...");
    
    const weeks = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "dailyPlus"];
    const fetchPromises: Promise<any[]>[] = [];

    // 1. Fetch ongoing webtoons by weekday
    for (const week of weeks) {
      const url = `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${week}`;
      fetchPromises.push(
        fetch(url)
          .then(async (response) => {
            if (!response.ok) return [];
            const data = await response.json();
            const list = data && Array.isArray(data.titleList) ? data.titleList : [];
            return list.map((item: any) => ({ ...item, crawledWeek: week }));
          })
          .catch((e) => {
            log(`네이버웹툰 요일별 가져오기 실패 [week=${week}]: ${e.message}`);
            return [];
          })
      );
    }

    // 2. Fetch completed webtoons
// 네이버 완결 전체 페이지네이션 수집
fetchPromises.push(fetchNaverFinished());

    const results = await Promise.all(fetchPromises);
    const rawItems = results.flat();

    log(`네이버 공식 API로부터 총 ${rawItems.length}개의 로우 데이터를 수집했습니다. DB 통합 및 정규화를 시작합니다.`);

    if (rawItems.length === 0) {
      throw new Error("네이버 웹툰 API로부터 어떠한 데이터도 가져오지 못했습니다. 일시적인 장애일 수 있습니다.");
    }

    const localWebtoons = loadWebtoons();
    const localMap = new Map<string, any>();
    // Pre-populate with seed data so we don't lose custom curated seed items
    localWebtoons.forEach(w => localMap.set(w.id, w));

    let updatedCount = 0;
    let addedCount = 0;

    rawItems.forEach((ext: any) => {
      if (!ext || !ext.titleId) return;

      const compositeId = `naver_${ext.titleId}`;
      const title = ext.titleName || "제목 없음";
      const authorVal = ext.author || "작가 미상";
      const thumbnailVal = ext.thumbnailUrl || "";
      const isEndVal = ext.finish || ext.crawledWeek === "finished";
      const isNewVal = ext.new || false;
      const isUpVal = ext.up || false;
      const isHiatusVal = ext.rest || false;
      const isFreeVal = true;

      const dayStr = ext.crawledWeek.toUpperCase(); // e.g. "MON", "TUE", ... "FINISHED"

      const existing = localMap.get(compositeId);
      if (existing) {
        // Update keeping genres if they exist
        const updatedDays = new Set(existing.updateDays || []);
        if (dayStr !== "FINISHED") {
          updatedDays.add(dayStr);
        } else {
          updatedDays.add("finished");
        }

        localMap.set(compositeId, {
          ...existing,
          title,
          author: authorVal,
          img: thumbnailVal || existing.img,
          url: `https://comic.naver.com/webtoon/list?titleId=${ext.titleId}`,
          updateDays: Array.from(updatedDays),
          isEnd: isEndVal,
          isNew: isNewVal,
          isUp: isUpVal,
          isHiatus: isHiatusVal,
          isFree: isFreeVal,
  isAdult: ext.adult || false,
          platform: "naver"
        });
        updatedCount++;
      } else {
        // Create new
        const guessedGenres = guessGenreByTitle(title);
        localMap.set(compositeId, {
          id: compositeId,
          webtoonId: String(ext.titleId),
          title,
          author: authorVal,
          img: thumbnailVal,
          url: `https://comic.naver.com/webtoon/list?titleId=${ext.titleId}`,
          updateDays: dayStr === "FINISHED" ? ["finished"] : [dayStr],
          isEnd: isEndVal,
          isNew: isNewVal,
          isUp: isUpVal,
          isHiatus: isHiatusVal,
          isFree: isFreeVal,
  isAdult: ext.adult || false,
          platform: "naver",
          genres: guessedGenres
        });
        addedCount++;
      }
    });

    const merged = Array.from(localMap.values());
    saveWebtoons(merged);

    const stats = loadStats();
    stats.lastCrawlRun = new Date().toISOString();
    saveStats(stats);

    log(`크롤링 동기화 완료: 신규 추가 ${addedCount}건, 기존 업데이트 ${updatedCount}건. 총 데이터 수: ${merged.length}건`);
    res.json({
      success: true,
      added: addedCount,
      updated: updatedCount,
      total: merged.length,
      message: `공식 네이버웹툰 API 연동 완료 (추가: ${addedCount}건, 업데이트: ${updatedCount}건. 총 ${merged.length}개 웹툰 활성화)`
    });

  } catch (err: any) {
    log(`크롤링 실패 에러: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Normalize genre helper from API
function normalizeGenreLabel(genre: string): string {
  if (!genre) return "드라마";
  // Remove slash or use first part as instructed (e.g. "로맨스/순정" -> "로맨스/순정" or first token: "로맨스")
  let normalized = genre.trim();
  // We can strip special tags
  normalized = normalized.replace(/도서|소설|만화/g, "");
  // If slash, split and clean
  if (normalized.includes("/")) {
    normalized = normalized.split("/")[0].trim();
  }
  
  // Map standard genres
  const stdMap: Record<string, string> = {
    "순정": "로맨스/순정",
    "로맨스": "로맨스/순정",
    "판타지": "판타지",
    "무협": "무협",
    "액션": "액션",
    "드라마": "드라마",
    "스릴러": "스릴러",
    "개그": "개그",
    "코믹": "개그",
    "일상": "일상",
    "공포": "스릴러",
    "추리": "스릴러",
    "미스터리": "스릴러",
    "SF": "판타지",
    "스포츠": "스포츠",
    "학원": "학원",
    "느와르": "느와르"
  };

  for (const key of Object.keys(stdMap)) {
    if (normalized.includes(key)) {
      return stdMap[key];
    }
  }

  return normalized || "드라마";
}

// API Route: Enrich genres (incremental genre enrichment via Manhwa Gyujanggak API)
app.post("/api/admin/enrich", async (req, res) => {
  try {
    const webtoons = loadWebtoons();
    // 장르 없거나, 드라마 단일(guessGenreByTitle 폴백)인 경우 모두 보강 대상
    const targets = webtoons.filter(w =>
      !w.genres || w.genres.length === 0 ||
      (w.genres.length === 1 && w.genres[0] === "드라마")
    );
    
    if (targets.length === 0) {
      log("모든 웹툰의 장르가 이미 확보되어 있습니다. 보강할 대상이 없습니다.");
      return res.json({ success: true, count: 0, message: "보강할 작품이 없습니다." });
    }

    const API_KEY = process.env.MANHWA_GYUJANGGAK_API_KEY || "fd5ba671ce0a475d57f754d8b2987581";
    const API_BASE = process.env.MANHWA_GYUJANGGAK_API_BASE || "https://www.kmas.or.kr";
    
    // Batch size of 30 as requested (incremental search)
    const batchSize = Math.min(30, targets.length);
    log(`장르 미등록 작품 ${targets.length}개 중 ${batchSize}개 작품 장르 보강을 진행합니다...`);
    
    let enrichedCount = 0;
    let fallbackCount = 0;
    let geminiCount = 0;

    for (let i = 0; i < batchSize; i++) {
      const item = targets[i];
      let foundGenres: string[] = [];

      try {
        // Try calling the Manhwa Gyujanggak API
        const url = `${API_BASE}/openapi/search/bookAndWebtoonList?prvKey=${API_KEY}&title=${encodeURIComponent(item.title)}`;
        const resGov = await fetch(url);
        
        if (resGov.ok) {
          const bodyText = await resGov.text();
          let parsedGenre = "";

          // Support both JSON or XML parsed via regex
          if (bodyText.trim().startsWith("{")) {
            const jsonGov = JSON.parse(bodyText);
            const list = jsonGov.resultList || jsonGov.result || [];
            if (list.length > 0) {
              parsedGenre = list[0].mainGenreCdNm || "";
            }
          } else {
            // Regex match <mainGenreCdNm>...</mainGenreCdNm>
            const match = bodyText.match(/<mainGenreCdNm>(.*?)<\/mainGenreCdNm>/);
            if (match && match[1]) {
              parsedGenre = match[1];
            }
          }

          if (parsedGenre) {
            const normalized = normalizeGenreLabel(parsedGenre);
            foundGenres = [normalized];
            enrichedCount++;
            log(`[만화규장각 API] '${item.title}' -> 장르 검색 성공: ${normalized}`);
          }
        }
      } catch (e: any) {
        // Suppress and fall through to fallback
        log(`[API 에러] '${item.title}' 만화규장각 API 호출 오류: ${e.message}`);
      }

      // Fallback 1: Local guess map
      if (foundGenres.length === 0) {
        foundGenres = guessGenreByTitle(item.title);
        fallbackCount++;
        log(`[로컬 분류 엔진] '${item.title}' -> 로컬 추정 장르 설정: ${foundGenres.join(", ")}`);
      }

      // Update in our array
      const idx = webtoons.findIndex(w => w.id === item.id);
      if (idx !== -1) {
        webtoons[idx].genres = foundGenres;
      }
    }

    saveWebtoons(webtoons);

    const stats = loadStats();
    stats.lastEnrichRun = new Date().toISOString();
    saveStats(stats);

    log(`장르 보강 완료! 총 ${batchSize}개 진행 - 만화규장각 API 매칭: ${enrichedCount}건, AI 보강: ${geminiCount}건, 텍스트 추정 매칭: ${fallbackCount}건`);
    res.json({
      success: true,
      count: batchSize,
      apiEnriched: enrichedCount,
      geminiEnriched: geminiCount,
      fallbackEnriched: fallbackCount,
      message: `성공적으로 장르를 보강했습니다 (${batchSize}개 완료)`
    });

  } catch (err: any) {
    log(`장르 보강 실패 에러: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function discoverKakaoTitlesByGenre(genreKeyword, isKakaoPage) {
  const platformLabel = isKakaoPage ? "카카오페이지" : "카카오웹툰";
  const domainPattern = isKakaoPage
    ? /page\.kakao\.com\/content\/(\d+)/
    : /webtoon\.kakao\.com\/content\/[^/]+\/(\d+)/;

  const items = await searchNaverWeb(`${platformLabel} ${genreKeyword} 웹툰 추천`, 20);
  const results = [];
  for (const item of items) {
    const m = item.link.match(domainPattern);
    if (m) {
      results.push({
        webtoonId: m[1],
        title: item.title.replace(/<[^>]+>/g, ""),
        url: item.link
      });
    }
  }
  return results;
}

// 카카오페이지 크롤 (네이버 검색 API 기반 - 안정적)
app.post("/api/admin/crawl-kakaopage", async (req, res) => {
  try {
    const webtoons = loadWebtoons();
    const existingIds = new Set(webtoons.map(w => w.id));
    let addedCount = 0;
    let bffSuccess = false;

    // ── 전략 1: bff-page.kakao.com (공식, 토큰 없을 때 403 날 수 있음) ──
    const DAY_MAP: Record<string, string> = {
      "월": "MON", "화": "TUE", "수": "WED", "목": "THU",
      "금": "FRI", "토": "SAT", "일": "SUN"
    };
    const KPAGE_GENRE_MAP: Record<string, string[]> = {
      "로판":     ["로맨스/순정", "판타지"],
      "로맨스":   ["로맨스/순정"],
      "판타지":   ["판타지"],
      "액션":     ["액션"],
      "드라마":   ["드라마"],
      "무협":     ["무협"],
      "스릴러":   ["스릴러"],
      "공포":     ["공포", "스릴러"],
      "개그":     ["개그"],
      "일상":     ["일상"],
      "학원":     ["학원"],
      "BL":       ["BL"],
      "GL":       ["GL"],
      "스포츠":   ["스포츠"],
      "미스터리": ["미스터리"],
      "의학":     ["의학"],
      "아이돌":   ["아이돌"],
      "힐링":     ["일상", "힐링"],
    };

    const parseBffItem = (item: any, genreHint: string[] = []): any | null => {
      if (!item?.series_id) return null;
      const rawId = String(item.series_id);
      const compositeId = `kakaoPage_${rawId}`;
      existingIds.add(compositeId);

    const cardImg = item.asset_property?.card_img || item.thumbnail || "";
    const thumbnail = cardImg
      ? `https://dn-img-page.kakao.com/download/resource?kid=${cardImg}&filename=th3`
      : "";

      const pubPeriod = item.pub_period || "";
      const isEnd = item.state === "ST60" || pubPeriod === "완결";
      const updateDays = isEnd
        ? ["finished"]
        : pubPeriod.split(",").map((d: string) => DAY_MAP[d.trim()] || d.trim()).filter(Boolean);

      const rawGenreSources: string[] = [
        item.sub_category,
        ...(item.genre_tags || []),
        ...(item.tags || []),
      ].filter(Boolean);
      const genres: string[] = [...new Set([
        ...rawGenreSources.flatMap((g: string) => KPAGE_GENRE_MAP[g] || [g]),
        ...genreHint, // 어떤 장르 코너에서 긁어왔는지도 장르로 인정
      ])].filter(Boolean);

      const isDailyPass = !!item.is_waitfree;
        return {
          id: compositeId,
          webtoonId: rawId,
          title: item.title || "제목 없음",
          author: item.authors || "작가 미상",
          img: thumbnail,
          url: `https://page.kakao.com/content/${rawId}`,
          updateDays: updateDays.length > 0 ? updateDays : ["unknown"],
          isEnd,
          isNew: false,
          isUp: false,
          platform: "kakaoPage",
          genres: genres.length > 0 ? genres : ["드라마"],
          isFree: !!item.is_all_free,
          isDailyPass,
          dailyPassDuration: item.waitfree_period_by_minute
            ? Math.round(item.waitfree_period_by_minute / 60)
            : 24,
          freeEpisodes: item.free_slide_count || 0,
          isAdult: (item.age_grade || 0) >= 18,
        };
      };

 // 카카오페이지 장르 전체보기 (subcategory_uid=0 = 전체 장르) 페이지네이션 수집
async function fetchKakaoPageGenreAll(isComplete, label, onItem) {
  let page = 0;
  let totalAdded = 0;
  let receivedCount = 0;
  let knownTotal = null;

  while (true) {
    const url = `https://bff-page.kakao.com/api/gateway/view/v1/landing/genre?category_uid=10&subcategory_uid=0&is_complete=${isComplete}&screen_uid=82&page=${page}`;
    let res;
    try {
      res = await fetch(url, {
        headers: {
          "accept": "application/json, text/plain, */*",
          "accept-language": "ko-KR,ko;q=0.9",
          "origin": "https://page.kakao.com",
          "referer": "https://page.kakao.com/",
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        },
      });
    } catch (e) {
      log(`[카카오페이지 ${label}] page=${page} 요청 에러: ${e.message}`);
      break;
    }

    if (!res.ok) {
      log(`[카카오페이지 ${label}] page=${page} 실패: ${res.status}`);
      break;
    }

    const data = await res.json();
    if (page === 0) {
      knownTotal = data?.result?.total_count ?? null;
      log(`[카카오페이지 ${label} 응답키] result: ${Object.keys(data?.result || {}).join(", ")}`);
      log(`[카카오페이지 ${label}] 서버가 말하는 총 작품 수: ${knownTotal}`);
    }

    const pageItems = extractKakaoPageItems(data);

    if (!pageItems || pageItems.length === 0) {
      log(`[카카오페이지 ${label}] page=${page}에서 항목 없음 → 종료`);
      break;
    }

    for (const item of pageItems) {
      const added = onItem(item);
      if (added) totalAdded++;
    }
    receivedCount += pageItems.length;

    log(`[카카오페이지 ${label}] page=${page} → ${pageItems.length}건 처리 (누적 수신 ${receivedCount}/${knownTotal ?? "?"}건, 누적 신규 ${totalAdded}건)`);

    // total_count를 알고 있으면 정확하게 그 시점에 종료
    if (knownTotal != null && receivedCount >= knownTotal) {
      log(`[카카오페이지 ${label}] 전체 ${knownTotal}건 수신 완료 → 종료`);
      break;
    }

    page++;
    await new Promise(r => setTimeout(r, 200));

    // total_count를 모를 때만 쓰는 안전장치 (넉넉하게 상향)
    if (knownTotal == null && page > 1000) {
      log(`[카카오페이지 ${label}] 안전장치 발동: 1000페이지 초과로 중단`);
      break;
    }
  }

  log(`[카카오페이지 ${label}] 완료 — 총 신규 ${totalAdded}건 추가 (전체 수신 ${receivedCount}건)`);
  return totalAdded;
}
    // bff-page 요일별 + 완결 수집
// 장르 탭별 실제 화면 ID (직접 개발자도구로 찾으신 값들)
const KPAGE_SCREEN_ENDPOINTS = [
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=48", genreHint: [], label: "전체랭킹" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=57", genreHint: ["로맨스/순정"], label: "로맨스" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=56", genreHint: ["로맨스/순정", "판타지"], label: "로판" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=59", genreHint: ["판타지"], label: "판타지" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=61", genreHint: ["액션"], label: "액션" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=60", genreHint: ["드라마"], label: "드라마" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=62", genreHint: ["무협"], label: "무협" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=58", genreHint: ["BL"], label: "BL" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=55", genreHint: [], label: "남성인기" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/landing/ranking?category_uid=10&screen_uid=54", genreHint: [], label: "여성인기" },
  { url: "https://bff-page.kakao.com/api/gateway/view/v1/layout?screen_uid=86", genreHint: [], label: "연재무료" },
];

// 응답 구조가 엔드포인트마다 다를 수 있어서, 여러 형태를 순서대로 시도해봄
function extractKakaoPageItems(data) {
  const items = [];

  // 케이스 1: result.reference.series_card_view 안에 실제 카드 데이터가 있는 구조
  // (예: layout?screen_uid=86 같은 "연재무료" 페이지)
  const refViews = data?.result?.reference;
  if (refViews) {
    const viewKeys = ["series_card_view", "series_poster_view", "series_list_view"];
    for (const viewKey of viewKeys) {
      const viewData = refViews[viewKey];
      if (!viewData) continue;
      for (const refKey of Object.keys(viewData)) {
        const arr = viewData[refKey];
        if (Array.isArray(arr) && arr.length > 0) {
          items.push(...arr);
        }
      }
    }
  }
  if (items.length > 0) return items;

  // 케이스 2: 기존 구조들 (랭킹 페이지 등)
  if (Array.isArray(data?.result?.list)) return data.result.list;
  if (Array.isArray(data?.result?.cardGroups)) {
    return data.result.cardGroups.flatMap((g) => (g.cards || []).map((c) => c.content || c));
  }
  if (Array.isArray(data?.result?.sections)) {
    return data.result.sections.flatMap((s) =>
      (s.cardGroups || []).flatMap((g) => (g.cards || []).map((c) => c.content || c))
    );
  }
  if (Array.isArray(data?.result?.items)) return data.result.items;
  if (Array.isArray(data?.result?.layout)) {
    return data.result.layout.flatMap((l) =>
      (l.card_groups || l.cardGroups || []).flatMap((g) =>
        (g.cards || []).map((c) => c.content || c.series || c)
      )
    );
  }
  if (Array.isArray(data?.data)) {
    return data.data.flatMap((s) =>
      (s.cardGroups || []).flatMap((g) => (g.cards || []).map((c) => c.content || c))
    );
  }
  return [];
}

for (const { url, genreHint, label } of KPAGE_SCREEN_ENDPOINTS) {
  const isFreeEndpoint = url.includes("screen_uid=86"); // 연재무료 엔드포인트
  try {
    const apiRes = await fetch(url, {
      headers: {
        "accept": "application/json, text/plain, */*",
        "accept-language": "ko-KR,ko;q=0.9",
        "origin": "https://page.kakao.com",
        "referer": "https://page.kakao.com/",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      },
    });
    if (!apiRes.ok) {
      log(`[카카오페이지 ${label}] 실패: ${apiRes.status}`);
      continue;
    }
    bffSuccess = true;
    const data = await apiRes.json();
    const rawItems = extractKakaoPageItems(data);

    if (rawItems.length === 0) {
      // 파싱 실패 시 원인 파악용 로그 (여기 로그를 캡쳐해서 알려주시면 바로 맞춰드릴 수 있어요)
      log(`[카카오페이지 ${label}] 항목을 못 찾음. 응답 최상위 키: ${Object.keys(data || {}).join(", ")}`);
    } else {
      log(`[카카오페이지 ${label}] ${rawItems.length}건 발견`);
    }

   for (const item of rawItems) {
  const rawId = String(item.series_id);
  const compositeId = `kakaoPage_${rawId}`;
  
  if (isFreeEndpoint) {
    // 연재무료 엔드포인트: 기존에 있으면 isFree만 true로 업데이트
    const idx = webtoons.findIndex(w => w.id === compositeId);
    if (idx !== -1) {
      webtoons[idx].isFree = true;
      continue;
    }
  } else {
    if (existingIds.has(compositeId)) continue;
  }
  
  const entry = parseBffItem(item, genreHint);
  if (entry) {
    if (isFreeEndpoint) entry.isFree = true;
    webtoons.push(entry);
    addedCount++;
  }
}
    await new Promise(r => setTimeout(r, 250));
  } catch (e: any) {
    log(`[카카오페이지 ${label} 에러] ${e.message}`);
  }
}

    log(`[카카오페이지 bff] ${bffSuccess ? `수집 완료 ${addedCount}건` : "전체 실패 → 네이버 검색 fallback으로 전환"}`);

// ── 연재중 전체 (장르 무관, subcategory_uid=0) ──
try {
  const added = await fetchKakaoPageGenreAll(false, "연재중 전체", (item) => {
    const rawId = String(item.series_id);
    if (!rawId || rawId === "undefined") return false;
    const compositeId = `kakaoPage_${rawId}`;
    if (existingIds.has(compositeId)) return false;
    existingIds.add(compositeId);

    const entry = parseBffItem(item, []);
    if (entry) {
      webtoons.push(entry);
      return true;
    }
    return false;
  });
  addedCount += added;
  saveWebtoons(webtoons); // ← 중간 저장 추가
  log(`[중간 저장] 연재중 전체 수집 후 저장 완료 (총 ${webtoons.length}건)`);
} catch (e) {
  log(`[카카오페이지 연재중 전체 에러] ${e.message}`);
}
// ── 완결 전체 (장르 무관, subcategory_uid=0) ──
try {
  const added = await fetchKakaoPageGenreAll(true, "완결 전체", (item) => {
    const rawId = String(item.series_id);
    if (!rawId || rawId === "undefined") return false;
    const compositeId = `kakaoPage_${rawId}`;

    const existingIdx = webtoons.findIndex(w => w.id === compositeId);
    if (existingIdx !== -1) {
      webtoons[existingIdx].isEnd = true;
      webtoons[existingIdx].updateDays = ["finished"];
      return false;
    }
    if (existingIds.has(compositeId)) return false;
    existingIds.add(compositeId);

    const entry = parseBffItem(item, []);
    if (entry) {
      entry.isEnd = true;
      entry.updateDays = ["finished"];
      webtoons.push(entry);
      return true;
    }
    return false;
  });
  addedCount += added;
} catch (e) {
  log(`[카카오페이지 완결 전체 에러] ${e.message}`);
}

    // ── 전략 2: 네이버 검색 API fallback (bff가 막혔을 때 + 항상 보강) ──
    // 장르 키워드 × 연재상태 조합으로 page.kakao.com 링크를 최대한 긁어옴
    const SEARCH_QUERIES = [
      "카카오페이지 판타지 웹툰 추천",
      "카카오페이지 로맨스 웹툰 추천",
      "카카오페이지 무협 웹툰 추천",
      "카카오페이지 액션 웹툰 추천",
      "카카오페이지 드라마 웹툰 추천",
      "카카오페이지 스릴러 웹툰 추천",
      "카카오페이지 BL 웹툰 추천",
      "카카오페이지 일상 웹툰 추천",
      "카카오페이지 완결 판타지 웹툰",
      "카카오페이지 완결 무협 웹툰",
      "카카오페이지 완결 로맨스 웹툰",
      "카카오페이지 신작 웹툰 2024",
      "카카오페이지 인기 웹툰 순위",
      "카카오페이지 기다리면 무료 웹툰",
      "page.kakao.com 웹툰 연재",
    ];

    const GENRE_KEYWORD_MAP: Record<string, string[]> = {
      "판타지": ["판타지"],
      "로맨스": ["로맨스/순정"],
      "무협":   ["무협"],
      "액션":   ["액션"],
      "드라마": ["드라마"],
      "스릴러": ["스릴러"],
      "BL":     ["BL"],
      "일상":   ["일상"],
    };

    const ID_PATTERN = /page\.kakao\.com\/content\/(\d+)/;

    let naverAddedCount = 0;
    for (const query of SEARCH_QUERIES) {
      try {
        const items = await searchNaverWeb(query, 20);
        for (const item of items) {
          const m = item.link.match(ID_PATTERN);
          if (!m) continue;
          const rawId = m[1];
          const compositeId = `kakaoPage_${rawId}`;
          if (existingIds.has(compositeId)) continue;
          existingIds.add(compositeId);

          // 제목 정제
          const title = item.title.replace(/<[^>]+>/g, "").trim();
          if (!title) continue;

          // 쿼리에서 장르 힌트 추출
          let genres: string[] = ["드라마"];
          for (const [kw, mapped] of Object.entries(GENRE_KEYWORD_MAP)) {
            if (query.includes(kw)) { genres = mapped; break; }
          }
          // 제목 기반 추가 추정
          const guessed = guessGenreByTitle(title);
          genres = [...new Set([...genres, ...guessed])];

          const isEnd = query.includes("완결") ||
            item.description?.includes("완결") || false;

          webtoons.push({
            id: compositeId,
            webtoonId: rawId,
            title,
            author: "작가 미상",
            img: "",          // update-info로 나중에 채움
            url: `https://page.kakao.com/content/${rawId}`,
            updateDays: isEnd ? ["finished"] : ["unknown"],
            isEnd,
            isNew: false,
            isUp: false,
            platform: "kakaoPage",
            genres,
            isFree: false,
            isDailyPass: true,
            dailyPassDuration: 24,
          });
          naverAddedCount++;
        }
        await new Promise(r => setTimeout(r, 150));
      } catch (e: any) {
        log(`[카카오페이지 네이버검색 에러] ${query}: ${e.message}`);
      }
    }

    log(`[카카오페이지 네이버검색] 추가 ${naverAddedCount}건`);
    addedCount += naverAddedCount;

    saveWebtoons(webtoons);
    log(`[카카오페이지 완료] 신규 ${addedCount}건. 총 ${webtoons.length}건`);
    res.json({ success: true, added: addedCount, total: webtoons.length, bffSuccess });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 카카오웹툰 크롤 (네이버 검색 API 기반)
app.post("/api/admin/crawl-kakao", async (req, res) => {
  try {
    const webtoons = loadWebtoons();
    const existingIds = new Set(webtoons.map(w => w.id));
    let addedCount = 0;

    const PLACEMENTS = [
      { key: "timetable_new",       day: "unknown",  isEnd: false },
      { key: "timetable_mon",       day: "MON",      isEnd: false },
      { key: "timetable_tue",       day: "TUE",      isEnd: false },
      { key: "timetable_wed",       day: "WED",      isEnd: false },
      { key: "timetable_thu",       day: "THU",      isEnd: false },
      { key: "timetable_fri",       day: "FRI",      isEnd: false },
      { key: "timetable_sat",       day: "SAT",      isEnd: false },
      { key: "timetable_sun",       day: "SUN",      isEnd: false },
      { key: "timetable_mon_free_publishing", day: "MON", isEnd: false },
      { key: "timetable_tue_free_publishing", day: "TUE", isEnd: false },
      { key: "timetable_wed_free_publishing", day: "WED", isEnd: false },
      { key: "timetable_thu_free_publishing", day: "THU", isEnd: false },
      { key: "timetable_fri_free_publishing", day: "FRI", isEnd: false },
      { key: "timetable_sat_free_publishing", day: "SAT", isEnd: false },
      { key: "timetable_sun_free_publishing", day: "SUN", isEnd: false },
      { key: "timetable_completed_free_publishing", day: "finished", isEnd: true },
    ];

    // 카카오 완결 별도 수집
      try {
        const finUrl = "https://gateway-kw.kakao.com/section/v2/view/content-sorting-option?tag=timetable_finish";
        const finRes = await fetch(finUrl, { headers: { "accept": "application/json", "origin": "https://webtoon.kakao.com", "referer": "https://webtoon.kakao.com/", "user-agent": "Mozilla/5.0" } });
        if (finRes.ok) {
          const finData = await finRes.json();
          const items = finData?.data?.flatMap((s: any) => s.cardGroups?.flatMap((g: any) => g.cards || []) || []) || [];
          for (const card of items) {
            const content = card.content;
            if (!content?.id) continue;
            const compositeId = `kakao_${content.id}`;
            if (existingIds.has(compositeId)) continue;
            existingIds.add(compositeId);
            // ... 기존 카드 파싱 로직 동일하게
          }
        }
      } catch(e: any) { log(`[카카오완결] ${e.message}`); }

    // 영어코드 → 복합 장르 배열 (OR 필터에서 모두 매칭되도록)
    const GENRE_MAP: Record<string, string[]> = {
      ROMANCE:               ["로맨스/순정"],
      ROMANCE_FANTASY:       ["로맨스/순정", "판타지"],
      FANTASY:               ["판타지"],
      ACTION:                ["액션"],
      DRAMA:                 ["드라마"],
      THRILLER:              ["스릴러"],
      COMEDY:                ["개그"],
      MARTIAL_ARTS:          ["무협"],
      SPORTS:                ["스포츠"],
      SLICE_OF_LIFE:         ["일상"],
      SCHOOL:                ["학원"],
      // 누락됐던 복합 코드들
      FANTASY_DRAMA:         ["판타지", "드라마"],
      ACTION_WUXIA:          ["액션", "무협"],
      SCHOOL_ACTION_FANTASY: ["학원", "액션", "판타지"],
      HORROR_THRILLER:       ["공포", "스릴러"],
      COMIC_EVERYDAY_LIFE:   ["개그", "일상"],
      BL:                    ["BL"],
    };

    for (const placement of PLACEMENTS) {
      try {
        const url = `https://gateway-kw.kakao.com/section/v2/timetables/days?placement=${placement.key}`;
        const apiRes = await fetch(url, {
          headers: {
            "accept":          "application/json, text/plain, */*",
            "accept-language": "ko",
            "origin":          "https://webtoon.kakao.com",
            "referer":         "https://webtoon.kakao.com/",
            "user-agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!apiRes.ok) {
          log(`[카카오웹툰] ${placement.key} 실패: ${apiRes.status}`);
          continue;
        }

        const data = await apiRes.json();
        const sections = data?.data || [];

        for (const section of sections) {
          const cardGroups = section.cardGroups || [];
          for (const group of cardGroups) {
            const cards = group.cards || [];
            for (const card of cards) {
              const content = card.content;
              if (!content || !content.id) continue;

const rawId = String(content.id);
          const compositeId = `kakao_${rawId}`;
          const isFreeEndpoint = placement.key.includes("free_publishing");
          const isFree = isFreeEndpoint;

          // 기존에 있으면 isFree만 업데이트하고 skip
          if (existingIds.has(compositeId)) {
            if (isFreeEndpoint) {
              const idx = webtoons.findIndex(w => w.id === compositeId);
              if (idx !== -1) webtoons[idx].isFree = true;
            }
            continue;
          }
          existingIds.add(compositeId);

              // 작가: AUTHOR 타입 우선, 없으면 첫번째
              const authorObj = content.authors?.find((a: any) => a.type === "AUTHOR") || content.authors?.[0];
              const author    = authorObj?.name || "작가 미상";

              // 썸네일: thumbnail 배열 우선, 없으면 다른 이미지 필드
              const rawThumb: string =
                content.thumbnail?.[0] ||
                content.titleImageA ||
                content.featuredCharacterImageA ||
                content.featuredCharacterAnimationFirstFrame ||
                content.titleImageB || "";

              // .jpg 확장자 없으면 붙여줌 (Android WebView Content-Type 문제 방지)
              const thumbnail = rawThumb && !rawThumb.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i)
                ? rawThumb + ".jpg"
                : rawThumb;

              // URL: seoId 있으면 사용
              const seoId = content.seoId || encodeURIComponent(content.title || rawId);
              const webtoonUrl = `https://webtoon.kakao.com/content/${seoId}/${rawId}`;

              // 장르: genreFilters에서 "all" 제외 → 복합 배열로 펼치기 → 중복 제거
              const genreKeys = (card.genreFilters || []).filter((g: string) => g !== "all");
              const genres = [...new Set(
                genreKeys.flatMap((g: string) => GENRE_MAP[g] || [g])
              )].filter(Boolean);

              // 기다무 여부
          const isDailyPass = content.badges?.some((b: any) => 
            b.title === "WAIT_FOR_FREE" || b.title === "기다무"
          ) || false;


              webtoons.push({
              id:               compositeId,
              webtoonId:        rawId,
              title:            content.title || "제목 없음",
              author,
              img:              thumbnail,
              url:              webtoonUrl,
              updateDays:       [placement.day],
              isEnd:            placement.isEnd,
              isNew:            card.additional?.label === "오늘" || false,
              isUp:             false,
              platform:         "kakao",
              genres:           genres.length > 0 ? genres : ["드라마"],
              isFree,
              isDailyPass,
              dailyPassDuration: 24,
              isAdult: content.adult === true || card.additional?.adult === true,  // ← 추가
            });
                          addedCount++;
              log(`[카카오웹툰] 추가: ${content.title} (${rawId})`);
            }
          }
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        log(`[카카오웹툰 에러] ${placement.key}: ${e.message}`);
      }
    }

    saveWebtoons(webtoons);
    log(`[카카오웹툰 완료] 신규 ${addedCount}건. 총 ${webtoons.length}건`);
    res.json({ success: true, added: addedCount, total: webtoons.length });

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/api/admin/validate-kakao", async (req, res) => {
  const webtoons = loadWebtoons();
  const kakaoItems = webtoons.filter(w => w.platform === "kakao");
  const mismatches = [];

  for (const w of kakaoItems) {
    try {
      const url = `https://webtoon.kakao.com/content/${encodeURIComponent(w.title)}/${w.webtoonId}`;
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      const html = await r.text();
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      const pageTitle = titleMatch ? titleMatch[1] : "";
      if (!pageTitle.includes(w.title)) {
        mismatches.push({ id: w.id, expected: w.title, actualPageTitle: pageTitle });
      }
    } catch (e) {
      mismatches.push({ id: w.id, expected: w.title, error: e.message });
    }
  }

  res.json({ total: kakaoItems.length, mismatches });
});

// API Route: Image Proxy (Bypass referer / Hotlink block with native streaming)
app.get("/api/image-proxy", (req, res) => {
  let imageUrl = req.query.url as string;
  if (!imageUrl) {
    return res.status(400).send("Image URL is required");
  }

  // Prepend https: if it's a protocol-relative URL
  if (imageUrl.startsWith("//")) {
    imageUrl = "https:" + imageUrl;
  }

  try {
    const isNaver = imageUrl.includes("naver.com") || imageUrl.includes("pstatic.net");
    const isKakao = imageUrl.includes("kakao.com") || imageUrl.includes("daumcdn.net") || imageUrl.includes("kakaocdn.net") || imageUrl.includes("kakaopagecdn.com") || imageUrl.includes("kr-a.kakaopagecdn.com") || imageUrl.includes("dn-img-page.kakao.com");

    const allowed = isNaver || isKakao || imageUrl.startsWith("https://") || imageUrl.startsWith("http://");
    if (!allowed) {
      return res.status(403).send("Domain not allowed");
    }

    let referer = "";
    if (isNaver) {
      referer = "https://comic.naver.com";
    } else if (isKakao) {
      if (imageUrl.includes("kr-a.kakaopagecdn.com") || imageUrl.includes("kakaopagecdn.com") || imageUrl.includes("dn-img-page")) {
        referer = "https://page.kakao.com";
      } else if (isKakao) {
        referer = "https://webtoon.kakao.com";
      }
    }

    const proxyImageNative = (targetUrl: string, depth: number) => {
      if (res.headersSent) return;

      if (depth > 3) {
         if (!res.headersSent) res.status(404).end();
  return;
      }

      const parsedUrl = new URL(targetUrl);
      const isHttps = parsedUrl.protocol === "https:";
      const client = isHttps ? https : http;

      const headers: Record<string, string> = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      };

      if (referer) {
        headers["Referer"] = referer;
      }

      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttps ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: "GET",
        headers,
        timeout: 10000,
      };

      let requestResponded = false;

      const remoteReq = client.request(options, (remoteRes) => {
        if (res.headersSent || requestResponded) return;

        // Handle redirects
        if (remoteRes.statusCode && remoteRes.statusCode >= 300 && remoteRes.statusCode < 400 && remoteRes.headers.location) {
          let redirectUrl = remoteRes.headers.location;
          if (!redirectUrl.startsWith("http")) {
            redirectUrl = new URL(redirectUrl, targetUrl).href;
          }
          requestResponded = true;
          return proxyImageNative(redirectUrl, depth + 1);
        }

        if (remoteRes.statusCode && remoteRes.statusCode >= 400) {
          requestResponded = true;

          // Naver Image Self-healing fallback on failure
          if (isNaver && depth === 0) {
            const naverTitleMatch = targetUrl.match(/\/webtoon\/(\d+)/) || targetUrl.match(/\/(\d+)\/thumbnail/);
            if (naverTitleMatch) {
              const titleId = naverTitleMatch[1];
              log(`[DB Self-Healing] 네이버 이미지 404 감지 (ID: ${titleId}). 최신 썸네일을 실시간으로 복구 중...`);
              
              fetch(`https://comic.naver.com/webtoon/list?titleId=${titleId}`)
                .then(r => r.text())
                .then(htmlText => {
                  const ogImgMatch = htmlText.match(/meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i) || 
                                     htmlText.match(/property=["']og:image["']\s+content=["']([^"']+)["']/i);
                  if (ogImgMatch && ogImgMatch[1]) {
                    const currentUrl = ogImgMatch[1];
                    
                    // Dynamic DB Healing
                    try {
                      const webtoons = loadWebtoons();
                      const targetItem = webtoons.find(w => w.webtoonId === titleId || w.id === `naver_${titleId}`);
                      if (targetItem && targetItem.img !== currentUrl) {
                        targetItem.img = currentUrl;
                        saveWebtoons(webtoons);
                        log(`[DB Self-Healing] '${targetItem.title}' (ID: ${titleId})의 만료된 썸네일을 새로운 경로(${currentUrl})로 DB에 완벽히 복구 및 갱신했습니다.`);
                      }
                    } catch (dbErr) {
                      // ignore
                    }
                    
                    // Re-proxy using the freshly retrieved image URL
                    return proxyImageNative(currentUrl, depth + 1);
                  } else {
                     if (!res.headersSent) res.status(404).end();
  return;
                  }
                })
                .catch(() => {
                   if (!res.headersSent) res.status(404).end();
  return;
                });
              return;
            }
          }

           if (!res.headersSent) res.status(404).end();
  return;
        }

        let contentType = remoteRes.headers["content-type"] || "";
        if (!contentType || contentType === "application/octet-stream") {
          if (targetUrl.toLowerCase().includes(".webm")) {
            contentType = "video/webm";
          } else if (targetUrl.toLowerCase().includes(".mov")) {
            contentType = "video/quicktime";
          } else if (targetUrl.toLowerCase().includes(".mp4")) {
            contentType = "video/mp4";
          } else {
            contentType = "image/jpeg";
          }
        }
        res.setHeader("Content-Type", contentType);
        res.setHeader("Cache-Control", "public, max-age=86400"); // Cache for 1 day
        remoteRes.pipe(res);
      });

      remoteReq.on("error", (err) => {
          if (res.headersSent || requestResponded) return;
          requestResponded = true;
          console.error("Native image proxy request error:", err);
          res.status(404).end();
        });

        remoteReq.on("timeout", () => {
          remoteReq.destroy();
          if (res.headersSent || requestResponded) return;
          requestResponded = true;
          res.status(404).end();
        });
      remoteReq.end();
    };

    proxyImageNative(imageUrl, 0);

} catch (err: any) {
  if (!res.headersSent) {
    res.status(404).end();
  }
}
});

// API Route: Database & crawler stats
app.get("/api/admin/stats", (req, res) => {
  const webtoons = loadWebtoons();
  const stats = loadStats();

  const total = webtoons.length;
  const enriched = webtoons.filter(w => w.genres && w.genres.length > 0).length;

  // 플랫폼별 카운트 추가
  const byPlatform = webtoons.reduce((acc, w) => {
    acc[w.platform] = (acc[w.platform] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // 카카오페이지 상태별 카운트
  const kakaoPageTotal = webtoons.filter(w => w.platform === "kakaoPage").length;
  const kakaoPageEnd = webtoons.filter(w => w.platform === "kakaoPage" && w.isEnd).length;
  const kakaoPageFree = webtoons.filter(w => w.platform === "kakaoPage" && w.isFree).length;

  res.json({
    total,
    enriched,
    byPlatform,
    kakaoPage: { total: kakaoPageTotal, finished: kakaoPageEnd, free: kakaoPageFree },
    lastCrawlRun: stats.lastCrawlRun,
    lastEnrichRun: stats.lastEnrichRun,
    logs: serverLogs
  });
});

async function triggerBackgroundCrawl() {
  try {
    log("백그라운드 초기 동기화 시작: 네이버 웹툰 공식 API 실시간 대량 연동 중...");
    const weeks = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "dailyPlus"];
    const fetchPromises: Promise<any[]>[] = [];

    for (const week of weeks) {
      const url = `https://comic.naver.com/api/webtoon/titlelist/weekday?week=${week}`;
      fetchPromises.push(
        fetch(url)
          .then(async (response) => {
            if (!response.ok) return [];
            const data = await response.json();
            const list = data && Array.isArray(data.titleList) ? data.titleList : [];
            return list.map((item: any) => ({ ...item, crawledWeek: week }));
          })
          .catch(() => [])
      );
    }
  fetchPromises.push(fetchNaverFinished());
  
    const results = await Promise.all(fetchPromises);
    const rawItems = results.flat();
    if (rawItems.length === 0) {
      log("백그라운드 초기 동기화 경고: 네이버 웹툰 API 수집 데이터가 없습니다.");
      return;
    }

    const localWebtoons = loadWebtoons();
    const localMap = new Map<string, any>();
    localWebtoons.forEach(w => localMap.set(w.id, w));

    rawItems.forEach((ext: any) => {
      if (!ext || !ext.titleId) return;

      const compositeId = `naver_${ext.titleId}`;
      const title = ext.titleName || "제목 없음";
      const authorVal = ext.author || "작가 미상";
      const thumbnailVal = ext.thumbnailUrl || "";
      const isEndVal = ext.finish || false;
      const isNewVal = ext.new || false;
      const isUpVal = ext.up || false;
      const isHiatusVal = ext.rest || false;
      const isFreeVal = true;

      const dayStr = ext.crawledWeek.toUpperCase();

      const existing = localMap.get(compositeId);
      if (existing) {
        const updatedDays = new Set(existing.updateDays || []);
        if (dayStr !== "FINISHED") {
          updatedDays.add(dayStr);
        } else {
          updatedDays.add("finished");
        }
        localMap.set(compositeId, {
          ...existing,
          title,
          author: authorVal,
          img: thumbnailVal || existing.img,
          url: `https://comic.naver.com/webtoon/list?titleId=${ext.titleId}`,
          updateDays: Array.from(updatedDays),
          isEnd: isEndVal,
          isNew: isNewVal,
          isUp: isUpVal,
          isHiatus: isHiatusVal,
          isFree: isFreeVal,
  isAdult: ext.adult || false,
          platform: "naver"
        });
      } else {
        const guessedGenres = guessGenreByTitle(title);
        localMap.set(compositeId, {
          id: compositeId,
          webtoonId: String(ext.titleId),
          title,
          author: authorVal,
          img: thumbnailVal,
          url: `https://comic.naver.com/webtoon/list?titleId=${ext.titleId}`,
          updateDays: [dayStr],
          isEnd: isEndVal,
          isNew: isNewVal,
          isUp: isUpVal,
          isHiatus: isHiatusVal,
          isFree: isFreeVal,
  isAdult: ext.adult || false,
          platform: "naver",
          genres: guessedGenres
        });
      }
    });

    const merged = Array.from(localMap.values());
    saveWebtoons(merged);
    log(`[백그라운드 동기화 완료] 실시간 데이터가 ${merged.length}개로 대량 수집 및 연동되었습니다.`);
  } catch (err: any) {
    log(`백그라운드 초기 동기화 실패: ${err.message}`);
  }
}

// Vite middleware integration
async function startServer() {
  // Pre-load webtoons database to ensure seed exists
  const webtoons = loadWebtoons();
  if (webtoons.length <= 15) {
    log("데이터베이스가 초기 상태(15개)입니다. 대용량 실시간 백그라운드 동기화를 진행합니다...");
    triggerBackgroundCrawl();
  }

  if (process.env.NODE_ENV !== "production") {
    log("개발 모드: Vite 개발 서버 미들웨어를 활성화합니다.");
 const vite = await createViteServer({
  server: {
    middlewareMode: true,
    watch: {
      ignored: ["**/data/**"]
    }
  },
  appType: "spa",
});
    app.use(vite.middlewares);
  } else {
    log("프로덕션 모드: 정적 애셋 빌드 파일 및 인덱스를 서빙합니다.");
    const distPath = path.join(process.cwd(), "dist/client");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    log(`웹툰 취향 필터링 서버가 http://localhost:${PORT} 에서 활성화되었습니다.`);
  });
}

app.post("/api/admin/clean-kakao", (req, res) => {
  try {
    const webtoons = loadWebtoons();
    const before = webtoons.length;

    const cleaned = webtoons.filter(w => w.platform === "naver");

    saveWebtoons(cleaned);
    log(`[정리 완료] ${before}건 → ${cleaned.length}건 (${before - cleaned.length}건 제거)`);
    res.json({ success: true, before, after: cleaned.length, removed: before - cleaned.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── 장르 일괄 정규화 (영어코드 → 한국어, 드라마 단일 → guessGenreByTitle 재추론) ──
app.post("/api/admin/fix-genres", (req, res) => {
  try {
    const webtoons = loadWebtoons();

    const ENG_TO_KO: Record<string, string[]> = {
      ROMANCE:               ["로맨스/순정"],
      ROMANCE_FANTASY:       ["로맨스/순정", "판타지"],
      FANTASY:               ["판타지"],
      ACTION:                ["액션"],
      DRAMA:                 ["드라마"],
      THRILLER:              ["스릴러"],
      COMEDY:                ["개그"],
      MARTIAL_ARTS:          ["무협"],
      SPORTS:                ["스포츠"],
      SLICE_OF_LIFE:         ["일상"],
      SCHOOL:                ["학원"],
      FANTASY_DRAMA:         ["판타지", "드라마"],
      ACTION_WUXIA:          ["액션", "무협"],
      SCHOOL_ACTION_FANTASY: ["학원", "액션", "판타지"],
      HORROR_THRILLER:       ["공포", "스릴러"],
      COMIC_EVERYDAY_LIFE:   ["개그", "일상"],
      BL:                    ["BL"],
    };

    let fixedEngCount    = 0; // 영어코드 → 한국어
    let fixedDramaCount  = 0; // 드라마 단일 → 재추론
    let dedupCount       = 0; // 카카오 중복 제거

    // 1. 카카오웹툰 중복 제거 (같은 title, 낮은 webtoonId 제거)
    const nonKakao  = webtoons.filter(w => w.platform !== "kakao");
    const kakaoOnly = webtoons.filter(w => w.platform === "kakao");
    const kakaoMap  = new Map<string, any>();
    for (const w of kakaoOnly) {
      const key = w.title.trim();
      const existing = kakaoMap.get(key);
      if (!existing) {
        kakaoMap.set(key, w);
      } else {
        const existId = parseInt(existing.webtoonId) || 0;
        const newId   = parseInt(w.webtoonId) || 0;
        if (newId > existId) kakaoMap.set(key, w);
        dedupCount++;
      }
    }
    const deduped = [...nonKakao, ...Array.from(kakaoMap.values())];

    // 2. 영어코드 → 한국어 변환 + 드라마 단일 → 재추론
    const fixed = deduped.map(w => {
      const rawGenres: string[] = w.genres || [];

      // 영어코드 포함 여부 확인
      const hasEngCode = rawGenres.some(g => ENG_TO_KO[g]);

      if (hasEngCode) {
        // 영어코드 → 복합 배열로 펼치기 후 중복 제거
        const normalized = [...new Set(
          rawGenres.flatMap(g => ENG_TO_KO[g] || [g])
        )].filter(Boolean);
        fixedEngCount++;
        return { ...w, genres: normalized };
      }

      // 드라마 단일 폴백 → 타이틀 기반 재추론
      if (rawGenres.length === 1 && rawGenres[0] === "드라마") {
        const guessed = guessGenreByTitle(w.title || "");
        if (guessed.length > 0 && !(guessed.length === 1 && guessed[0] === "드라마")) {
          fixedDramaCount++;
          return { ...w, genres: guessed };
        }
      }

      return w;
    });

    saveWebtoons(fixed);

    const summary = {
      success: true,
      총작품수: fixed.length,
      영어코드정규화: fixedEngCount,
      드라마재추론: fixedDramaCount,
      카카오중복제거: dedupCount,
    };
    log(`[fix-genres] ${JSON.stringify(summary)}`);
    res.json(summary);

  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 매일 새벽 3시 자동 크롤
const scheduleDaily = () => {
  const now = new Date();
  const next3am = new Date();
  next3am.setHours(3, 0, 0, 0);
  if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
  
  const msUntil3am = next3am.getTime() - now.getTime();
  
  setTimeout(() => {
    log("[스케줄러] 자동 크롤 시작");
    triggerBackgroundCrawl(); // 네이버
    scheduleDaily(); // 다음날 예약
  }, msUntil3am);
  
  log(`[스케줄러] 다음 자동 크롤: ${next3am.toLocaleString("ko-KR")}`);
};

scheduleDaily();

startServer();