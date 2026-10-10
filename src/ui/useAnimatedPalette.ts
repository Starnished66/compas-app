import { useEffect, useRef, useState } from 'react';
import { mixColors } from './colorMix';
import { Durations, Easings } from './motion';
import { Palette } from './palette';
import { useReducedMotion } from './useReducedMotion';

type AccentKey = 'accent' | 'onAccent' | 'accentContainer' | 'onAccentContainer';

const ACCENT_KEYS: readonly AccentKey[] = ['accent', 'onAccent', 'accentContainer', 'onAccentContainer'];

function samePalette(a: Palette, b: Palette): boolean {
  return (Object.keys(a) as (keyof Palette)[]).every((key) => a[key] === b[key]);
}

function onlyAccentsDiffer(a: Palette, b: Palette): boolean {
  return (Object.keys(a) as (keyof Palette)[]).every(
    (key) => a[key] === b[key] || (ACCENT_KEYS as readonly string[]).includes(key),
  );
}

function blendAccents(from: Palette, to: Palette, amount: number): Palette {
  const blended = { ...to };
  for (const key of ACCENT_KEYS) blended[key] = mixColors(from[key], to[key], amount);
  return blended;
}

export function useAnimatedPalette(target: Palette): Palette {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);
  shownRef.current = shown;

  useEffect(() => {
    const from = shownRef.current;
    if (samePalette(from, target)) return;
    if (reducedMotion || !onlyAccentsDiffer(from, target)) {
      setShown(target);
      return;
    }
    const startedAt = Date.now();
    let lastFrameAt = 0;
    let frame: ReturnType<typeof requestAnimationFrame> | null = null;
    const step = () => {
      const now = Date.now();
      const elapsed = Math.min(1, (now - startedAt) / Durations.accent);
      if (elapsed >= 1) {
        setShown(target);
        frame = null;
        return;
      }
      if (now - lastFrameAt >= Durations.accentFrame) {
        lastFrameAt = now;
        setShown(blendAccents(from, target, Easings.ease(elapsed)));
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [reducedMotion, target]);

  return shown;
}
