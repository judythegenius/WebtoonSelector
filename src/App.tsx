import { useState, useEffect, useCallback, useRef } from "react";
import { FilterSettings, Webtoon } from "./types";
import FilterPanel from "./components/FilterPanel";
import WebtoonGrid from "./components/WebtoonGrid";
import AdSimulator from "./components/AdSimulator";
import { useInterstitialAd } from "./hooks/useInterstitialAd";
import { Sparkles, RefreshCw, AlertCircle, TrendingUp, Compass, Flame, Info, Sliders } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const INITIAL_FILTERS: FilterSettings = {
  platform: "all",
  day: "all",
  status: "all",
  genres: [],
  searchQuery: "",
  price: "all",
  sort: "default"
};

export default function App() {
  const [webtoons, setWebtoons] = useState<Webtoon[]>([]);
  const [filteredWebtoons, setFilteredWebtoons] = useState<Webtoon[]>([]);
  const [filters, setFilters] = useState<FilterSettings>(INITIAL_FILTERS);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [curatedIds, setCuratedIds] = useState<string[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0); // ← 이거 추가
  const [currentPage, setCurrentPage] = useState(1);

  // Real system time simulation for native mobile feel
  const [time, setTime] = useState("12:00");
  const [showAdmin, setShowAdmin] = useState(false);

  // Tracks WHY an ad was triggered ('tour' = curation tour button, 'loadMore' = pagination button)
  // so dismissing the ad only re-curates when it makes sense.
  const adPurposeRef = useRef<'tour' | 'loadMore' | null>(null);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hrs = String(now.getHours()).padStart(2, "0");
      const mins = String(now.getMinutes()).padStart(2, "0");
      setTime(`${hrs}:${mins}`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load Toss Interstitial Ad Hook
  const {
    adState,
    attConsent,
    setAttConsent,
    loadAd,
    showAd,
    dismissAd,
    resetAd
  } = useInterstitialAd({
    adGroupId: "ait-ad-test-interstitial-id",
    onAdLoaded: () => {
      showAd();
    },
    onAdDismissed: () => {
      if (adPurposeRef.current === 'tour') {
        triggerAISurpriseMatch();
      }
      adPurposeRef.current = null;
    },
    onAdError: () => {
      if (adPurposeRef.current === 'tour') {
        triggerAISurpriseMatch();
      }
      adPurposeRef.current = null;
    }
  });

  // Fetch all webtoons for context
  const fetchAllWebtoons = useCallback(async () => {
    try {
      const res = await fetch("/api/webtoons?platform=all&day=all&status=all&limit=9999");
      if (res.ok) {
        const data = await res.json();
        setWebtoons(data.webtoons || []);
      }
    } catch (e) {
      console.error("Failed to load global webtoons context", e);
    }
  }, []);

  // Live update and self-heal information for a specific webtoon
  const handleUpdateWebtoon = useCallback(async (id: string): Promise<Webtoon | null> => {
    try {
      const res = await fetch(`/api/webtoons/${id}/update-info`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.webtoon) {
          setWebtoons(prev => prev.map(w => w.id === id ? data.webtoon : w));
          setFilteredWebtoons(prev => prev.map(w => w.id === id ? data.webtoon : w));
          return data.webtoon;
        }
      }
    } catch (e) {
      console.error("Failed to live update webtoon", e);
    }
    return null;
  }, []);

  // Fetch filtered webtoons to render in grid
  const fetchFilteredWebtoons = useCallback(async (page = 1, append = false) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (filters.platform !== "all") params.append("platform", filters.platform);
      if (filters.day !== "all") params.append("day", filters.day);
      if (filters.status !== "all") params.append("status", filters.status);
      if (filters.genres && filters.genres.length > 0) params.append("genres", filters.genres.join(","));
      if (filters.price !== "all") params.append("price", filters.price);
      if (filters.searchQuery.trim()) params.append("q", filters.searchQuery);
      params.append("page", String(page));
      params.append("limit", "6");
      if (curatedIds && curatedIds.length > 0) params.append("ids", curatedIds.join(","));
      if (filters.sort !== "default") params.append("sort", filters.sort);

      const res = await fetch(`/api/webtoons?${params.toString()}`);
      if (!res.ok) throw new Error("서버로부터 웹툰 목록을 가져오지 못했습니다.");

      const data = await res.json();
      let list = data.webtoons || [];

      setFilteredWebtoons(prev => append ? [...prev, ...list] : list);
      setHasMore(data.hasMore || false);
      setTotalCount(data.total ?? 0);
      setCurrentPage(page);
    } catch (err: any) {
      setError(err.message || "데이터 로딩 중 에러가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  }, [filters, curatedIds]);

  // Initial load
  useEffect(() => {
    fetchAllWebtoons();
  }, [fetchAllWebtoons]);

  // Update grid on filters or curation change
  useEffect(() => {
    fetchFilteredWebtoons();
  }, [fetchFilteredWebtoons]);

  // Triggered when manual actions complete inside AdminPanel
  const handleDataRefreshed = () => {
    fetchAllWebtoons();
    fetchFilteredWebtoons();
  };

  // Curation match applying
  const handleApplyCuration = (ids: string[]) => {
    setCuratedIds(ids);
    // Smooth scroll down to grid layout
    const gridEl = document.getElementById("webtoon-grid-layout");
    if (gridEl) {
      gridEl.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleClearCuration = () => {
    setCuratedIds(null);
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
    setCuratedIds(null);
  };

  // Surprise match for Ad Curation Tour (pure local random shuffle, no AI)
  const triggerAISurpriseMatch = async () => {
    try {
      const response = await fetch("/api/webtoons?platform=all&day=all&status=all&limit=9999");
      const data = await response.json();
      const allList: Webtoon[] = data.webtoons || [];
      if (allList.length > 0) {
        const shuffled = [...allList].sort(() => 0.5 - Math.random());
        const selectedIds = shuffled.slice(0, 3).map(w => w.id);
        handleApplyCuration(selectedIds);
      }
    } catch (e) {}
  };

  const handleCurationTour = () => {
    adPurposeRef.current = 'tour';
    loadAd();
  };

  return (
    <div className="min-h-screen bg-[#0d111a] md:py-8 flex flex-col justify-center items-center font-sans antialiased text-gray-900">

      {/* Background abstract decoration behind the phone on desktop */}
      <div className="absolute top-10 left-10 w-96 h-96 bg-toss-blue/10 rounded-full filter blur-[120px] pointer-events-none hidden md:block" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500/15 rounded-full filter blur-[120px] pointer-events-none hidden md:block" />

      {/* Main Smartphone Mockup Frame */}
      <div className="w-full md:max-w-[420px] md:h-[860px] md:rounded-[44px] md:border-[10px] md:border-slate-900 md:shadow-[0_25px_60px_-15px_rgba(0,0,0,0.6)] md:overflow-hidden bg-white flex flex-col relative transition-all duration-500">

        {/* Device camera notch mockup on desktop */}
        <div className="hidden md:block absolute left-1/2 -translate-x-1/2 top-1.5 w-28 h-6 bg-slate-950 rounded-full z-50 pointer-events-none flex items-center justify-end px-3">
          <div className="w-2.5 h-2.5 bg-indigo-950 rounded-full" />
        </div>

        {/* Dynamic Interactive Status Bar */}
        <div className="w-full h-11 px-6 pt-3 flex justify-between items-center bg-white text-xs font-semibold text-gray-800 tracking-tight select-none border-b border-gray-100 flex-shrink-0 z-40">
          <span className="font-medium text-[11px]">{time}</span>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-600">
            <span>5G</span>
            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 3h-.01zM22 12c0-4.97-4.03-9-9-9v14.61L20.03 12c.74-1.54 1.97-3.49 1.97-5.61z" className="opacity-30" />
              <path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L12 3z" />
            </svg>
            <div className="w-5 h-2.5 border border-gray-400 rounded-sm p-[1px] flex items-center">
              <div className="bg-gray-800 h-full w-[88%] rounded-3xs" />
            </div>
          </div>
        </div>

        {/* Custom Toss-App Style Header */}
        <header className="sticky top-0 bg-white border-b border-gray-100 z-30 flex-shrink-0">
          <div className="px-5 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-toss-blue text-white rounded-xl flex items-center justify-center font-bold font-display shadow-md shadow-blue-500/10">
                W
              </div>
              <div>
                <h1 className="text-sm font-extrabold text-gray-900 tracking-tight font-display flex items-center gap-1">
                  웹툰 뭐보지?
                  <span className="px-1.5 py-0.5 bg-toss-blue-light text-toss-blue text-[9px] font-black rounded-md">MINI</span>
                </h1>
                <p className="text-[9px] text-gray-400 font-medium">실시간 취향 추천 비서</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {/* Tour Trigger */}
              <button
                id="curation-tour-btn"
                onClick={handleCurationTour}
                disabled={adState === "loading" || adState === "showing"}
                className="px-2.5 py-1.5 bg-toss-blue hover:bg-blue-600 disabled:opacity-60 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 transition-all cursor-pointer"
              >
                <Sparkles size={11} fill="currentColor" />
                <span>랜덤 추첨 받기</span>
              </button>
            </div>
          </div>
        </header>

        {/* Simulated iOS/Android Application Native Shell */}
        <div className="flex-1 overflow-y-auto bg-[#f9fafb] relative flex flex-col justify-between scrollbar-none">

          <div className="px-4 py-4 space-y-4 flex-1">

            {/* Surprise Curation Active Notification Banner */}
            <AnimatePresence>
              {curatedIds && (
                <motion.div
                  id="curation-banner-toast"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-blue-50 border border-blue-100 rounded-xl p-3 flex items-center justify-between gap-2 shadow-xs"
                >
                  <div className="flex items-start gap-2.5">
                    <span className="w-7 h-7 bg-toss-blue text-white rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Sparkles size={14} fill="currentColor" />
                    </span>
                    <div className="min-w-0">
                      <h4 className="font-bold text-xs text-blue-900 leading-tight">랜덤 추천 중!</h4>
                      <p className="text-[10px] text-blue-700 leading-normal line-clamp-2 mt-0.5">
                        랜덤 엄선 작품만 보이는 중이에요.
                      </p>
                    </div>
                  </div>
                  <button
                    id="clear-curation-banner-btn"
                    onClick={handleClearCuration}
                    className="px-2 py-1 bg-white text-blue-600 font-bold text-[10px] rounded-md hover:bg-blue-100 transition-colors shadow-xs cursor-pointer flex-shrink-0"
                  >
                    해제
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Trending Quick Ribbon - styled as a beautiful horizontal swipe row */}
            <div className="bg-white rounded-xl p-3 shadow-xs border border-gray-100 space-y-2">
              <div className="flex items-center gap-1.5 px-0.5">
                <span className="w-5 h-5 bg-red-50 text-red-500 rounded-md flex items-center justify-center">
                  <TrendingUp size={11} />
                </span>
                <span className="text-[11px] font-bold text-gray-800">
                  급상승 실시간 트렌드 태그
                </span>
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none scroll-smooth">
                {webtoons.slice(0, 5).map((w) => (
                  <button
                    id={`trending-tag-${w.id}`}
                    key={w.id}
                    className="px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-[10px] text-gray-600 rounded-lg font-medium cursor-pointer transition-colors whitespace-nowrap flex-shrink-0 border border-gray-100"
                    onClick={() => {
                      setFilters({ ...filters, searchQuery: w.title });
                      setCuratedIds(null);
                    }}
                  >
                    🔥 {w.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Condition Search Filter Panel */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider flex items-center gap-1 px-1">
                <Compass size={11} /> 취향 가이드 검색
              </label>
              <FilterPanel
                settings={filters}
                onChange={(newFilters) => {
                  setFilters(newFilters);
                  setCuratedIds(null);
                }}
                
              />
            </div>

            {/* Webtoons Cards Render Grid */}
            <div className="space-y-2.5 pt-2">
              <div className="flex justify-between items-center px-1">
        
<div className="flex items-center gap-2">
  <span className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider">웹툰 취향 검색 결과</span>
  {totalCount > 0 && (
    <span className="text-[11px] font-black text-toss-blue">
      {filteredWebtoons.length < totalCount
        ? `${filteredWebtoons.length} / ${totalCount.toLocaleString()}개`
        : `총 ${totalCount.toLocaleString()}개`}
    </span>
  )}
</div>
                {(filters.platform !== "all" || filters.day !== "all" || filters.status !== "all" || (filters.genres && filters.genres.length > 0) || filters.price !== "all" || filters.searchQuery) && (
                  <button
                    id="reset-filters-btn-sub"
                    onClick={handleResetFilters}
                    className="text-[10px] text-toss-blue font-bold transition-colors cursor-pointer"
                  >
                    필터 초기화
                  </button>
                )}
              </div>

              <AnimatePresence mode="wait">
                {loading ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-white rounded-xl p-8 text-center border border-gray-100 min-h-[220px] flex flex-col items-center justify-center"
                  >
                    <RefreshCw size={24} className="text-toss-blue animate-spin mb-2" />
                    <p className="text-xs text-gray-500 font-medium">취향 매칭 분석 중...</p>
                  </motion.div>
                ) : error ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="bg-red-50 border border-red-100 rounded-xl p-4 text-center text-red-800"
                  >
                    <AlertCircle size={20} className="mx-auto text-red-500 mb-1" />
                    <p className="text-xs font-semibold">{error}</p>
                  </motion.div>
                ) : (
                  <>
                    <WebtoonGrid
                      webtoons={filteredWebtoons}
                      onResetFilters={handleResetFilters}
                      onUpdateWebtoon={handleUpdateWebtoon}
                    />
                    {hasMore && (
                      <button
                        onClick={() => {
                          adPurposeRef.current = 'loadMore';
                          loadAd(); // 광고 먼저
                          fetchFilteredWebtoons(currentPage + 1, true); // 동시에 다음 페이지 로드
                        }}
                        className="w-full py-3 bg-white border border-gray-200 rounded-xl text-sm font-bold text-toss-blue hover:bg-blue-50 transition-colors mt-3 cursor-pointer"
                      >
                       더보기 {totalCount > 0 && `(${Math.min(6, totalCount - filteredWebtoons.length)}개 더 · 총 ${totalCount.toLocaleString()}개)`}
                      </button>
                    )}
                  </>
                )}
              </AnimatePresence>
            </div>

          </div>

          {/* Footer Area inside Phone UI */}
          <footer className="border-t border-gray-100 bg-white py-4 px-4 text-center text-[10px] text-gray-400 flex-shrink-0 space-y-1">
            <p className="font-bold text-gray-500">웹툰 뭐보지? &bull; 토스 미니앱 취향 매칭</p>
            <p>&copy; 2026 MIT Licensed. 실시간 Open API 연동 수집기 가동 중.</p>
          </footer>

        </div>

        {/* Simulated iOS physical bottom home indicator bar on desktop */}
        <div className="w-full h-5 bg-white flex items-center justify-center pb-2 select-none flex-shrink-0 z-40">
          <div className="w-32 h-1.5 bg-gray-300 rounded-full" />
        </div>

      </div>

      {/* Full-screen Interstitial Ad Simulator Overlay Modal */}
      <AdSimulator
        adState={adState}
        attConsent={attConsent}
        setAttConsent={setAttConsent}
        onDismiss={dismissAd}
      />

    </div>
  );
}