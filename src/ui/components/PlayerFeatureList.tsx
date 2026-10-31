import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Durations, Easings } from '../motion';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { useReducedMotion } from '../useReducedMotion';
import { AppText } from './AppText';
import { Collapsible } from './Collapsible';
import { Icon } from './Icon';
import { ListRow } from './ListRow';
import { useI18n } from '../../i18n';

export interface PlayerFeatureListProps {
  supportedFeatures: string[];
}

const FEATURE_LABELS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'catalog_sync_v1', label: 'Fast library sync' },
  { id: 'folder_browse', label: 'Browse folders' },
  { id: 'recently_played', label: 'Recently played' },
  { id: 'favorites_edit', label: 'Favorites' },
  { id: 'queue_edit', label: 'Edit the queue' },
  { id: 'playlist_edit', label: 'Edit playlists' },
  { id: 'playlist_import', label: 'Import playlist files' },
  { id: 'player_accent', label: 'Player accent color' },
  { id: 'device_info', label: 'Device information' },
  { id: 'plugin_store', label: 'Plugin store' },
  { id: 'plugin_management', label: 'Plugin management' },
  { id: 'player_layouts', label: 'Player layouts' },
];

const FEATURE_ICON_SIZE = 16;
const CHEVRON_SIZE = 18;

function useChevronRotation(expanded: boolean) {
  const reducedMotion = useReducedMotion();
  const turn = useRef(new Animated.Value(expanded ? 1 : 0)).current;

  useEffect(() => {
    const toValue = expanded ? 1 : 0;
    if (reducedMotion) {
      turn.setValue(toValue);
      return;
    }
    const animation = Animated.timing(turn, {
      toValue,
      duration: Durations.chevron,
      easing: Easings.overshoot,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, reducedMotion, turn]);

  return turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] });
}

export function PlayerFeatureList({ supportedFeatures }: PlayerFeatureListProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const [expanded, setExpanded] = useState(false);
  const rotate = useChevronRotation(expanded);

  return (
    <View>
      <ListRow
        variant="action"
        title={t('What this player supports')}
        onPress={() => setExpanded((open) => !open)}
        accessibilityLabel={t('What this player supports, {state}', { state: t(expanded ? 'expanded' : 'collapsed') })}
        trailing={
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Icon name="chevronRight" size={CHEVRON_SIZE} />
          </Animated.View>
        }
      />
      <Collapsible open={expanded}>
        <View style={styles.list}>
          {FEATURE_LABELS.map(({ id, label }) => {
            const supported = supportedFeatures.includes(id);
            return (
              <View
                key={id}
                accessible
                accessibilityLabel={t('{feature}, {state}', { feature: t(label), state: t(supported ? 'supported' : 'not supported') })}
                style={styles.feature}
              >
                <Icon
                  name={supported ? 'check' : 'minus'}
                  size={FEATURE_ICON_SIZE}
                  color={supported ? palette.statusOk : palette.statusIdle}
                />
                <AppText variant="caption" style={styles.label}>
                  {t(label)}
                </AppText>
                <AppText variant="caption" tone="inkMuted">
                  {t(supported ? 'Supported' : 'Not supported')}
                </AppText>
              </View>
            );
          })}
        </View>
      </Collapsible>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Space.lg,
    paddingBottom: Space.md,
    gap: Space.sm,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
  },
  label: {
    flex: 1,
  },
});
