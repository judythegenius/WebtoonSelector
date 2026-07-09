import { useState, useCallback, useRef } from "react";

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

  // Checks if the true Toss Web Framework is available
  const isTossSdkSupported = useCallback(() => {
    return typeof window !== 'undefined' && (window as any).toss?.webFramework !== undefined;
  }, []);

  const loadAd = useCallback(async () => {
    setAdState('loading');
    console.log(`[Toss Ad SDK] loadFullScreenAd 호출 (adGroupId: ${adGroupId})`);

    // Simulate SDK loading state
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(() => {
      if (Math.random() < 0.05) {
        // Safe fail rate for realism / error testing
        setAdState('error');
        if (onAdError) onAdError(new Error("Ad load failed. Network error."));
      } else {
        setAdState('loaded');
        console.log(`[Toss Ad SDK] 전면 광고 로드 완료 (loaded)`);
        if (onAdLoaded) onAdLoaded();
      }
    }, 1200); // Realistic network delay
  }, [adGroupId, onAdLoaded, onAdError]);

  const showAd = useCallback(async () => {
    if (adState !== 'loaded') {
      console.warn("[Toss Ad SDK] 광고가 아직 로드되지 않았습니다.");
      // Fallback: Proceed instantly to trigger dismissed to prevent blocking user journey
      if (onAdDismissed) onAdDismissed();
      return;
    }

    setAdState('showing');
    console.log(`[Toss Ad SDK] showFullScreenAd 호출`);
    
    // In production, we'd trigger window.toss.showFullScreenAd
    // Here we manage local states to render a gorgeous simulated interactive ad inside the web applet!
  }, [adState, onAdDismissed]);

  const dismissAd = useCallback(() => {
    setAdState('dismissed');
    console.log(`[Toss Ad SDK] 전면 광고 닫힘 (dismissed)`);
    if (onAdDismissed) onAdDismissed();
  }, [onAdDismissed]);

  const resetAd = useCallback(() => {
    setAdState('idle');
  }, []);

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
