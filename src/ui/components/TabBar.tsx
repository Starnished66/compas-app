import React, { useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { useTabBarDrag } from '../chrome/useTabBarDrag';
import { useTabBarMotion } from '../chrome/useTabBarMotion';
import { usePalette } from '../PaletteProvider';
import { Radius, Size, Space } from '../tokens';
import { MinimizedTabBarWidth } from './bottomChromeLayout';
import { FrostFill } from './FrostFill';
import { IconName } from './iconPaths';
import { TabBarItem } from './TabBarItem';
import { TabPill } from './TabPill';
import { useI18n } from '../../i18n';

export type TabKey = 'library' | 'home' | 'playlists' | 'transfer';

export interface TabBarProps {
  active: TabKey | null;
  onSelect: (tab: TabKey) => void;
  minimized?: boolean;
  onExpand?: () => void;
  style?: StyleProp<ViewStyle>;
}

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'library', label: 'Library', icon: 'library' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'playlists', label: 'Playlists', icon: 'playlist' },
  { key: 'transfer', label: 'Transfer', icon: 'import' },
];

const BAR_PADDING = Space.xs;
const BAR_BORDER = 1;
const MINIMIZED_ROW_WIDTH = MinimizedTabBarWidth - 2 * (BAR_PADDING + BAR_BORDER);

export function TabBar({ active, onSelect, minimized = false, onExpand, style }: TabBarProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const rowRef = useRef<View>(null);
  const measuredWidth = useRef(0);
  const [rowWidth, setRowWidth] = useState(0);
  const activeIndex = TABS.findIndex((tab) => tab.key === active);
  const minimizedRef = useRef(minimized);
  minimizedRef.current = minimized;
  const collapsing = useRef(false);

  const acceptMeasuredWidth = () => {
    collapsing.current = false;
    if (!minimizedRef.current && measuredWidth.current > 0) setRowWidth(measuredWidth.current);
  };
  const motion = useTabBarMotion(activeIndex, minimized, acceptMeasuredWidth);
  const wasMinimized = useRef(minimized);
  if (wasMinimized.current !== minimized) {
    wasMinimized.current = minimized;
    collapsing.current = true;
  }

  const tabWidth = rowWidth / TABS.length;
  const drag = useTabBarDrag({
    rowRef,
    tabCount: TABS.length,
    tabWidth,
    enabled: !minimized,
    motion,
    onDrop: (index) => {
      if (index !== activeIndex) onSelect(TABS[index].key);
    },
  });

  const onRowLayout = (event: LayoutChangeEvent) => {
    measuredWidth.current = event.nativeEvent.layout.width;
    drag.measureRow();
    if (!minimizedRef.current && !collapsing.current) setRowWidth(measuredWidth.current);
  };

  const pressTab = (tab: TabKey) => {
    if (minimized) onExpand?.();
    else onSelect(tab);
  };

  return (
    <View
      {...drag.panHandlers}
      accessibilityRole="tablist"
      style={[styles.bar, { borderColor: palette.outline }, style]}
    >
      <FrostFill radius={Radius.lg - BAR_BORDER} />
      <View ref={rowRef} style={styles.row} onLayout={onRowLayout}>
        {rowWidth > 0 ? <TabPill motion={motion} tabWidth={tabWidth} minimizedWidth={MINIMIZED_ROW_WIDTH} /> : null}
        {TABS.map((tab) => {
          const selected = tab.key === active;
          return (
            <TabBarItem
              key={tab.key}
              label={t(tab.label)}
              icon={tab.icon}
              selected={selected}
              hidden={minimized && !selected}
              collapse={motion.collapse}
              othersOpacity={motion.othersOpacity}
              onPress={() => pressTab(tab.key)}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    height: Size.bar,
    padding: BAR_PADDING,
    borderWidth: BAR_BORDER,
    borderRadius: Radius.lg,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
});
