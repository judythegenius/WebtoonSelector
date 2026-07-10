import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

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
const SEED_WEBTOONS = [
  {
    id: "naver_769209",
    webtoonId: "769209",
    title: "화산귀환",
    author: "비가 / LICO",
    img: "https://image-comic.pstatic.net/webtoon/769209/thumbnail/thumbnail_IMAG21_3510521481134543456.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=769209",
    updateDays: ["WED"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "naver",
    genres: ["판타지", "액션", "무협"],
    isFree: true
  },
  {
    id: "naver_183559",
    webtoonId: "183559",
    title: "신의 탑",
    author: "SIU",
    img: "https://image-comic.pstatic.net/webtoon/183559/thumbnail/thumbnail_IMAG21_5872421216315302903.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=183559",
    updateDays: ["MON"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["판타지", "액션"],
    isFree: true
  },
  {
    id: "naver_570503",
    webtoonId: "570503",
    title: "연애혁명",
    author: "232",
    img: "https://image-comic.pstatic.net/webtoon/570503/thumbnail/thumbnail_IMAG21_3914445831525042609.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=570503",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["로맨스/순정", "일상", "드라마"],
    totalEpisodes: 442,
    isDailyPass: true,
    dailyPassDuration: 24,
    paidEpisodes: 20,
    freeEpisodes: 422,
    isFree: false
  },
  {
    id: "naver_641253",
    webtoonId: "641253",
    title: "외모지상주의",
    author: "박태준",
    img: "https://image-comic.pstatic.net/webtoon/641253/thumbnail/thumbnail_IMAG21_3841920935541604902.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=641253",
    updateDays: ["FRI"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "naver",
    genres: ["액션", "드라마", "학원"],
    isFree: true
  },
  {
    id: "naver_735661",
    webtoonId: "735661",
    title: "재혼 황후",
    author: "알파타르트 / 숨풀 / sanyo",
    img: "https://image-comic.pstatic.net/webtoon/735661/thumbnail/thumbnail_IMAG21_7074212959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=735661",
    updateDays: ["FRI", "SUN"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["로맨스/순정", "드라마", "판타지"],
    isFree: true
  },
  {
    id: "kakaoPage_51854447",
    webtoonId: "51854447",
    title: "나 혼자만 레벨업",
    author: "추공 / 장성락 / 현군",
    img: "https://dn-img-page.kakao.com/webtoon/51854447/thumbnail.jpg",
    url: "https://page.kakao.com/content/51854447",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 201,
    freeEpisodes: 15,
    paidEpisodes: 186
  },
  {
    id: "kakaoPage_60037130",
    webtoonId: "60037130",
    title: "데뷔 못 하면 죽는 병 걸림",
    author: "백덕수 / 소흔",
    img: "https://dn-img-page.kakao.com/webtoon/60037130/thumbnail.jpg",
    url: "https://page.kakao.com/content/60037130",
    updateDays: ["THU"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "드라마", "아이돌"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 110,
    freeEpisodes: 10,
    paidEpisodes: 100
  },
  {
    id: "kakaoPage_54724810",
    webtoonId: "54724810",
    title: "템빨",
    author: "이동현 / 신노아",
    img: "https://dn-img-page.kakao.com/webtoon/54724810/thumbnail.jpg",
    url: "https://page.kakao.com/content/54724810",
    updateDays: ["SAT"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "kakaoPage",
    genres: ["판타지", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 180,
    freeEpisodes: 20,
    paidEpisodes: 160
  },
  {
    id: "kakaoPage_52971234",
    webtoonId: "52971234",
    title: "도굴왕",
    author: "윤지선 / 산지직송",
    img: "https://dn-img-page.kakao.com/webtoon/52971234/thumbnail.jpg",
    url: "https://page.kakao.com/content/52971234",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 410,
    freeEpisodes: 40,
    paidEpisodes: 370
  },
  {
    id: "kakaoPage_53123456",
    webtoonId: "53123456",
    title: "학사신공",
    author: "왕위 / 파란선",
    img: "https://dn-img-page.kakao.com/webtoon/53123456/thumbnail.jpg",
    url: "https://page.kakao.com/content/53123456",
    updateDays: ["MON"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "무협"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 12,
    totalEpisodes: 300,
    freeEpisodes: 30,
    paidEpisodes: 270
  },
  {
    id: "kakao_1885",
    webtoonId: "1885",
    title: "사내맞선",
    author: "해화 / 들깨 / NARAL",
    img: "https://dn-img-page.kakao.com/webtoon/1885/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EC%82%AC%EB%82%B4%EB%A7%9E%EC%84%A0/1885",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["로맨스/순정", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 102,
    freeEpisodes: 6,
    paidEpisodes: 96
  },
  {
    id: "kakao_1357",
    webtoonId: "1357",
    title: "이태원 클라쓰",
    author: "광진",
    img: "https://dn-img-page.kakao.com/webtoon/1357/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EC%9D%B4%ED%83%9C%EC%9B%90-%ED%81%B4%EB%9D%BC%EC%93%B0/1357",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 78,
    freeEpisodes: 5,
    paidEpisodes: 73
  },
  {
    id: "kakao_818",
    webtoonId: "818",
    title: "미생",
    author: "윤태호",
    img: "https://kr-a.kakaopagecdn.com/P/C/818/c1a/c0c31425-f0db-474f-accc-4312abb3c95e.webm",
    url: "https://webtoon.kakao.com/content/%EB%AF%B8%EC%83%9D/818",
    updateDays: ["TUE"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "kakao",
    genres: ["드라마", "일상"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 150,
    freeEpisodes: 15,
    paidEpisodes: 135
  },
  {
    id: "kakao_559",
    webtoonId: "559",
    title: "무빙",
    author: "강풀",
    img: "https://dn-img-page.kakao.com/webtoon/559/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EB%AC%B4%EB%B9%99/559",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["액션", "판타지", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 45,
    freeEpisodes: 5,
    paidEpisodes: 40
  },
  {
    id: "kakao_4385",
    webtoonId: "4385",
    title: "블랙-헤이즈",
    author: "용용",
    img: "https://webtoon.kakao.com/content/%EB%B8%94%EB%9E%99-%ED%97%A4%EC%9D%B4%EC%A6%88/4385",
    url: "https://webtoon.kakao.com/content/%EB%B8%94%EB%9E%99-%ED%97%A4%EC%9D%B4%EC%A6%88/4385",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["판타지", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 228,
    freeEpisodes: 10,
    paidEpisodes: 218
  },
  {
    id: "kakao_1435",
    webtoonId: "1435",
    title: "경이로운 소문",
    author: "장이",
    img: "https://dn-img-page.kakao.com/webtoon/1435/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EA%B2%BD%EC%9D%B4%EB%A1%9C%EC%9A%B4-%EC%86%8C%EB%AC%B8/1435",
    updateDays: ["THU"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["판타지", "액션", "스릴러"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 160,
    freeEpisodes: 16,
    paidEpisodes: 144
  },
  {
    id: "kakao_1211",
    webtoonId: "1211",
    title: "나빌레라",
    author: "Hun / 지민",
    img: "https://dn-img-page.kakao.com/webtoon/1211/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EB%82%98%EB%B9%8C%EB%A0%88%EB%9D%BC/1211",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["드라마", "일상"],
    isFree: true,
    isDailyPass: false,
    totalEpisodes: 56,
    freeEpisodes: 56,
    paidEpisodes: 0
  },
  {
    id: "kakao_1125",
    webtoonId: "1125",
    title: "조명가게",
    author: "강풀",
    img: "https://dn-img-page.kakao.com/webtoon/1125/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EC%A1%B0%EB%AA%85%EA%B0%80%EA%B2%8C/1125",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["스릴러", "미스터리"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 30,
    freeEpisodes: 3,
    paidEpisodes: 27
  },
  {
    id: "kakaoPage_49123456",
    webtoonId: "49123456",
    title: "닥터 최태수",
    author: "조석호 / 스튜디오인투",
    img: "https://dn-img-page.kakao.com/webtoon/49123456/thumbnail.jpg",
    url: "https://page.kakao.com/content/49123456",
    updateDays: ["MON"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["드라마", "메디컬"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 12,
    totalEpisodes: 420,
    freeEpisodes: 40,
    paidEpisodes: 380
  },
  {
    id: "kakaoPage_53982345",
    webtoonId: "53982345",
    title: "비뢰도",
    author: "검류혼 / 홍반장",
    img: "https://dn-img-page.kakao.com/webtoon/53982345/thumbnail.jpg",
    url: "https://page.kakao.com/content/53982345",
    updateDays: ["WED"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "액션", "무협"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 140,
    freeEpisodes: 15,
    paidEpisodes: 125
  },
  {
    id: "kakaoPage_51928345",
    webtoonId: "51928345",
    title: "어느 날 공주가 되어버렸다",
    author: "플루토스 / 스푼",
    img: "https://dn-img-page.kakao.com/webtoon/51928345/thumbnail.jpg",
    url: "https://page.kakao.com/content/51928345",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["로맨스/순정", "판타지"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 125,
    freeEpisodes: 12,
    paidEpisodes: 113
  },
  {
    id: "kakaoPage_52112345",
    webtoonId: "52112345",
    title: "인소의 법칙",
    author: "유한려 / 아현",
    img: "https://dn-img-page.kakao.com/webtoon/52112345/thumbnail.jpg",
    url: "https://page.kakao.com/content/52112345",
    updateDays: ["FRI"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["로맨스/순정", "학원", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 190,
    freeEpisodes: 19,
    paidEpisodes: 171
  },
  {
    id: "kakao_1188",
    webtoonId: "1188",
    title: "가랑가랑",
    author: "이아루",
    img: "https://dn-img-page.kakao.com/webtoon/1188/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EA%B0%80%EB%9E%91%EA%B0%80%EB%9E%91/1188",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["로맨스/순정"],
    isFree: true,
    isDailyPass: false,
    totalEpisodes: 40,
    freeEpisodes: 40,
    paidEpisodes: 0
  },
  {
    id: "kakao_1399",
    webtoonId: "1399",
    title: "바니와 오빠들",
    author: "니은",
    img: "https://dn-img-page.kakao.com/webtoon/1399/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/%EB%B0%94%EB%8B%88%EC%99%80-%EC%98%A4%EB%B9%A5%EB%93%A4/1399",
    updateDays: ["SUN"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["로맨스/순정", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 120,
    freeEpisodes: 12,
    paidEpisodes: 108
  },
  {
    id: "kakaoPage_55987654",
    webtoonId: "55987654",
    title: "악녀는 마리오네트",
    author: "한이림 / 망글이",
    img: "https://dn-img-page.kakao.com/webtoon/55987654/thumbnail.jpg",
    url: "https://page.kakao.com/content/55987654",
    updateDays: ["WED"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["로맨스/순정", "판타지"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 85,
    freeEpisodes: 8,
    paidEpisodes: 77
  },
  {
    id: "naver_796123",
    webtoonId: "796123",
    title: "남편을 죽여줘요",
    author: "명랑 / LeeYone",
    img: "https://image-comic.pstatic.net/webtoon/797410/thumbnail/thumbnail_IMAG21_9852442e-217e-4ec7-92a7-21c0ada85dc7.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=797410",
    updateDays: ["SUN"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["드라마", "스릴러"],
    isFree: true
  },
  {
    id: "naver_741891",
    webtoonId: "741891",
    title: "가비지타임",
    author: "2사장",
    img: "https://image-comic.pstatic.net/webtoon/741891/thumbnail/thumbnail_IMAG21_930412959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=741891",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["드라마", "스포츠", "학원"],
    totalEpisodes: 226,
    isDailyPass: true,
    dailyPassDuration: 24,
    paidEpisodes: 20,
    freeEpisodes: 206,
    isFree: false
  },
  {
    id: "naver_703843",
    webtoonId: "703843",
    title: "세기말 풋사과 보습학원",
    author: "순끼",
    img: "https://image-comic.pstatic.net/webtoon/703843/thumbnail/thumbnail_IMAG21_391012959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=703843",
    updateDays: ["FRI"],
    isEnd: false,
    isNew: true,
    isUp: true,
    platform: "naver",
    genres: ["로맨스/순정", "일상", "드라마"],
    isFree: true
  },
  {
    id: "naver_758150",
    webtoonId: "758150",
    title: "입학용병",
    author: "YC / 락현",
    img: "https://image-comic.pstatic.net/webtoon/758150/thumbnail/thumbnail_IMAG21_9301212959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=758150",
    updateDays: ["SUN"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "naver",
    genres: ["액션", "학원"],
    isFree: true
  },
  {
    id: "naver_783054",
    webtoonId: "783054",
    title: "김부장",
    author: "박태준 만화회사 / 정종택",
    img: "https://image-comic.pstatic.net/webtoon/783054/thumbnail/thumbnail_IMAG21_931212959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=783054",
    updateDays: ["TUE"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["액션", "느와르"],
    isFree: true
  },
  {
    id: "naver_811721",
    webtoonId: "811721",
    title: "작전명 순정",
    author: "꼬냑 / 애사",
    img: "https://image-comic.pstatic.net/webtoon/811721/thumbnail/thumbnail_IMAG21_70712959082987113.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=811721",
    updateDays: ["SAT"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["로맨스/순정", "학원"],
    isFree: true
  },
  {
    id: "naver_774863",
    webtoonId: "774863",
    title: "팔이피플",
    author: "매미 / 희세",
    img: "https://image-comic.pstatic.net/webtoon/774863/thumbnail/thumbnail_IMAG21_3914445831525042609.jpg",
    url: "https://comic.naver.com/webtoon/list?titleId=774863",
    updateDays: ["THU"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "naver",
    genres: ["드라마", "스릴러", "개그"],
    isFree: true
  },
  {
    id: "kakao_1393",
    webtoonId: "1393",
    title: "아비무쌍",
    author: "노경찬 / 이현민",
    img: "https://dn-img-page.kakao.com/webtoon/1393/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/아비무쌍/1393",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["무협", "액션", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 258,
    freeEpisodes: 10,
    paidEpisodes: 248
  },
  {
    id: "kakao_1881",
    webtoonId: "1881",
    title: "지옥사원",
    author: "네온비 / 캐러멜",
    img: "https://dn-img-page.kakao.com/webtoon/1881/thumbnail.jpg",
    url: "https://webtoon.kakao.com/content/지옥사원/1881",
    updateDays: ["finished"],
    isEnd: true,
    isNew: false,
    isUp: false,
    platform: "kakao",
    genres: ["판타지", "드라마"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 236,
    freeEpisodes: 12,
    paidEpisodes: 224
  },
  {
    id: "kakaoPage_55637210",
    webtoonId: "55637210",
    title: "의원, 다시 살다",
    author: "태선 / 박지은",
    img: "https://dn-img-page.kakao.com/webtoon/55637210/thumbnail.jpg",
    url: "https://page.kakao.com/content/55637210",
    updateDays: ["MON"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "kakaoPage",
    genres: ["판타지", "무협", "의학"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 180,
    freeEpisodes: 15,
    paidEpisodes: 165
  },
  {
    id: "kakaoPage_53874744",
    webtoonId: "53874744",
    title: "로그인 무림",
    author: "장철벽 / 제로빅",
    img: "https://dn-img-page.kakao.com/webtoon/53874744/thumbnail.jpg",
    url: "https://page.kakao.com/content/53874744",
    updateDays: ["WED"],
    isEnd: false,
    isNew: false,
    isUp: true,
    platform: "kakaoPage",
    genres: ["판타지", "무협", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 238,
    freeEpisodes: 20,
    paidEpisodes: 218
  },
  {
    id: "kakaoPage_54067345",
    webtoonId: "54067345",
    title: "북검전기",
    author: "우각 / 해민",
    img: "https://dn-img-page.kakao.com/webtoon/54067345/thumbnail.jpg",
    url: "https://page.kakao.com/content/54067345",
    updateDays: ["WED"],
    isEnd: false,
    isNew: false,
    isUp: false,
    platform: "kakaoPage",
    genres: ["판타지", "무협", "액션"],
    isFree: false,
    isDailyPass: true,
    dailyPassDuration: 24,
    totalEpisodes: 190,
    freeEpisodes: 15,
    paidEpisodes: 175
  }
];

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

    // Smart merge: Ensure all crucial SEED_WEBTOONS (especially Kakao/KakaoPage and their updated billing info) are merged/upserted
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
  "유미의 세포들": ["로맨스/순정", "일상", "개그"]
};

// Auto guess genre based on words in title
function guessGenreByTitle(title: string): string[] {
  // Check exact/partial local map
  for (const key of Object.keys(LOCAL_GENRE_MAP)) {
    if (title.includes(key) || key.includes(title)) {
      return LOCAL_GENRE_MAP[key];
    }
  }

  // Text hints
  if (title.match(/레벨업|귀환|빙의|헌터|용사|마왕|판타지|아카데미|소환사|스킬|SSS|탑|탑|던전|영주|드래곤|검사/)) {
    return ["판타지", "액션"];
  }
  if (title.match(/연애|사랑|너와|그녀|로맨스/)) {
    return ["로맨스/순정"];
  }
  if (title.match(/살인|죽여|죽는|피|복수|감옥|범죄|스릴러|귀신|지옥|악마/)) {
    return ["스릴러", "드라마"];
  }
  if (title.match(/일기|생활|학교|학생|학원|일상/)) {
    return ["일상", "학원"];
  }
  if (title.match(/야구|축구|농구|달리기|복싱|격투|스포츠/)) {
    return ["스포츠", "드라마"];
  }
  
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
    webtoon.isFree = !isDailyPass && paidEpisodes === 0;
    
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
      webtoons = webtoons.filter(w => w.isFree !== false); // default to free if undefined
    } else if (price === "paid") {
      webtoons = webtoons.filter(w => w.isFree === false);
    }
  }

// Filter: genre
if (genre && genre !== "all") {
  const genreStr = String(genre);
  if (genreStr === "18+") {
    webtoons = webtoons.filter(w => w.isAdult === true);
  } else {
    webtoons = webtoons.filter(w => w.genres && w.genres.some((g: string) => g.includes(genreStr) || genreStr.includes(g)));
  }
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
        webtoon.isFree = !isDailyPass && paidEpisodes === 0;

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
    const finishedUrl = "https://comic.naver.com/api/webtoon/titlelist/finished";
    fetchPromises.push(
      fetch(finishedUrl)
        .then(async (response) => {
          if (!response.ok) return [];
          const data = await response.json();
          const list = data && Array.isArray(data.titleList) ? data.titleList : [];
          return list.map((item: any) => ({ ...item, crawledWeek: "finished" }));
        })
        .catch((e) => {
          log(`네이버웹툰 완결 목록 가져오기 실패: ${e.message}`);
          return [];
        })
    );

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
    // Filter webtoons that have empty or unset genres
    const targets = webtoons.filter(w => !w.genres || w.genres.length === 0);
    
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

    const DAY_MAP: Record<string, string> = {
      "월": "MON", "화": "TUE", "수": "WED", "목": "THU",
      "금": "FRI", "토": "SAT", "일": "SUN"
    };

    const GENRE_MAP: Record<string, string> = {
      "로판": "로맨스/순정", "로맨스": "로맨스/순정", "판타지": "판타지",
      "액션": "액션", "드라마": "드라마", "무협": "무협",
      "스릴러": "스릴러", "개그": "개그", "일상": "일상", "학원": "학원"
    };

    // 요일별 page=0~9 까지 수집
    for (let page = 0; page <= 9; page++) {
      try {
        const url = `https://bff-page.kakao.com/api/gateway/view/v2/landing/dayofweek?category_uid=10&page=${page}&screen_uid=52`;

        const apiRes = await fetch(url, {
          headers: {
            "accept": "application/json, text/plain, */*",
            "accept-language": "ko",
            "origin": "https://page.kakao.com",
            "referer": "https://page.kakao.com/",
            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (!apiRes.ok) {
          log(`[카카오페이지] page=${page} 실패: ${apiRes.status}`);
          break;
        }

        const data = await apiRes.json();
        const list = data?.result?.list || [];

        if (list.length === 0) {
          log(`[카카오페이지] page=${page} 데이터 없음 - 종료`);
          break;
        }

        for (const item of list) {
          const rawId = String(item.series_id);
          const compositeId = `kakaoPage_${rawId}`;
          if (existingIds.has(compositeId)) continue;
          existingIds.add(compositeId);

          // 이미지 URL 조합
          const cardImg = item.asset_property?.card_img || "";
          const thumbnail = cardImg
            ? `https://dn-img-page.kakao.com/download/resource?kid=${cardImg}&filename=th3`
            : "";

          // 요일 매핑
          const pubPeriod = item.pub_period || "";
          const isEnd = item.state === "ST60" || pubPeriod === "완결";
          const updateDays = isEnd
            ? ["finished"]
            : pubPeriod.split(",").map((d: string) => DAY_MAP[d.trim()] || d.trim()).filter(Boolean);

          // 장르
          const subCategory = item.sub_category || "";
          const genre = GENRE_MAP[subCategory] || subCategory || "드라마";

          // 작가
          const author = item.authors || "작가 미상";

          const isDailyPass = !!item.is_waitfree;
          const dailyPassDuration = item.waitfree_period_by_minute
            ? Math.round(item.waitfree_period_by_minute / 60)
            : 24;

          webtoons.push({
            id: compositeId,
            webtoonId: rawId,
            title: item.title || "제목 없음",
            author,
            img: thumbnail,
            url: `https://page.kakao.com/content/${rawId}`,
            updateDays: updateDays.length > 0 ? updateDays : ["unknown"],
            isEnd,
            isNew: false,
            isUp: false,
            platform: "kakaoPage",
            genres: [genre],
            isFree: !!item.is_all_free,
            isDailyPass,
            dailyPassDuration,
            freeEpisodes: item.free_slide_count || 0,
            isAdult: item.age_grade >= 18,  // ← 추가
          });
          addedCount++;
          log(`[카카오페이지] 추가: ${item.title} (${rawId})`);
        }

        await new Promise(r => setTimeout(r, 300));
      } catch (e: any) {
        log(`[카카오페이지 에러] page=${page}: ${e.message}`);
      }
    }

    saveWebtoons(webtoons);
    log(`[카카오페이지 완료] 신규 ${addedCount}건. 총 ${webtoons.length}건`);
    res.json({ success: true, added: addedCount, total: webtoons.length });

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
      { key: "timetable_completed", day: "finished", isEnd: true  },
    ];

    const GENRE_MAP: Record<string, string> = {
      ROMANCE:          "로맨스/순정",
      ROMANCE_FANTASY:  "로맨스/순정",
      FANTASY:          "판타지",
      ACTION:           "액션",
      DRAMA:            "드라마",
      THRILLER:         "스릴러",
      COMEDY:           "개그",
      MARTIAL_ARTS:     "무협",
      SPORTS:           "스포츠",
      SLICE_OF_LIFE:    "일상",
      SCHOOL:           "학원",
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

              const rawId    = String(content.id);
              const compositeId = `kakao_${rawId}`;
              if (existingIds.has(compositeId)) continue;
              existingIds.add(compositeId);

              // 작가: AUTHOR 타입 우선, 없으면 첫번째
              const authorObj = content.authors?.find((a: any) => a.type === "AUTHOR") || content.authors?.[0];
              const author    = authorObj?.name || "작가 미상";

              // 썸네일: c1/2x 이미지 우선, 애니메이션 fallback
              const thumbnail =
                content.titleImageA ||
                content.featuredCharacterImageA ||
                content.featuredCharacterAnimationFirstFrame ||
                content.titleImageB || "";

              // URL: seoId 있으면 사용
              const seoId = content.seoId || encodeURIComponent(content.title || rawId);
              const webtoonUrl = `https://webtoon.kakao.com/content/${seoId}/${rawId}`;

              // 장르: genreFilters에서 "all" 제외하고 매핑
              const genreKeys = (card.genreFilters || []).filter((g: string) => g !== "all");
              const genres    = genreKeys.map((g: string) => GENRE_MAP[g] || g).filter(Boolean);

              // 기다무 여부
              const isDailyPass = content.badges?.some((b: any) => b.title === "WAIT_FOR_FREE") || false;
              const isFree      = content.badges?.some((b: any) => b.title === "FREE_PUBLISHING") || false;

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
    const isKakao = imageUrl.includes("kakao.com") || imageUrl.includes("daumcdn.net") || imageUrl.includes("kakaocdn.net") || imageUrl.includes("kakaopagecdn.com");

    const allowed = isNaver || isKakao || imageUrl.startsWith("https://") || imageUrl.startsWith("http://");
    if (!allowed) {
      return res.status(403).send("Domain not allowed");
    }

    let referer = "";
    if (isNaver) {
      referer = "https://comic.naver.com";
    } else if (isKakao) {
      if (imageUrl.includes("page.kakao.com") || imageUrl.includes("kakaopagecdn.com") || imageUrl.includes("dn-img-page")) {
        referer = "https://page.kakao.com";
      } else {
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

  res.json({
    total,
    enriched,
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
    const distPath = path.join(process.cwd(), "dist");
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
