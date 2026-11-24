import React, { useEffect, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { useI18n } from '../../i18n';
import { AppText } from '../components/AppText';
import { BottomSheet } from '../components/BottomSheet';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { IconButton } from '../components/IconButton';
import { InlineError } from '../components/InlineError';
import { ListRow } from '../components/ListRow';
import { MessageCard } from '../components/MessageCard';
import { SheetStepTitle } from '../components/SheetStepTitle';
import { Spinner } from '../components/Spinner';
import { TextField } from '../components/TextField';
import { Space } from '../tokens';
import { LocalDirectoryHeader } from '../transfer/LocalDirectoryHeader';
import { useLocalDirectoryBrowser } from '../transfer/useLocalDirectoryBrowser';
import { useStorageAccess } from '../useStorageAccess';

export interface LocalDestinationSheetProps {
  visible: boolean;
  initialPath: string;
  onClose: () => void;
  onSave: (folderPath: string) => void;
}

export function LocalDestinationSheet({ visible, initialPath, onClose, onSave }: LocalDestinationSheetProps) {
  return (
    <BottomSheet visible={visible} onClose={onClose} scrollable={false} fullHeight>
      <LocalFolderPicker visible={visible} initialPath={initialPath} onClose={onClose} onSave={onSave} />
    </BottomSheet>
  );
}

function StorageAccessGate({ onRequest, onClose, t }: { onRequest: () => void; onClose: () => void; t: ReturnType<typeof useI18n>['t'] }) {
  return (
    <View style={styles.flex}>
      <SheetStepTitle title={t('Save to folder')} />
      <View style={styles.gate}>
        <MessageCard
          title={t('Allow file access')}
          body={t('Compás needs access to this device’s files to show your music folders. Turn on “Allow access to manage all files”, then come back.')}
          actionLabel={t('Allow access')}
          actionIcon="folder"
          onAction={onRequest}
        />
      </View>
      <View style={styles.actions}>
        <Button variant="plain" label={t('Cancel')} onPress={onClose} />
      </View>
    </View>
  );
}

function LocalFolderPicker({ visible, initialPath, onClose, onSave }: LocalDestinationSheetProps) {
  const { t } = useI18n();
  const storage = useStorageAccess('write');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const browser = useLocalDirectoryBrowser({
    enabled: visible && storage.granted,
    initialPath,
    directoriesOnly: true,
    t,
  });

  useEffect(() => {
    setCreating(false);
    setNewName('');
  }, [visible, storage.granted, initialPath]);

  if (!storage.granted) {
    return <StorageAccessGate onRequest={() => void storage.request()} onClose={onClose} t={t} />;
  }

  const handleSelectRoot = (nextPath: string) => {
    setCreating(false);
    setNewName('');
    browser.selectRoot(nextPath);
  };

  const handleCreateFolder = async () => {
    if (await browser.createFolder(newName)) {
      setCreating(false);
      setNewName('');
    }
  };

  return (
    <View style={styles.flex}>
      <SheetStepTitle title={t('Save to folder')} />
      <LocalDirectoryHeader
        roots={browser.roots}
        root={browser.root}
        displayPath={browser.displayPath}
        parentPath={browser.parentPath}
        loading={browser.loading}
        onSelectRoot={handleSelectRoot}
        onGoUp={(parent) => void browser.loadDirectory(parent)}
        trailing={(
          <>
            {browser.loading ? <Spinner /> : null}
            <IconButton
              icon="plus"
              label={t('New folder')}
              size="sm"
              disabled={!browser.path || browser.loading}
              onPress={() => { setCreating(true); setNewName(''); }}
            />
          </>
        )}
        t={t}
      />
      {creating ? (
        <View style={styles.row}>
          <View style={styles.flex}>
            <TextField value={newName} onChangeText={setNewName} autoFocus autoCapitalize="none" placeholder={t('Folder name')} onSubmitEditing={() => void handleCreateFolder()} />
          </View>
          <Button size="sm" label={t('Create')} disabled={!newName.trim() || browser.loading} onPress={() => void handleCreateFolder()} />
          <Button size="sm" variant="plain" label={t('Cancel')} disabled={browser.loading} onPress={() => setCreating(false)} />
        </View>
      ) : null}
      {browser.error ? <InlineError message={browser.error} style={styles.error} /> : null}
      <FlatList
        data={browser.entries}
        keyExtractor={(entry) => entry.path}
        style={styles.flex}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={!browser.loading ? <AppText variant="caption" tone="inkMuted" style={styles.empty}>{t('No subfolders here.')}</AppText> : null}
        renderItem={({ item }) => (
          <ListRow title={item.name} subtitle={t('Folder')} leading={<Icon name="folder" />} onPress={() => void browser.loadDirectory(item.path)} />
        )}
      />
      <View style={styles.actions}>
        <Button variant="plain" label={t('Cancel')} onPress={onClose} />
        <Button label={t('Save here')} disabled={!browser.path || browser.loading || creating} onPress={() => onSave(browser.path)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gate: { flex: 1, paddingHorizontal: Space.lg, paddingTop: Space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: Space.xs, paddingHorizontal: Space.sm, minHeight: 44 },
  error: { paddingHorizontal: Space.lg },
  empty: { padding: Space.lg },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Space.sm, paddingHorizontal: Space.lg, paddingTop: Space.sm },
});
