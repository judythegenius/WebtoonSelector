import React, { useState, useEffect } from "react";
import { Webtoon } from "../types";
import { ExternalLink, Flame, Sparkles, BookOpen, RefreshCw } from "lucide-react";
import { motion } from "motion/react";
import { openURL } from "@apps-in-toss/web-framework";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface WebtoonGridProps {
  webtoons: Webtoon[];
  onResetFilters: () => void;
  onUpdateWebtoon?: (id: string) => Promise<any>;
}

export default function WebtoonGrid({ webtoons, onResetFilters, onUpdateWebtoon }: WebtoonGridProps) {
  const [failedImageIds, setFailedImageIds] = useState<Record<string, boolean>>({});
  const [updatingIds, setUpdatingIds] = useState<Record<string, boolean>>({});
  const attemptedIds = React.useRef<Set<string>>(new Set()); // 이미 시도한 ID 추적

  // 이미지 없는 카카오 카드 자동 업뎃 - 한 번만 시도
  useEffect(() => {
    if (!onUpdateWebtoon) return;
    const kakaoWithoutImg = webtoons.filter(
      w => (w.platform === "kakao" || w.platform === "kakaoPage") && !w.img
    );
    kakaoWithoutImg.forEach(w => {
      // 이미 시도했거나 진행 중이면 스킵
      if (attemptedIds.current.has(w.id) || updatingIds[w.id]) return;
      attemptedIds.current.add(w.id);
      setUpdatingIds(prev => ({ ...prev, [w.id]: true }));
      onUpdateWebtoon(w.id).finally(() => {
        setUpdatingIds(prev => ({ ...prev, [w.id]: false }));
      });
    });
  }, [webtoons.map(w => w.id).join(",")]); // webtoon ID 목록이 바뀔 때만 실행
  
  const handleUpdateClick = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!onUpdateWebtoon || updatingIds[id]) return;
    
    setUpdatingIds(prev => ({ ...prev, [id]: true }));
    try {
      await onUpdateWebtoon(id);
    } catch (err) {
      console.error(err);
    } finally {
      setUpdatingIds(prev => ({ ...prev, [id]: false }));
    }
  };

  const getPlatformStyle = (platform: string) => {
    switch (platform) {
      case "naver":
        return {
          label: "네이버",
          bg: "bg-emerald-500",
          text: "text-emerald-500",
          border: "border-emerald-200",
          lightBg: "bg-emerald-50",
        };
      case "kakao":
        return {
          label: "카카오",
          bg: "bg-yellow-500",
          text: "text-yellow-600",
          border: "border-yellow-200",
          lightBg: "bg-yellow-50",
        };
      case "kakaoPage":
        return {
          label: "카카오페이지",
          bg: "bg-amber-600",
          text: "text-amber-700",
          border: "border-amber-200",
          lightBg: "bg-amber-50",
        };
      default:
        return {
          label: "웹툰",
          bg: "bg-gray-500",
          text: "text-gray-500",
          border: "border-gray-200",
          lightBg: "bg-gray-50",
        };
    }
  };

  const getDayLabel = (days: string[], isEnd: boolean) => {
    if (isEnd || days.includes("finished") || days.includes("FINISHED")) {
      return "완결";
    }
    const koMap: Record<string, string> = {
      "MON": "월", "TUE": "화", "WED": "수", "THU": "목", "FRI": "금", "SAT": "토", "SUN": "일"
    };
    return days.map(d => koMap[d] || d).join("/");
  };

  if (webtoons.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white rounded-2xl p-10 text-center border border-gray-100 flex flex-col items-center justify-center min-h-[350px]"
      >
        <div className="w-16 h-16 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mb-4">
          <Sparkles size={28} />
        </div>
        <h3 className="text-lg font-semibold text-gray-800 mb-1">검색 조건에 맞는 웹툰이 없습니다</h3>
        <p className="text-sm text-gray-500 mb-5 max-w-sm">
          필터 조건을 완화하거나 크롤링 패널을 통해 새로운 웹툰 데이터를 실시간으로 가져와보세요.
        </p>
        <button
          onClick={onResetFilters}
          className="px-5 py-2.5 bg-toss-blue text-white font-medium rounded-xl text-sm hover:bg-blue-600 transition-colors shadow-xs cursor-pointer"
        >
          필터 초기화하기
        </button>
      </motion.div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
      </div>

      <div id="webtoon-grid-layout" className="grid grid-cols-2 gap-3.5">
        {webtoons.map((webtoon, idx) => {
          const pStyle = getPlatformStyle(webtoon.platform);
          // 이미지 프록시 URL - Date.now() 제거해서 캐시 유지
          const proxiedImg = webtoon.img 
            ? `${API_BASE}/api/image-proxy?url=${encodeURIComponent(webtoon.img)}`
            : "";

          return (
            <motion.div
              id={`webtoon-card-${webtoon.id}`}
              key={webtoon.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
              className="group bg-white rounded-2xl overflow-hidden shadow-xs hover:shadow-md border border-gray-100 transition-all duration-300 flex flex-col h-full"
            >
              {/* Thumbnail Area with Aspect Ratio */}
              <div className="relative aspect-[3/4] bg-gray-100 overflow-hidden">
                {failedImageIds[webtoon.id] || !webtoon.img ? (
                  webtoon.platform === "naver" ? (
                    <div className="w-full h-full bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 flex flex-col items-center justify-center p-4 text-center select-none">
                      <BookOpen className="w-8 h-8 text-white/95 mb-2 drop-shadow-xs animate-pulse" />
                      <span className="text-white text-xs font-extrabold tracking-tight leading-snug line-clamp-2 px-1">
                        {webtoon.title}
                      </span>
                      <span className="text-emerald-100/90 text-[10px] mt-1 line-clamp-1 font-medium">
                        {webtoon.author}
                      </span>
                      <div className="absolute bottom-2 right-2 text-[26px] font-black text-white/10 italic select-none pointer-events-none">
                        NAVER
                      </div>
                    </div>
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-400 via-yellow-500 to-orange-500 flex flex-col items-center justify-center p-4 text-center select-none">
                      <BookOpen className="w-8 h-8 text-amber-950/90 mb-2 drop-shadow-xs animate-pulse" />
                      <span className="text-amber-950 text-xs font-extrabold tracking-tight leading-snug line-clamp-2 px-1">
                        {webtoon.title}
                      </span>
                      <span className="text-amber-900/90 text-[10px] mt-1 line-clamp-1 font-medium">
                        {webtoon.author}
                      </span>
                      <div className="absolute bottom-2 right-2 text-[26px] font-black text-amber-950/10 italic select-none pointer-events-none">
                        KAKAO
                      </div>
                    </div>
                  )
                ) : (
                  webtoon.img && (
                    webtoon.img.toLowerCase().includes(".webm") ||
                    webtoon.img.toLowerCase().includes(".mov") ||
                    webtoon.img.toLowerCase().includes(".mp4")
                  ) ? (
                    <video
                    key={webtoon.img}
                      src={proxiedImg}
                      playsInline
                      autoPlay
                      loop
                      muted
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={() => {
                  if (onUpdateWebtoon && !updatingIds[webtoon.id] && !attemptedIds.current.has(webtoon.id)) {
                    attemptedIds.current.add(webtoon.id);
                    setUpdatingIds(prev => ({ ...prev, [webtoon.id]: true }));
                    onUpdateWebtoon(webtoon.id).then((updated) => {
                      if (updated?.img) {
                        setFailedImageIds(prev => {
                          const next = { ...prev };
                          delete next[webtoon.id];
                          return next;
                        });
                      } else {
                        setFailedImageIds(prev => ({ ...prev, [webtoon.id]: true }));
                      }
                    }).finally(() => {
                      setUpdatingIds(prev => ({ ...prev, [webtoon.id]: false }));
                    });
                  } else {
                    setFailedImageIds(prev => ({ ...prev, [webtoon.id]: true }));
                  }
                }}
                    />
                  ) : (

                  <img
                  key={webtoon.img}
                      src={proxiedImg}
                      alt={webtoon.title}
                      referrerPolicy="no-referrer"
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={() => {
                  if (onUpdateWebtoon && !updatingIds[webtoon.id] && !attemptedIds.current.has(webtoon.id)) {
                    attemptedIds.current.add(webtoon.id);
                    setUpdatingIds(prev => ({ ...prev, [webtoon.id]: true }));
                    onUpdateWebtoon(webtoon.id).then((updated) => {
                      if (updated?.img) {
                        setFailedImageIds(prev => {
                          const next = { ...prev };
                          delete next[webtoon.id];
                          return next;
                        });
                      } else {
                        setFailedImageIds(prev => ({ ...prev, [webtoon.id]: true }));
                      }
                    }).finally(() => {
                      setUpdatingIds(prev => ({ ...prev, [webtoon.id]: false }));
                    });
                  } else {
                    setFailedImageIds(prev => ({ ...prev, [webtoon.id]: true }));
                  }
                }}
                    />
                  )
                )}

          {/* Floating Tags */}
          <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1.5 z-10">
            <span className={`px-2 py-0.5 text-[10px] font-bold text-white rounded-md shadow-xs ${pStyle.bg}`}>
              {pStyle.label}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-gray-900/80 text-white rounded-md backdrop-blur-xs">
              {getDayLabel(webtoon.updateDays, webtoon.isEnd)}
            </span>
            {webtoon.isAdult && (
              <span className="px-1.5 py-0.5 text-[9px] font-bold bg-red-500 text-white rounded-md shadow-xs">
                18+
              </span>
            )}
          </div>
                
                {/* Hot Status Overlays */}
                <div className="absolute top-2.5 right-2.5 flex gap-1 z-10">
                  {webtoon.isUp && (
                    <span className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-xs" title="업데이트">
                      <Flame size={12} fill="white" />
                    </span>
                  )}
                  {webtoon.isNew && (
                    <span className="px-1.5 py-0.5 bg-yellow-400 text-yellow-950 font-bold text-[9px] rounded-md shadow-xs">
                      NEW
                    </span>
                  )}
                </div>

                {/* Action Hover Overlay */}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center z-10 backdrop-blur-xs">
              <button
                id={`read-webtoon-btn-${webtoon.id}`}
                onClick={(e) => {
                  e.stopPropagation();
                 openURL(webtoon.url);
                }}
                className="px-4 py-2 bg-white text-gray-900 rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-md hover:bg-gray-100 transition-colors cursor-pointer"
              >
                웹툰 보러가기
                <ExternalLink size={12} />
              </button>
            </div>
            </div>

              {/* Information Area */}
              <div className="p-3 md:p-4 flex flex-col flex-grow justify-between min-h-[120px]">
                <div>
                  {/* Title & Price badge */}
                  <div className="flex items-start gap-1 justify-between mb-1">
                    <h4 className="font-bold text-xs sm:text-sm text-gray-900 line-clamp-2 group-hover:text-toss-blue transition-colors flex-1" title={webtoon.title}>
                      {webtoon.title}
                    </h4>
                    {webtoon.isDailyPass ? (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-extrabold bg-blue-50 text-blue-700 border border-blue-200 rounded-sm">
                        매일+
                      </span>
                    ) : webtoon.isFree === false ? (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200 rounded-sm">
                        유료
                      </span>
                    ) : (
                      <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-sm">
                        무료
                      </span>
                    )}
                  </div>
                  
                  {/* Author */}
                  <p className="text-[10px] sm:text-xs text-gray-500 truncate mb-1">
                    {webtoon.author}
                  </p>

                  {/* Billing details / episode spec */}
                  {webtoon.isDailyPass && (
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-[9px] text-toss-blue font-bold bg-blue-50 px-1.5 py-0.5 rounded-sm">
                        ⚡ {webtoon.dailyPassDuration ? `${webtoon.dailyPassDuration}시간마다 무료` : "24시간마다 무료"}
                      </span>
                    </div>
                  )}

                  {webtoon.totalEpisodes !== undefined && (
                    <p className="text-[9px] text-gray-400 font-medium mb-2 leading-tight">
                      전체 {webtoon.totalEpisodes}화 중 {webtoon.freeEpisodes}화 무료
                      {webtoon.paidEpisodes && webtoon.paidEpisodes > 0 ? (
                        <span className="text-amber-600 font-bold ml-1">({webtoon.paidEpisodes}화 유료)</span>
                      ) : ""}
                    </p>
                  )}

                  {/* Dynamic platform specific indicators */}
                  {webtoon.isPayNotice && webtoon.payNoticeDate && (
                    <div className="mb-2 text-[9px] font-bold text-red-600 bg-red-50 border border-red-100 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                      <span>⚠️ {webtoon.payNoticeDate} 유료 전환 예정</span>
                    </div>
                  )}

                  {webtoon.previewCount !== undefined && webtoon.previewCount > 0 && webtoon.isEnd && (
                    <div className="mb-2 text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded-md inline-flex items-center gap-1">
                      <span>💡 완결 (미리보기 유료 {webtoon.previewCount}화)</span>
                    </div>
                  )}
                </div>

                {/* Genres & Sync trigger row */}
                <div className="flex items-center justify-between gap-1.5 mt-auto pt-2 border-t border-gray-50">
                  <div className="flex flex-wrap gap-1">
                    {webtoon.genres && webtoon.genres.length > 0 ? (
                      webtoon.genres.slice(0, 2).map((g) => (
                        <span
                          key={g}
                          className="px-1.5 py-0.5 bg-gray-50 text-gray-500 text-[9px] rounded-md font-medium border border-gray-100"
                        >
                          {g}
                        </span>
                      ))
                    ) : (
                      <span className="px-1.5 py-0.5 bg-gray-50 text-gray-400 text-[9px] rounded-md italic">
                        일반
                      </span>
                    )}
                  </div>

                  {onUpdateWebtoon && (
                    <button
                      id={`update-webtoon-btn-${webtoon.id}`}
                      onClick={(e) => handleUpdateClick(e, webtoon.id)}
                      disabled={updatingIds[webtoon.id]}
                      className="px-2 py-1 bg-gray-50 hover:bg-toss-blue/5 text-[9px] font-bold text-gray-400 hover:text-toss-blue border border-gray-100 rounded-md flex items-center gap-1 transition-all cursor-pointer whitespace-nowrap"
                      title="실시간 상태 크롤링 및 자가 치유"
                    >
                      <RefreshCw size={9} className={updatingIds[webtoon.id] ? "animate-spin text-toss-blue" : ""} />
                      <span>{updatingIds[webtoon.id] ? "동기화.." : "업뎃"}</span>
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}