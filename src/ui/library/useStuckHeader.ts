import { useCallback, useRef, useState } from 'react';
import { LayoutChangeEvent } from 'react-native';

const STICK_TOLERANCE = 1;

export interface StuckHeader {
  stuck: boolean;
  trackOffset: (offset: number) => void;
  onLeadingLayout: (event: LayoutChangeEvent) => void;
}

export function useStuckHeader(): StuckHeader {
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const stickOffset = useRef<number | null>(null);
  const offset = useRef(0);

  const update = useCallback(() => {
    const stickAt = stickOffset.current;
    const next = stickAt != null && offset.current >= stickAt - STICK_TOLERANCE;
    if (next === stuckRef.current) return;
    stuckRef.current = next;
    setStuck(next);
  }, []);

  const trackOffset = useCallback(
    (value: number) => {
      offset.current = value;
      update();
    },
    [update],
  );

  const onLeadingLayout = useCallback(
    (event: LayoutChangeEvent) => {
      stickOffset.current = event.nativeEvent.layout.height;
      update();
    },
    [update],
  );

  return { stuck, trackOffset, onLeadingLayout };
}
