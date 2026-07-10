import { useState, useCallback, useRef, useEffect } from "react";

export interface UseInterstitialAdOptions {
  adGroupId?: string;
  onAdLoaded?: () => void;
  onAdDismissed?: () => void;
  onAdError?: (error: any) => void;
}

export function useInterstitialAd({
  adGroupId = "ait-ad-test-interstitial-id",
  onAdLoaded,
  onAdDismissed,
  onAdError
}: UseInterstitialAdOptions = {}) {
  const [adState, setAdState] = useState<'idle' | 'loading' | 'loaded' | 'showing' | 'dismissed' | 'error'>('idle');
  const [attConsent, setAttConsent] = useState<'prompt' | 'granted' | 'denied'>('prompt');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const adStateRef = useRef(adState);

  // Keep ref in sync for any state changes coming from outside this hook
  useEffect(() => {
    adStateRef.current = adState;
  }, [adState]);

  // Update both React state (for UI re-render) and the ref (for synchronous
  // reads within the same tick) together. Avoids the stale-closure race
  // where a callback fires in the same tick as setState, before the
  // useEffect above has a chance to run.
  const setAdStateSynced = useCallback((next: typeof adState) => {
    adStateRef.current = next;
    setAdState(next);
  }, []);

  const isTossSdkSupported = useCallback(() => {
    return typeof window !== 'undefined' && (window as any).toss?.webFramework !== undefined;
  }, []);

  const loadAd = useCallback(async () => {
    setAdStateSynced('loading');
    console.log(`[Toss Ad SDK] loadFullScreenAd 호출 (adGroupId: ${adGroupId})`);

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      if (Math.random() < 0.05) {
        setAdStateSynced('error');
        if (onAdError) onAdError(new Error("Ad load failed. Network error."));
      } else {
        setAdStateSynced('loaded');
        console.log(`[Toss Ad SDK] 전면 광고 로드 완료 (loaded)`);
        if (onAdLoaded) onAdLoaded();
      }
    }, 1200);
  }, [adGroupId, onAdLoaded, onAdError, setAdStateSynced]);

  const showAd = useCallback(async () => {
    if (adStateRef.current !== 'loaded') {
      console.warn("[Toss Ad SDK] 광고가 아직 로드되지 않았습니다.");
      if (onAdDismissed) onAdDismissed();
      return;
    }

    setAdStateSynced('showing');
    console.log(`[Toss Ad SDK] showFullScreenAd 호출`);
  }, [onAdDismissed, setAdStateSynced]);

  const dismissAd = useCallback(() => {
    setAdStateSynced('dismissed');
    console.log(`[Toss Ad SDK] 전면 광고 닫힘 (dismissed)`);
    if (onAdDismissed) onAdDismissed();
  }, [onAdDismissed, setAdStateSynced]);

  const resetAd = useCallback(() => {
    setAdStateSynced('idle');
  }, [setAdStateSynced]);

  return {
    adState,
    setAdState,
    attConsent,
    setAttConsent,
    loadAd,
    showAd,
    dismissAd,
    resetAd,
    isSupported: isTossSdkSupported()
  };
}