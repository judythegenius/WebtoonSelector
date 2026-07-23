import { useState } from "react";
import { Webtoon } from "../types";
import { Sparkles, MessageSquare, Send, ArrowRight, CornerDownRight, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { openExternalBrowser } from "@apps-in-toss/web-framework";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

interface AIGuideProps {
  webtoons: Webtoon[];
  onApplyCuration: (curatedIds: string[]) => void;
}

interface RecommendationResult {
  id: string;
  reason: string;
}

export default function AIGuide({ webtoons, onApplyCuration }: AIGuideProps) {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  
  // Conversation History
  const [aiResponse, setAiResponse] = useState<string>("");
  const [recommendedItems, setRecommendedItems] = useState<RecommendationResult[]>([]);

  const PRESETS = [
    { label: "🔥 먼치킨 통쾌한 판타지", text: "스트레스 확 날아가는, 주인공이 엄청나게 강해서 다 이기는 시원시원한 먼치킨 판타지 웹툰을 추천해줘." },
    { label: "🌸 가슴 설레는 로맨스", text: "연애 세포가 자극되는, 풋풋하면서도 가슴 뛰는 로코(로맨틱 코미디)나 청춘 로맨스물 알려줘." },
    { label: "🕵️ 숨 막히는 스릴러/미스터리", text: "한 번 보면 멈출 수 없는, 심리전과 긴장감이 돋보이는 두뇌 싸움 스릴러 웹툰을 보여줘." },
    { label: "🐱 힐링 가득 따뜻한 일상툰", text: "머리를 비우고 편안하게 웃으면서 힐링할 수 있는 귀엽고 몽글몽글한 일상 웹툰 추천해줘." }
  ];

  const handleQuery = async (queryText: string) => {
    if (!queryText.trim()) return;
    setLoading(true);
    setError("");
    setPrompt(queryText);

    try {
      const response = await fetch(`${API_BASE}/api/gemini/recommend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: queryText }),
      });

      if (!response.ok) {
        throw new Error("서버와의 통신에 실패했습니다.");
      }

      const data = await response.json();
      
      setAiResponse(data.chatResponse || "취향에 어울리는 추천 웹툰을 찾았습니다.");
      setRecommendedItems(data.recommendations || []);
    } catch (err: any) {
      setError(err.message || "AI 추천 처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (text: string) => {
    handleQuery(text);
  };

  const handleApplyToGrid = () => {
    if (recommendedItems.length > 0) {
      const ids = recommendedItems.map(item => item.id);
      onApplyCuration(ids);
    }
  };

  // Find full Webtoon objects for the recommended IDs
  const matchedWebtoons = recommendedItems
    .map(rec => {
      const webtoon = webtoons.find(w => w.id === rec.id);
      return webtoon ? { ...webtoon, aiReason: rec.reason } : null;
    })
    .filter(Boolean) as (Webtoon & { aiReason: string })[];

  return (
    <div id="ai-guide-panel" className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-2xl p-5 md:p-6 shadow-md transition-all duration-300">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center text-white shadow-xs">
          <Sparkles size={18} fill="white" className="animate-pulse" />
        </span>
        <div>
          <h3 className="font-semibold text-base flex items-center gap-1.5 font-display">
            뭐보지 AI 취향 가이드
          </h3>
          <p className="text-[11px] text-slate-300">Gemini와 로컬 데이터베이스를 조합한 개인 맞춤형 웹툰 큐레이션</p>
        </div>
      </div>

      {/* Preset Buttons */}
      <div className="mb-5">
        <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2 flex items-center gap-1">
          <MessageSquare size={10} /> 빠른 추천 가이드 키워드
        </p>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              id={`preset-btn-${preset.label.slice(2, 6)}`}
              key={preset.label}
              onClick={() => handlePresetClick(preset.text)}
              disabled={loading}
              className="px-2.5 py-1.5 bg-white/10 hover:bg-white/15 disabled:opacity-50 text-slate-200 text-xs rounded-xl transition-all border border-white/5 cursor-pointer text-left font-medium"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Query Bar */}
      <div className="relative mb-5">
        <input
          id="ai-prompt-input"
          type="text"
          placeholder="예: 복잡한 것 싫고 시원하게 다 이기는 무협 웹툰 추천해줘"
          className="w-full bg-white/10 border border-white/10 rounded-xl py-3 pl-4 pr-12 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-slate-900 transition-all outline-none"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleQuery(prompt)}
          disabled={loading}
        />
        <button
          id="send-prompt-btn"
          onClick={() => handleQuery(prompt)}
          disabled={loading || !prompt.trim()}
          className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-blue-500 hover:bg-blue-600 disabled:opacity-40 transition-colors rounded-lg flex items-center justify-center text-white cursor-pointer"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={14} />}
        </button>
      </div>

      {/* Interactive Response Area */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="py-6 flex flex-col items-center justify-center bg-white/5 border border-white/5 rounded-xl mb-4"
          >
            <Loader2 size={24} className="text-blue-400 animate-spin mb-2" />
            <span className="text-xs text-slate-300">뭐보지 AI가 데이터베이스 분석 및 기분 필터링 중...</span>
          </motion.div>
        )}

        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-xs mb-4"
          >
            {error}
          </motion.div>
        )}

        {!loading && aiResponse && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {/* Curation Text */}
            <div className="bg-white/5 border border-white/5 p-4 rounded-xl text-slate-100 text-xs leading-relaxed">
              <p className="font-semibold text-blue-400 mb-1.5 flex items-center gap-1 text-[13px]">
                <Sparkles size={12} fill="currentColor" /> AI 큐레이터 해설
              </p>
              {aiResponse}
            </div>

            {/* Recommended Cards Display */}
            {matchedWebtoons.length > 0 && (
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">이런 웹툰은 어떠신가요?</span>
                  <button
                    id="apply-curation-filter-btn"
                    onClick={handleApplyToGrid}
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-semibold transition-colors cursor-pointer"
                  >
                    이 작품들만 모아보기 <ArrowRight size={12} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {matchedWebtoons.map((webtoon) => (
                    <div
                      id={`rec-item-${webtoon.id}`}
                      key={webtoon.id}
                      className="bg-white/10 hover:bg-white/15 border border-white/5 p-3 rounded-xl flex gap-3 transition-all group"
                    >
                      {/* Proxied thumbnail */}
                      <img
                        src={`${API_BASE}/api/image-proxy?url=${encodeURIComponent(webtoon.img)}`}
                        alt={webtoon.title}
                        referrerPolicy="no-referrer"
                        className="w-12 h-16 object-cover rounded-lg bg-slate-800"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <h4 className="font-bold text-xs text-slate-100 truncate">{webtoon.title}</h4>
                          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 font-bold text-[9px] rounded-sm">
                            {webtoon.platform === "naver" ? "네이버" : "카카오"}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 mb-1.5">{webtoon.author}</p>
                        
                        {/* Custom matching reason */}
                        <p className="text-[10px] text-slate-300 bg-black/20 p-2 rounded-lg italic flex items-start gap-1">
                          <CornerDownRight size={10} className="mt-0.5 text-blue-400 flex-shrink-0" />
                          <span>{webtoon.aiReason}</span>
                        </p>
                      </div>
                     <div className="flex items-center justify-center">
                    <button
                      id={`rec-link-${webtoon.id}`}
                      onClick={() => openExternalBrowser(webtoon.url)}
                      className="w-7 h-7 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-all cursor-pointer"
                    >
                      <ArrowRight size={12} />
                    </button>
                  </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
