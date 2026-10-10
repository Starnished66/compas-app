import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

let lastKnownReducedMotion = false;

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(lastKnownReducedMotion);

  useEffect(() => {
    let mounted = true;
    const update = (enabled: boolean) => {
      lastKnownReducedMotion = enabled;
      if (mounted) setReduced(enabled);
    };
    AccessibilityInfo.isReduceMotionEnabled().then(update).catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', update);
    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}
