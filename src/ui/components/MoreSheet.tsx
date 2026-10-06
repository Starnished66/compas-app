import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from 'react-native';
import { ColorScheme } from '../theme';
import { RemoteTheme, LibraryCategory, ConnectionStatus } from '../../data/types';
import { Glyph } from './Glyph';

export interface MoreSheetProps {
  visible: boolean;
  theme: RemoteTheme;
  connectionStatus: ConnectionStatus;
  playerName: string;
  colors: ColorScheme;
  onClose: () => void;
  onToggleTheme: () => void;
  onSelectCategory: (category: LibraryCategory) => void;
  onDisconnect: () => void;
  onChangePin: () => void;
}

export const MoreSheet: React.FC<MoreSheetProps> = ({
  visible,
  theme,
  connectionStatus,
  playerName,
  colors,
  onClose,
  onToggleTheme,
  onSelectCategory,
  onDisconnect,
  onChangePin,
}) => {
  const isDark = theme === RemoteTheme.Dark;
  const isConnected = connectionStatus === ConnectionStatus.Connected;

  const categories = [
    { label: 'Albums', cat: LibraryCategory.Albums, icon: 'disc' },
    { label: 'Artists', cat: LibraryCategory.Artists, icon: 'person' },
    { label: 'Tracks', cat: LibraryCategory.Songs, icon: 'music' },
    { label: 'Playlists', cat: LibraryCategory.Playlists, icon: 'list' },
    { label: 'Genres', cat: LibraryCategory.Genres, icon: 'filter' },
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.surface,
              borderColor: colors.outline,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          <View style={[styles.dragHandle, { backgroundColor: colors.outline }]} />

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.onSurface }]}>
              Compás Remote
            </Text>
            <Text style={[styles.subtitle, { color: colors.onSurfaceVariant }]}>
              {isConnected ? `Connected to ${playerName}` : 'Not connected'}
            </Text>
          </View>

          {/* Theme Row */}
          <TouchableOpacity
            style={[styles.row, { borderBottomColor: colors.outline }]}
            onPress={onToggleTheme}
          >
            <View style={styles.rowLeft}>
              <Glyph
                name={isDark ? 'sun' : 'moon'}
                size={22}
                tint={colors.onSurface}
              />
              <Text style={[styles.rowLabel, { color: colors.onSurface }]}>
                {isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
              </Text>
            </View>
            <Glyph name="check" size={18} tint={colors.primary} />
          </TouchableOpacity>

          {/* Library categories shortcuts */}
          <Text style={[styles.sectionTitle, { color: colors.onSurfaceVariant }]}>
            Library Categories
          </Text>
          <View style={styles.categoryGrid}>
            {categories.map((item) => (
              <TouchableOpacity
                key={item.cat}
                style={[
                  styles.categoryChip,
                  {
                    backgroundColor: colors.surfaceVariant,
                    borderColor: colors.outline,
                  },
                ]}
                onPress={() => {
                  onClose();
                  onSelectCategory(item.cat);
                }}
              >
                <Glyph name={item.icon} size={16} tint={colors.onSurface} />
                <Text style={[styles.chipText, { color: colors.onSurface }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Connection Actions */}
          {isConnected && (
            <View style={styles.actions}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: colors.surfaceVariant },
                ]}
                onPress={() => {
                  onClose();
                  onChangePin();
                }}
              >
                <Glyph name="settings" size={18} tint={colors.onSurface} />
                <Text style={[styles.actionText, { color: colors.onSurface }]}>
                  Change PIN
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionButton,
                  { backgroundColor: '#E06C6222' },
                ]}
                onPress={() => {
                  onClose();
                  onDisconnect();
                }}
              >
                <Text style={[styles.actionText, { color: '#E06C62', fontWeight: '600' }]}>
                  Disconnect
                </Text>
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.footer}>
            <Text style={[styles.versionText, { color: colors.onSurfaceVariant }]}>
              Compás Remote v1.0.0
            </Text>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 36,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rowLabel: {
    fontSize: 15,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 18,
    marginBottom: 10,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  actions: {
    marginTop: 20,
    gap: 10,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 12,
    borderRadius: 14,
  },
  actionText: {
    fontSize: 15,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  versionText: {
    fontSize: 12,
  },
});
