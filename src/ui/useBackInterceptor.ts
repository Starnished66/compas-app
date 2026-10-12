import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';
import { useTabActive } from './tabActivity';

export function useBackInterceptor(enabled: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const tabActive = useTabActive();
  const active = enabled && tabActive;

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [active]);
}
