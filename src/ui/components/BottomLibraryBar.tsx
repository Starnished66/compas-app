import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { RemoteScreen, LibraryCategory } from '../../data/types';
import { ColorScheme } from '../theme';
import { Glyph } from './Glyph';
import { FrostedLayer } from './CardSurface';

export interface BottomLibraryBarProps {
  screen: RemoteScreen;
  colors: ColorScheme;
  onHomeSelected: () => void;
  onOpenLibrary: (category: LibraryCategory) => void;
  onOpenConnection: () => void;
  onOpenMore: () => void;
}

export const BottomLibraryBar: React.FC<BottomLibraryBarProps> = ({
  screen,
  colors,
  onHomeSelected,
  onOpenLibrary,
  onOpenConnection,
  onOpenMore,
}) => {
  const isHome = screen.type === 'Home';
  const isLibrary = screen.type === 'Library' || screen.type === 'Queue';
  const isDevice = screen.type === 'Connection';

  const items = [
    { label: 'Now Playing', icon: 'music', active: isHome, onPress: onHomeSelected },
    {
      label: 'Library',
      icon: 'library',
      active: isLibrary,
      onPress: () => onOpenLibrary(LibraryCategory.Artists),
    },
    { label: 'Device', icon: 'device', active: isDevice, onPress: onOpenConnection },
    { label: 'More', icon: 'more', active: false, onPress: onOpenMore },
  ];

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: 'transparent',
          borderTopColor: colors.outline,
        },
      ]}
    >
      <FrostedLayer colors={colors} />
      {items.map((item, index) => {
        const tint = item.active ? colors.primary : colors.onSurfaceVariant;
        return (
          <TouchableOpacity
            key={index}
            style={[
              styles.item,
              item.active && { backgroundColor: `${colors.primary}22` }, // ~12% alpha
            ]}
            onPress={item.onPress}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <Glyph name={item.icon} size={20} tint={tint} />
            <Text
              style={[
                styles.label,
                {
                  color: tint,
                  fontWeight: item.active ? '600' : '500',
                },
              ]}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    paddingTop: 6,
    paddingBottom: 16,
  },
  item: {
    flex: 1,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  label: {
    fontSize: 10,
    marginTop: 3,
  },
});
