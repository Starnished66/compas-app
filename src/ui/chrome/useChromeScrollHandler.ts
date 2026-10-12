import { useCallback, useContext, useEffect, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Distances } from '../motion';
import { ChromeActionsContext } from './chromeContext';

const EXPAND_GRACE_MS = 700;

export function useChromeScrollHandler(
  enabled: boolean,
): (event: NativeSyntheticEvent<NativeScrollEvent>) => void {
  const chrome = useContext(ChromeActionsContext);
  const lastY = useRef(0);
  const travel = useRef(0);
  const expand = chrome?.expand;

  useEffect(() => {
    travel.current = 0;
    if (!enabled) expand?.();
  }, [enabled, expand]);

  return useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!enabled || !chrome) return;
      const y = event.nativeEvent.contentOffset.y;
      const delta = y - lastY.current;
      lastY.current = y;
      if (y < Distances.chromeTop) {
        travel.current = 0;
        chrome.expand();
        return;
      }
      if (delta === 0) return;
      travel.current = Math.sign(delta) === Math.sign(travel.current) ? travel.current + delta : delta;
      if (travel.current > Distances.chromeScroll) {
        travel.current = 0;
        if (Date.now() - chrome.lastExpandedAt() >= EXPAND_GRACE_MS) chrome.minimize();
      } else if (travel.current < -Distances.chromeScroll) {
        travel.current = 0;
        chrome.expand();
      }
    },
    [chrome, enabled],
  );
}
