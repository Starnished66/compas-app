import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { ColorScheme } from '../theme';
import { Glyph } from './Glyphs';
import { ConnectionStatus } from '../../core/models';

interface HeaderProps {
  colors: ColorScheme;
  connectionStatus: ConnectionStatus;
  onOpenHome: () => void;
  onOpenConnection: () => void;
  onOpenMore: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  colors,
  connectionStatus,
  onOpenHome,
  onOpenConnection,
  onOpenMore,
}) => {
  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return '#8DBB50';
      case 'connecting':
        return '#E5B65B';
      case 'disconnected':
        return '#9CA0A6';
      case 'error':
        return '#E06C62';
    }
  };

  const getStatusLabel = (status: ConnectionStatus) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'connecting':
        return 'Connecting…';
      case 'disconnected':
        return 'Not connected';
      case 'error':
        return 'Failed';
    }
  };

  return (
    <View style={styles.header}>
      {/* Brand title */}
      <TouchableOpacity
        style={styles.titleColumn}
        onPress={onOpenHome}
        accessibilityRole="button"
        accessibilityLabel="Compás Remote Home"
      >
        <Text style={[styles.brandTitle, { color: colors.onSurface }]}>Compás</Text>
        <Text style={[styles.brandSubtitle, { color: colors.onSurfaceVariant }]}>
          Remote Control
        </Text>
      </TouchableOpacity>

      {/* Home button */}
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
        onPress={onOpenHome}
        accessibilityRole="button"
        accessibilityLabel="Home"
      >
        <Glyph name="home" size={20} color={colors.onSurfaceVariant} />
      </TouchableOpacity>

      {/* Status indicator dot */}
      <View style={styles.statusDotWrapper}>
        <View style={[styles.statusDot, { backgroundColor: getStatusColor(connectionStatus) }]} />
      </View>

      {/* Device connection badge */}
      <TouchableOpacity
        style={styles.deviceBadge}
        onPress={onOpenConnection}
        accessibilityRole="button"
        accessibilityLabel={`${getStatusLabel(connectionStatus)} player`}
      >
        <View style={[styles.deviceIconCircle, { backgroundColor: colors.surfaceVariant }]}>
          <Glyph name="device" size={20} color={colors.onSurface} />
        </View>
        <Text
          style={[
            styles.deviceBadgeLabel,
            {
              color:
                connectionStatus === 'connected' ? colors.primary : colors.onSurfaceVariant,
            },
          ]}
          numberOfLines={1}
        >
          {getStatusLabel(connectionStatus)}
        </Text>
      </TouchableOpacity>

      {/* Settings / more button */}
      <TouchableOpacity
        style={[styles.iconButton, { backgroundColor: colors.surfaceVariant }]}
        onPress={onOpenMore}
        accessibilityRole="button"
        accessibilityLabel="More options and settings"
      >
        <Glyph name="settings" size={20} color={colors.onSurfaceVariant} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    height: 60,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  titleColumn: {
    flex: 1,
  },
  brandTitle: {
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  brandSubtitle: {
    fontSize: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 3,
  },
  statusDotWrapper: {
    width: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  deviceBadge: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  deviceBadgeLabel: {
    fontSize: 9,
    fontWeight: '500',
  },
});
