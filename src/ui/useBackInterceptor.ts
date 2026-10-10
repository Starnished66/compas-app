import { useEffect, useRef } from 'react';
import { BackHandler } from 'react-native';

export function useBackInterceptor(active: boolean, onBack: () => void): void {
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  useEffect(() => {
    if (!active) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onBackRef.current();
      return true;
    });
    return () => subscription.remove();
  }, [active]);
}
