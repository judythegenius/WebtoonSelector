import { useState, useEffect } from "react";
import { X, ShieldCheck, Flame, Sparkles, MessageSquare } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface AdSimulatorProps {
  adState: 'idle' | 'loading' | 'loaded' | 'showing' | 'dismissed' | 'error';
  attConsent: 'prompt' | 'granted' | 'denied';
  setAttConsent: (consent: 'prompt' | 'granted' | 'denied') => void;
  onDismiss: () => void;
}

export default function AdSimulator({ adState, attConsent, setAttConsent, onDismiss }: AdSimulatorProps) {
  const [countdown, setCountdown] = useState(5);
  const [showATT, setShowATT] = useState(true);

  useEffect(() => {
    if (adState !== 'showing') return;

    // Reset states on entry
    setCountdown(5);
    setShowATT(attConsent === 'prompt');
  }, [adState, attConsent]);

  useEffect(() => {
    if (adState !== 'showing' || showATT) return;

    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, adState, showATT]);

  if (adState !== 'showing') return null;

  const handleATTSelection = (granted: boolean) => {
    setAttConsent(granted ? 'granted' : 'denied');
    setShowATT(false);
  };

  return (
    <div id="ad-simulator-overlay" className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">

      {/* ATT (App Tracking Transparency) Dialog Mock */}
      <AnimatePresence>
        {showATT && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white/95 text-gray-900 rounded-3xl p-6 max-w-sm w-full text-center shadow-2xl border border-gray-100 z-50 backdrop-blur-md"
          >
            <div className="w-12 h-12 bg-blue-50 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ShieldCheck size={26} />
            </div>
            <h4 className="font-bold text-base leading-tight mb-2">
              &ldquo;웹툰 뭐보지?&rdquo; 앱이 다른 회사의 앱 및 웹사이트에 걸친 사용자의 활동을 추적하도록 허용하시겠습니까?
            </h4>
            <p className="text-xs text-gray-500 leading-normal mb-5">
              허용하시면 내 취향에 정확히 어울리는 개인 맞춤형 웹툰 콘텐츠 추천과 한정 혜택 이벤트 광고를 받을 수 있습니다.
            </p>
            <div className="flex flex-col gap-2">
              <button
                id="att-deny-btn"
                onClick={() => handleATTSelection(false)}
                className="w-full py-3 bg-gray-50 hover:bg-gray-100 text-blue-500 font-semibold text-sm rounded-xl transition-colors cursor-pointer"
              >
                앱에 추적 금지 요청
              </button>
              <button
                id="att-allow-btn"
                onClick={() => handleATTSelection(true)}
                className="w-full py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                허용
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Ad Canvas */}
      {!showATT && (
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="relative bg-gradient-to-br from-indigo-900 via-indigo-950 to-slate-900 rounded-3xl w-full max-w-md aspect-[9/16] overflow-hidden flex flex-col justify-between p-6 shadow-2xl border border-white/10"
        >
          {/* Header Action Row */}
          <div className="flex justify-between items-center z-10">
            <span className="px-2.5 py-1 bg-white/10 text-white text-[10px] font-bold rounded-lg uppercase tracking-wider backdrop-blur-xs">
              AD SPONSOR
            </span>

            {countdown > 0 ? (
              <span className="px-3 py-1 bg-black/40 text-slate-300 text-xs font-semibold rounded-full backdrop-blur-xs">
                광고 {countdown}초 남음
              </span>
            ) : (
              <button
                id="close-ad-btn"
                onClick={onDismiss}
                className="px-3 py-1.5 bg-white text-gray-900 text-xs font-bold rounded-full flex items-center gap-1 hover:bg-gray-100 transition-colors cursor-pointer shadow-md"
              >
                <X size={12} />
                광고 건너뛰기
              </button>
            )}
          </div>

          {/* Ad Body Content */}
          <div className="my-auto text-center flex flex-col items-center justify-center p-4 z-10">
            <div className="w-16 h-16 bg-blue-500 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-blue-500/20 mb-5 animate-bounce">
              <Sparkles size={32} fill="white" />
            </div>
            <span className="px-3 py-1 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold rounded-full mb-3 flex items-center gap-1.5">
              <Flame size={12} fill="currentColor" /> 토스 미니앱 연동 기념 한정 이벤트
            </span>
            <h3 className="text-2xl font-bold text-white tracking-tight leading-tight font-display mb-2">
              깜짝 랜덤 웹툰 3선 투어!
            </h3>
            <p className="text-slate-300 text-xs leading-relaxed max-w-xs mb-6">
              지금 바로 무작위로 엄선한 웹툰 3편을 만나보세요. 매번 다른 조합으로 숨겨진 취향 저격 작품을 발견할 수 있습니다!
            </p>
            <div className="w-full max-w-[240px] bg-white/5 border border-white/5 rounded-2xl p-4 text-left">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-1">
                <MessageSquare size={10} /> 참가 보너스 무료 혜택
              </p>
              <div className="space-y-1.5">
                <p className="text-xs text-slate-200 font-medium">✔️ 랜덤 웹툰 3선 즉시 매칭</p>
                <p className="text-xs text-slate-200 font-medium">✔️ 매일 100% 무료 재도전 가능</p>
              </div>
            </div>
          </div>

          {/* Bottom Call-to-action Row */}
          <div className="space-y-3 z-10">
            <button
              id="ad-cta-btn"
              onClick={() => {
                onDismiss();
              }}
              className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white font-bold text-sm rounded-2xl transition-all cursor-pointer shadow-lg shadow-blue-500/20 text-center"
            >
              지금 랜덤 추천 받기
            </button>
            <p className="text-[10px] text-slate-500 text-center">
              인앱 광고 2.0 ver2 가이드라인을 준수하는 공식 시뮬레이터 카드입니다.
            </p>
          </div>

          {/* Abstract Ambient Lights Background */}
          <div className="absolute top-1/4 left-1/4 w-72 h-72 bg-blue-500/20 rounded-full filter blur-[100px] pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-indigo-500/20 rounded-full filter blur-[100px] pointer-events-none" />
        </motion.div>
      )}

    </div>
  );
}