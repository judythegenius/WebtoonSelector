import { FilterSettings, PlatformFilter, DayFilter, StatusFilter, PriceFilter, SortOption } from "../types";
import { Search, X, Layers, Calendar, CheckCircle2, Bookmark, Coins, ArrowUpDown } from "lucide-react";

interface FilterPanelProps {
  settings: FilterSettings;
  onChange: (settings: FilterSettings) => void;
}

export default function FilterPanel({ settings, onChange }: FilterPanelProps) {
  const handlePlatformChange = (platform: PlatformFilter) => {
    onChange({ ...settings, platform });
  };

  const handleDayChange = (day: DayFilter) => {
    onChange({ ...settings, day });
  };

  const handleStatusChange = (status: StatusFilter) => {
    onChange({ ...settings, status });
  };

  const handlePriceChange = (price: PriceFilter) => {
    onChange({ ...settings, price });
  };

  const handleSortChange = (sort: SortOption) => {
    onChange({ ...settings, sort });
  };

  const clearSearch = () => {
    onChange({ ...settings, searchQuery: "" });
  };

  const DAYS: { key: DayFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "MON", label: "월" },
    { key: "TUE", label: "화" },
    { key: "WED", label: "수" },
    { key: "THU", label: "목" },
    { key: "FRI", label: "금" },
    { key: "SAT", label: "토" },
    { key: "SUN", label: "일" },
  ];

  const PLATFORMS: { key: PlatformFilter; label: string; color: string; bg: string }[] = [
    { key: "all", label: "전체 플랫폼", color: "text-gray-700", bg: "bg-gray-100" },
    { key: "naver", label: "네이버 웹툰", color: "text-emerald-700 font-bold", bg: "bg-emerald-50 border-emerald-200" },
    { key: "kakao", label: "카카오 웹툰", color: "text-yellow-800 font-bold", bg: "bg-yellow-50 border-yellow-200" },
    { key: "kakaoPage", label: "카카오 페이지", color: "text-amber-900 font-bold", bg: "bg-amber-50 border-amber-200" },
  ];

  const STATUSES: { key: StatusFilter; label: string }[] = [
    { key: "all", label: "전체" },
    { key: "ongoing", label: "연재중" },
    { key: "finished", label: "완결" },
    { key: "hiatus", label: "휴재" },
  ];

  const PRICES: { key: PriceFilter; label: string }[] = [
    { key: "all", label: "전체 요금" },
    { key: "free", label: "무료" },
    { key: "paid", label: "유료" },
  ];

const SORTS: { key: SortOption; label: string }[] = [
  { key: "default", label: "기본 정렬" },
  { key: "updated", label: "업데이트순" },
  { key: "newest", label: "신작순" },
  { key: "free", label: "무료 많은순" },
];

  return (
    <div id="filter-panel" className="bg-white rounded-2xl p-5 md:p-6 shadow-xs border border-gray-100 transition-all duration-300 space-y-5">

      {/* Platform Selector - Grid for Perfect Symmetry and Comfort */}
      <div>
        <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2.5 uppercase tracking-wider">
          <Layers size={13} /> 플랫폼 필터
        </label>
        <div className="grid grid-cols-2 gap-2">
          {PLATFORMS.map((p) => {
            const isSelected = settings.platform === p.key;
            return (
              <button
                id={`platform-btn-${p.key}`}
                key={p.key}
                onClick={() => handlePlatformChange(p.key)}
                className={`py-3 px-4 text-xs font-semibold rounded-xl border transition-all cursor-pointer text-center ${
                  isSelected
                    ? `${p.bg} ${p.color} border-current ring-1 ring-offset-0 ring-current shadow-xs`
                    : "bg-gray-50 hover:bg-gray-100 text-gray-600 border-transparent"
                }`}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Day Selector - Single Row Grid */}
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
            <Calendar size={13} /> 요일 및 상태
          </label>
        </div>
        
        <div className="grid grid-cols-8 gap-[3px] bg-gray-50 p-1 rounded-xl border border-gray-100">
          {DAYS.map((d) => {
            const isSelected = settings.day === d.key;
            return (
              <button
                id={`day-btn-${d.key}`}
                key={d.key}
                onClick={() => handleDayChange(d.key)}
                className={`py-1.5 text-[11px] font-bold rounded-lg transition-all cursor-pointer text-center ${
                  isSelected
                    ? "bg-toss-blue text-white shadow-xs"
                    : "hover:bg-gray-200/50 text-gray-600"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid wrapper for Status, Price, and Genre for alignment */}
      <div className="space-y-4 pt-1">
        
        {/* Status Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            <CheckCircle2 size={13} /> 연재 상태
          </label>
          <div className="grid grid-cols-4 gap-1.5">
            {STATUSES.map((s) => {
              const isSelected = settings.status === s.key;
              return (
                <button
                  id={`status-btn-${s.key}`}
                  key={s.key}
                  onClick={() => handleStatusChange(s.key)}
                  className={`py-2 px-1 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? "bg-gray-800 text-white shadow-xs"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Price Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            <Coins size={13} /> 대여 및 요금
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {PRICES.map((p) => {
              const isSelected = settings.price === p.key;
              return (
                <button
                  id={`price-btn-${p.key}`}
                  key={p.key}
                  onClick={() => handlePriceChange(p.key)}
                  className={`py-2 px-1 text-center text-xs font-bold rounded-xl transition-all cursor-pointer ${
                    isSelected
                      ? "bg-toss-blue text-white shadow-xs"
                      : "bg-gray-50 hover:bg-gray-100 text-gray-600"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Genre 멀티선택 칩 - 하드코딩으로 깔끔하게 고정 */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            <Bookmark size={13} /> 장르 필터링
            {(settings.genres ?? []).length > 0 && (
              <span className="ml-auto text-toss-blue font-black text-[10px] normal-case tracking-normal">
                {(settings.genres ?? []).length}개 선택 · OR
              </span>
            )}
          </label>
          <div className="flex flex-wrap gap-1.5">
            {/* 전체 초기화 */}
            <button
              onClick={() => onChange({ ...settings, genres: [] })}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-full border transition-all cursor-pointer ${
                (settings.genres ?? []).length === 0
                  ? "bg-gray-800 text-white border-gray-800"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              }`}
            >전체</button>

            {[
  "로맨스/순정", "판타지", "드라마", "액션", "무협",
  "학원", "일상", "개그", "스릴러", "스포츠",
  "BL", "메디컬",
].map((g) => {
              const selected = (settings.genres ?? []).includes(g);
              return (
                <button
                  key={g}
                  onClick={() => {
                    const cur = settings.genres ?? [];
                    onChange({
                      ...settings,
                      genres: selected ? cur.filter(x => x !== g) : [...cur, g],
                    });
                  }}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-full border transition-all cursor-pointer ${
                    selected
                      ? "bg-toss-blue text-white border-toss-blue shadow-xs"
                      : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                  }`}
                >{g}</button>
              );
            })}

            {/* 18+ */}
            <button
              onClick={() => {
                const cur = settings.genres ?? [];
                const selected = cur.includes("18+");
                onChange({ ...settings, genres: selected ? cur.filter(x => x !== "18+") : [...cur, "18+"] });
              }}
              className={`px-3 py-1.5 text-[11px] font-bold rounded-full border transition-all cursor-pointer ${
                (settings.genres ?? []).includes("18+")
                  ? "bg-red-500 text-white border-red-500 shadow-xs"
                  : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
              }`}
            >🔞 18+</button>
          </div>
        </div>

        {/* Sort Selector */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">
            <ArrowUpDown size={13} /> 정렬 기준
          </label>
          <div className="relative">
            <select
              id="sort-select"
              value={settings.sort}
              onChange={(e) => handleSortChange(e.target.value as SortOption)}
              className="w-full bg-gray-50 border-2 border-transparent text-gray-700 text-xs py-3 px-3.5 rounded-xl focus:outline-none focus:bg-white focus:border-toss-blue/30 appearance-none cursor-pointer font-bold"
            >
              {SORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-gray-400">
              <svg className="w-4 h-4 fill-current" viewBox="0 0 20 20">
                <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
              </svg>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}