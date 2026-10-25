import { useCallback, useMemo, useRef } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';
import { LibraryItem } from './libraryItems';

export interface LibraryListScroll {
  listRef: React.RefObject<FlashListRef<LibraryItem> | null>;
  offset: () => number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onContentSizeChange: (width: number, height: number) => void;
  scrollToTop: (animated?: boolean) => void;
  restoreOffset: (offset: number) => void;
}

export function useLibraryListScroll(onOffsetChange?: (offset: number) => void): LibraryListScroll {
  const offsetListener = useRef(onOffsetChange);
  offsetListener.current = onOffsetChange;
  const listRef = useRef<FlashListRef<LibraryItem> | null>(null);
  const offsetRef = useRef(0);
  const pendingRestore = useRef<number | null>(null);

  const scrollTo = useCallback((offset: number, animated: boolean) => {
    listRef.current?.scrollToOffset({ offset, animated });
    offsetRef.current = offset;
    offsetListener.current?.(offset);
  }, []);

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetRef.current = event.nativeEvent.contentOffset.y;
      offsetListener.current?.(offsetRef.current);
    },
    [],
  );

  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      const target = pendingRestore.current;
      if (target == null || height < target) return;
      pendingRestore.current = null;
      scrollTo(target, false);
    },
    [scrollTo],
  );

  const scrollToTop = useCallback(
    (animated = false) => {
      pendingRestore.current = null;
      scrollTo(0, animated);
    },
    [scrollTo],
  );

  const restoreOffset = useCallback(
    (offset: number) => {
      pendingRestore.current = offset > 0 ? offset : null;
      scrollTo(offset, false);
      requestAnimationFrame(() => {
        if (pendingRestore.current === offset) scrollTo(offset, false);
      });
    },
    [scrollTo],
  );

  const offset = useCallback(() => offsetRef.current, []);

  return useMemo(
    () => ({ listRef, offset, onScroll, onContentSizeChange, scrollToTop, restoreOffset }),
    [offset, onContentSizeChange, onScroll, restoreOffset, scrollToTop],
  );
}
