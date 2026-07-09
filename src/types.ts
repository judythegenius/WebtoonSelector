export interface Webtoon {
  id: string; // Unique combined ID: e.g. platform_webtoonId
  webtoonId: string;
  title: string;
  author: string;
  img: string; // Original image URL from CDN
  url: string; // Link to the webtoon platform
  updateDays: string[]; // e.g., ["MON", "WED"]
  isEnd: boolean;
  isNew: boolean;
  isUp: boolean;
  isHiatus?: boolean;
  isFree?: boolean;
  platform: string; // "naver" | "kakao" | "kakaoPage"
  genres: string[]; // Filled via Manhwa Gyujanggak API or fallback
  
  // Billing and Episode Details (Self-healing on demand / background crawler)
  isDailyPass?: boolean;
  dailyPassDuration?: number;
  totalEpisodes?: number;
  freeEpisodes?: number;
  paidEpisodes?: number;

  // Platform billing update extensions (Naver/Kakao policy features)
  isPayNotice?: boolean;       // Whether there is a scheduled conversion to paid status
  payNoticeDate?: string;      // The target date for the paid conversion (e.g. "7월 14일")
  previewCount?: number;       // Number of preview episodes (e.g. 3)
}

export type PlatformFilter = 'all' | 'naver' | 'kakao' | 'kakaoPage';
export type DayFilter = 'all' | 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';
export type StatusFilter = 'all' | 'ongoing' | 'finished' | 'hiatus';
export type PriceFilter = 'all' | 'free' | 'paid';
export type SortOption = 'default' | 'totalEpisodes' | 'freeEpisodes' | 'paidEpisodesAsc' | 'newest';

export interface FilterSettings {
  platform: PlatformFilter;
  day: DayFilter;
  status: StatusFilter;
  genre: string; // 'all' or specific genre
  searchQuery: string;
  price: PriceFilter;
  sort: SortOption;
}

export interface CrawlStats {
  total: number;
  enriched: number;
  lastRun: string | null;
  logs: string[];
}
