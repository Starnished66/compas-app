import React, { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { ArtworkThumb } from './ArtworkThumb';
import { IconName } from './iconPaths';

export interface CollectionHeaderProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  meta?: string;
  artworkUri?: string | null;
  artworkSize?: number;
  placeholderIcon?: IconName;
  actions?: ReactNode;
}

const DEFAULT_ARTWORK_SIZE = 140;

export function CollectionHeader({
  eyebrow,
  title,
  subtitle,
  meta,
  artworkUri,
  artworkSize = DEFAULT_ARTWORK_SIZE,
  placeholderIcon = 'disc',
  actions,
}: CollectionHeaderProps) {
  return (
    <View style={styles.container}>
      <View style={styles.identity}>
        <ArtworkThumb uri={artworkUri} size={artworkSize} radius="lg" placeholderIcon={placeholderIcon} />
        <View style={styles.text}>
          <AppText variant="eyebrow" tone="accent">
            {eyebrow}
          </AppText>
          <AppText variant="title" accessibilityRole="header" numberOfLines={2}>
            {title}
          </AppText>
          {subtitle ? (
            <AppText variant="body" tone="inkMuted" numberOfLines={1}>
              {subtitle}
            </AppText>
          ) : null}
          {meta ? (
            <AppText variant="caption" tone="inkMuted" tabular numberOfLines={2}>
              {meta}
            </AppText>
          ) : null}
        </View>
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Space.lg,
    paddingHorizontal: Space.lg,
    paddingBottom: Space.sm,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Space.lg,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: Space.xs,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
  },
});
