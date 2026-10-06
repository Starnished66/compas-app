import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../theme';
import { Glyph } from './Glyphs';

interface BottomNavBarProps {
  colors: ColorScheme;
  currentScreen: 'home' | 'library' | 'queue' | 'connection';
  onSelectHome: () => void;
  onSelectLibrary: () => void;
  onSelectDevice: () => void;
  onSelectMore: () => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({
  colors,
  currentScreen,
  onSelectHome,
  onSelectLibrary,
  onSelectDevice,
  onSelectMore,
}) => {
  const isHome = currentScreen === 'home';
  const isLibrary = currentScreen === 'library' || currentScreen === 'queue';
  const isDevice = currentScreen === 'connection';

  const items = [
    { label: 'Now Playing', icon: 'music', active: isHome, onPress: onSelectHome },
    { label: 'Library', icon: 'library', active: isLibrary, onPress: onSelectLibrary },
    { label: 'Device', icon: 'device', active: isDevice, onPress: onSelectDevice },
    { label: 'More', icon: 'more', active: false, onPress: onSelectMore },
  ];

  return (
    <View style={[styles.bar, { backgroundColor: colors.surface }]}>
      {items.map((item, idx) => (
        <TouchableOpacity
          key={idx}
          style={[
            styles.tabItem,
            item.active && { backgroundColor: `${colors.primary}1F` },
          ]}
          onPress={item.onPress}
          accessibilityRole="tab"
          accessibilityState={{ selected: item.active }}
          accessibilityLabel={item.label}
        >
          <Glyph
            name={item.icon}
            size={21}
            color={item.active ? colors.primary : colors.onSurfaceVariant}
          />
          <Text
            style={[
              styles.tabLabel,
              { color: item.active ? colors.primary : colors.onSurfaceVariant },
            ]}
            numberOfLines={1}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    height: 60,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  tabItem: {
    flex: 1,
    height: 50,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 3,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 3,
  },
});
