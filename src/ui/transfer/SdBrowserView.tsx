import React, { useEffect, useMemo } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { WifiImportFileEntry } from '../../data/types';
import { useI18n } from '../../i18n';
import { formatBytes, sdBreadcrumb, sdParent } from '../../session/transferPlan';
import { AppText } from '../components/AppText';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { ListRow } from '../components/ListRow';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { HiddenFilesButton } from './HiddenFilesButton';
import { SdBrowser } from './useSdBrowser';

interface Props {
  browser: SdBrowser;
  canBrowse: boolean;
  canMutate: boolean;
  foldersOnly?: boolean;
  selected?: ReadonlyMap<string, WifiImportFileEntry>;
  onToggleSelected?: (entry: WifiImportFileEntry) => void;
  onEntryActions?: (entry: WifiImportFileEntry) => void;
}

export function SdBrowserError({ browser, canBrowse }: Pick<Props, 'browser' | 'canBrowse'>) {
  const { t } = useI18n();
  if (!browser.error) return null;
  return (
    <View style={styles.message}>
      <InlineError message={browser.error} />
      {browser.canRetry && !browser.editing ? (
        <Button size="sm" variant="plain" label={t('Retry')} disabled={!canBrowse || browser.loading}
          onPress={() => void browser.retry()} />
      ) : null}
    </View>
  );
}

export function SdBrowserView({ browser, canBrowse, canMutate, foldersOnly, selected, onToggleSelected, onEntryActions }: Props) {
  const { t } = useI18n();
  const palette = usePalette();
  const parent = sdParent(browser.path);
  const locked = !canBrowse || browser.loading || !!browser.editing;
  const mutationsLocked = locked || !canMutate;
  const entries = useMemo(() => foldersOnly ? browser.entries.filter((entry) => entry.isDirectory) : browser.entries, [browser.entries, foldersOnly]);
  const more = () => { if (!locked && browser.nextOffset !== null) void browser.load(browser.path, true); };
  // A page may contain only files. Continue until folders or the end are reached.
  useEffect(() => {
    if (foldersOnly && canBrowse && !browser.loading && !browser.editing && !browser.error && browser.loaded && entries.length === 0 && browser.nextOffset !== null) {
      void browser.load(browser.path, true);
    }
  }, [foldersOnly, canBrowse, browser.loading, browser.editing, browser.error, browser.loaded, browser.nextOffset, browser.path, browser.load, entries.length]);
  return (
    <View style={styles.flex}>
      <View style={styles.row}>
        <IconButton icon="chevronLeft" label={t('Up')} size="sm" disabled={parent === null || locked} onPress={() => parent !== null && void browser.load(parent)} />
        <AppText variant="bodyStrong" numberOfLines={1} ellipsizeMode="head" style={styles.flex}>
          {sdBreadcrumb(browser.path, t('Player SD card'))}
        </AppText>
        <HiddenFilesButton title={t('Player SD card')} showHidden={browser.showHidden}
          disabled={locked} onPress={() => void browser.toggleHidden()} />
        {browser.loading ? <Spinner /> : null}
        <IconButton icon="plus" label={t('New folder')} size="sm" disabled={mutationsLocked || !browser.loaded} onPress={() => { browser.setEditing({ kind: 'mkdir' }); browser.setEditValue(''); }} />
        <IconButton icon="refresh" label={t('Refresh')} size="sm" disabled={locked} onPress={() => void browser.load(browser.path)} />
      </View>
      {browser.editing ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField value={browser.editValue} onChangeText={browser.setEditValue} autoFocus autoCapitalize="none"
              placeholder={browser.editing.kind === 'mkdir' ? t('Folder name') : t('New name')}
              accessibilityLabel={browser.editing.kind === 'mkdir' ? t('Folder name') : t('New name')}
              onSubmitEditing={() => canBrowse && canMutate && void browser.saveEdit()} />
          </View>
          <Button size="sm" label={browser.editing.kind === 'mkdir' ? t('Create') : t('Save')} disabled={!canBrowse || !canMutate || !browser.editValue.trim() || browser.loading} onPress={() => void browser.saveEdit()} />
          <Button size="sm" variant="plain" label={t('Cancel')} disabled={browser.loading} onPress={() => browser.setEditing(null)} />
        </View>
      ) : null}
      <SdBrowserError browser={browser} canBrowse={canBrowse} />
      <FlatList data={entries} keyExtractor={(entry) => entry.path} style={styles.flex} keyboardShouldPersistTaps="handled"
        onEndReached={foldersOnly && !browser.error ? more : undefined}
        ListEmptyComponent={browser.loaded && !browser.loading && !browser.error && browser.nextOffset === null ? <AppText variant="caption" tone="inkMuted" style={styles.message}>{t('This folder is empty.')}</AppText> : null}
        ListFooterComponent={browser.nextOffset !== null ? <Button size="sm" variant="plain" label={t('Load more')} disabled={locked} onPress={more} /> : null}
        renderItem={({ item }) => {
          const isSelected = !!selected?.has(item.path);
          return (
            <ListRow
              title={item.name}
              accessibilityLabel={item.name}
              subtitle={item.isDirectory ? t('Folder') : formatBytes(item.size)}
              leading={<Icon name={item.isDirectory ? 'folder' : 'file'} color={isSelected ? palette.accent : undefined} />}
              selected={isSelected}
              disabled={locked}
              trailing={(
                <View style={styles.trailing}>
                  {onToggleSelected ? (
                    <IconButton
                      icon={isSelected ? 'check' : 'selectionCircle'}
                      label={isSelected ? t('Deselect {name}', { name: item.name }) : t('Select {name}', { name: item.name })}
                      color={isSelected ? palette.accent : undefined}
                      size="sm"
                      disabled={mutationsLocked}
                      onPress={() => onToggleSelected(item)}
                    />
                  ) : null}
                  {onEntryActions ? (
                    <IconButton
                      icon="moreHorizontal"
                      label={t('More options for {name}', { name: item.name })}
                      size="sm"
                      disabled={mutationsLocked}
                      onPress={() => onEntryActions(item)}
                    />
                  ) : null}
                </View>
              )}
              onPress={item.isDirectory
                ? () => void browser.load(item.path)
                : onToggleSelected && !mutationsLocked ? () => onToggleSelected(item) : undefined}
              onLongPress={onEntryActions && !mutationsLocked ? () => onEntryActions(item) : undefined}
            />
          );
        }} />
    </View>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
  trailing: { flexDirection: 'row', alignItems: 'center' },
  message: { padding: Space.lg },
});
