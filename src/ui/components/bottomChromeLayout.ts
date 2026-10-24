import { Size, Space } from '../tokens';
import { insetBeyond } from '../insetBeyond';

export const ChromeInset = Space.md;
export const ChromeGap = Space.sm;
export const TabBarRightInset = ChromeInset + Size.bar + ChromeGap;
export const MiniPlayerBottom = ChromeInset + Size.bar + ChromeGap;
export const MinimizedTabBarWidth = Size.bar;

export function chromeContentInset(withMiniPlayer: boolean, safeAreaBottom = 0): number {
  const tabBarSpace = ChromeInset * 2 + Size.bar;
  const miniPlayerSpace = withMiniPlayer ? Size.bar + ChromeGap : 0;
  return insetBeyond(safeAreaBottom, ChromeInset) + tabBarSpace + miniPlayerSpace;
}

export function minimizedTabBarRightInset(chromeWidth: number): number {
  return Math.max(TabBarRightInset, chromeWidth - ChromeInset - MinimizedTabBarWidth);
}
