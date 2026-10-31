import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ConnectionStatus, RemoteUiState } from '../../data/types';
import { PluginsApi } from '../../data/PluginsApi';
import { StorePlugin } from '../../core/pluginModels';
import { useI18n } from '../../i18n';
import { usePlayerPlugins } from '../../session/usePlayerPlugins';
import { usePalette } from '../PaletteProvider';
import { AppText } from '../components/AppText';
import { PluginPreview } from '../components/PluginPreview';
import { Button } from '../components/Button';
import { Card } from '../components/Card';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Icon } from '../components/Icon';
import { ListRow } from '../components/ListRow';
import { MessageCard } from '../components/MessageCard';
import { ScreenTitleBar } from '../components/ScreenTitleBar';
import { SegmentedControl } from '../components/SegmentedControl';
import { Spinner } from '../components/Spinner';
import { Space } from '../tokens';
import { useBackInterceptor } from '../useBackInterceptor';
import { useScreenInsets } from '../useScreenInsets';
import { getStoreDetailActions, resolveCurrentStorePlugin } from '../../session/storePluginDetail';

type Tab = 'store' | 'installed' | 'layouts';
type ConfirmationAction = 'install' | 'update' | 'uninstall';
type Confirmation = { plugin: StorePlugin; action: ConfirmationAction } | null;

export interface PlayerPluginsScreenProps {
  state: RemoteUiState;
  pluginsApi: PluginsApi | null;
  onClose: () => void;
  active: boolean;
}

export function PlayerPluginsScreen({ state, pluginsApi, onClose, active }: PlayerPluginsScreenProps) {
  const { t } = useI18n();
  const palette = usePalette();
  const insets = useScreenInsets();
  const features = state.supportedFeatures;
  const hasStore = features.includes('plugin_store');
  const hasManagement = features.includes('plugin_management');
  const hasLayouts = features.includes('player_layouts');
  const plugins = usePlayerPlugins(pluginsApi, features, active);
  const tabs = useMemo(() => [
    ...(hasStore ? [{ value: 'store' as const, label: t('Store') }] : []),
    ...(hasManagement ? [{ value: 'installed' as const, label: t('Installed') }] : []),
    ...(hasLayouts ? [{ value: 'layouts' as const, label: t('Layouts') }] : []),
  ], [hasLayouts, hasManagement, hasStore, t]);
  const [tab, setTab] = useState<Tab>(tabs[0]?.value ?? 'store');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const catalog = plugins.store?.plugins ?? [];
  const detail = useMemo(() => resolveCurrentStorePlugin(catalog, detailId), [catalog, detailId]);
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const busy = plugins.busy || plugins.loading || plugins.storeBusy || plugins.refreshPending || plugins.statusUnknown;

  useBackInterceptor(active, () => {
    if (confirmation) { setConfirmation(null); return true; }
    if (detailId) { setDetailId(null); return true; }
    onClose(); return true;
  });
  useEffect(() => { if (state.connectionStatus !== ConnectionStatus.Connected) onClose(); }, [state.connectionStatus, onClose]);
  useEffect(() => { if (!tabs.some((item) => item.value === tab)) setTab(tabs[0]?.value ?? 'store'); }, [tab, tabs]);
  useEffect(() => {
    if (detailId && plugins.store && !plugins.loading && !plugins.store.plugins.some((item) => item.id === detailId)) setDetailId(null);
  }, [detailId, plugins.loading, plugins.store]);

  const confirmPlugin = (plugin: StorePlugin, action: ConfirmationAction) => {
    if (!plugin || !action) return;
    setConfirmation({ plugin, action });
  };
  const install = (plugin: StorePlugin) => {
    if (plugin.needs_confirmation) confirmPlugin(plugin, 'install');
    else void plugins.mutate(() => pluginsApi!.install(plugin.id, false));
  };
  const update = (plugin: StorePlugin) => {
    if (plugin.needs_confirmation) confirmPlugin(plugin, 'update');
    else void plugins.mutate(() => pluginsApi!.update(plugin.id, false));
  };
  const uninstall = (plugin: StorePlugin) => confirmPlugin(plugin, 'uninstall');
  const acceptConfirmation = () => {
    if (!confirmation) return;
    const pending = confirmation;
    setConfirmation(null);
    void plugins.mutate(() => pending.action === 'install'
      ? pluginsApi!.install(pending.plugin.id, true)
      : pending.action === 'update'
        ? pluginsApi!.update(pending.plugin.id, true)
        : pluginsApi!.uninstall(pending.plugin.id));
  };

  const categories = [...new Set(catalog.map((item) => item.category).filter(Boolean))].sort();
  const filtered = catalog.filter((plugin) =>
    (!category || plugin.category === category) &&
    `${plugin.name} ${plugin.id} ${plugin.description} ${plugin.author}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  const reviewNeeded = catalog.filter((item) => item.needs_confirmation);

  return <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <ScreenTitleBar title={detail ? detail.name : t('Plugins')} onBack={detail ? () => setDetailId(null) : onClose} />
    {tabs.length > 1 ? <SegmentedControl options={tabs} value={tab} onChange={(next) => { setTab(next); setDetailId(null); }} style={styles.tabs} /> : null}
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {!pluginsApi ? <MessageCard variant="surface" title={t('Plugins are unavailable')} body={t('Connect to a player that supports plugins.')} /> : null}
      {plugins.error ? <MessageCard
        variant="surface"
        title={plugins.statusUnknown ? t('Action status unknown') : t('Couldn’t load plugins')}
        body={plugins.statusUnknown ? `${plugins.error} · ${t('Check plugin status before trying the action again.')}` : plugins.error}
        actionLabel={plugins.statusUnknown ? t('Check status') : t('Try again')}
        actionBusy={plugins.loading}
        onAction={() => void plugins.statusCheck()}
      /> : null}

      {!detail && tab === 'store' && hasStore ? <>
        <View style={styles.row}>
          <Button label={t('Refresh store')} icon="refresh" variant="raised" disabled={busy} busy={plugins.store?.state === 'refreshing'} onPress={() => void plugins.mutate(() => pluginsApi!.refreshStore())} />
          <Button label={t('Update all')} icon="refresh" variant="container" disabled={busy || !catalog.some((item) => item.state === 'update')} busy={plugins.store?.state === 'updating_all'} onPress={() => void plugins.mutate(() => pluginsApi!.updateAll())} />
        </View>
        <TextInput value={query} onChangeText={setQuery} placeholder={t('Search plugins')} placeholderTextColor={palette.inkMuted} style={[styles.search, { backgroundColor: palette.surfaceRaised, color: palette.ink }]} accessibilityLabel={t('Search plugins')} />
        {categories.length ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Button label={t('All categories')} size="sm" variant={category ? 'raised' : 'container'} onPress={() => setCategory('')} />
          {categories.map((item) => <Button key={item} label={item} size="sm" variant={category === item ? 'container' : 'raised'} onPress={() => setCategory(item)} />)}
        </ScrollView> : null}
        {plugins.store?.state === 'failed' ? <MessageCard variant="surface" title={t('Plugin action failed')} body={t('The plugin operation failed. Check the player status before trying again.')} actionLabel={t('Check status')} actionBusy={plugins.loading} onAction={() => void plugins.statusCheck()} /> : null}
        {plugins.store && ['refreshing', 'installing', 'updating', 'updating_all', 'uninstalling'].includes(plugins.store.state) ? <AppText variant="caption" tone="inkMuted">{t('Working…')} {plugins.store.percent}% {plugins.store.current_plugin}</AppText> : null}
        {plugins.store && plugins.store.total > catalog.length ? <AppText variant="caption" tone="inkMuted">{t('Showing the first {count} store plugins.', { count: catalog.length })}</AppText> : null}
        {plugins.store?.refresh_required ? <MessageCard variant="surface" title={t('Player refresh required')} body={t('Plugin files changed. Refresh plugins on the player to apply the changes.')}
          actionLabel={t('Refresh plugins')} actionBusy={plugins.busy} onAction={() => void plugins.mutate(() => pluginsApi!.refreshPlugins())} /> : null}
        {plugins.store?.confirmation_required || plugins.store?.state === 'needs_confirm' ? <MessageCard variant="surface" title={t('Confirmation required')} body={t('The player needs confirmation before this plugin action can continue.')} /> : null}
        {reviewNeeded.length ? <MessageCard variant="surface" title={t('Review file replacement')} body={t('{count} plugins need your confirmation before their files can be replaced.', { count: reviewNeeded.length })} /> : null}
        {plugins.loading && !plugins.store ? <View style={styles.center}><Spinner /><AppText variant="body" tone="inkMuted">{t('Loading plugins…')}</AppText></View> : null}
        {plugins.store && !filtered.length ? <AppText variant="body" tone="inkMuted">{catalog.length ? t('No plugins match your search.') : t('No plugins found.')}</AppText> : null}
        {filtered.map((plugin) => <PluginCard key={plugin.id} plugin={plugin} onOpen={() => setDetailId(plugin.id)} onInstall={() => install(plugin)} onUpdate={() => update(plugin)} onUninstall={() => uninstall(plugin)} disabled={busy || plugin.incompatible} t={t} />)}
      </> : null}

      {detail && tab === 'store' ? <PluginDetails plugin={detail} onInstall={() => install(detail)} onUpdate={() => update(detail)} onUninstall={() => uninstall(detail)} disabled={busy || detail.incompatible} api={pluginsApi} active={active} /> : null}

      {!detail && tab === 'installed' && hasManagement ? <>
        {plugins.refreshPending ? <MessageCard variant="surface" title={t('Player refresh required')} body={t('Plugin changes are waiting for a player refresh.')} /> : null}
        {plugins.loading && !plugins.installed ? <View style={styles.center}><Spinner /></View> : null}
        {plugins.installed?.plugins.map((plugin) => <InstalledCard key={plugin.id} plugin={plugin} onToggle={(enabled) => void plugins.mutate(() => pluginsApi!.setEnabled(plugin.id, enabled))} onOpenSettings={() => void plugins.mutate(() => pluginsApi!.openSettings(plugin.id))} disabled={busy} t={t} />)}
        {plugins.installed && !plugins.installed.plugins.length ? <AppText variant="body" tone="inkMuted">{t('No installed plugins.')}</AppText> : null}
        {plugins.installed?.truncated ? <AppText variant="caption" tone="inkMuted">{t('The player only returned the first {count} installed plugins.', { count: plugins.installed.plugins.length })}</AppText> : null}
      </> : null}

      {!detail && tab === 'layouts' && hasLayouts ? <>
        <AppText variant="body" tone="inkMuted">{t('Choose a layout for the player display.')}</AppText>
        {plugins.loading && !plugins.layouts ? <View style={styles.center}><Spinner /></View> : null}
        {plugins.layouts?.layouts.map((layout, index) => <LayoutCard key={layout.id} layout={layout} selected={plugins.layouts!.current === layout.id} onSelect={() => void plugins.mutate(() => pluginsApi!.selectLayout(layout.id))} disabled={busy} t={t} api={pluginsApi} screenActive={active && tab === 'layouts'} autoPreview={index < 12} />)}
        {plugins.layouts && !plugins.layouts.layouts.length ? <AppText variant="body" tone="inkMuted">{t('No layouts found.')}</AppText> : null}
        {plugins.layouts && plugins.layouts.total > plugins.layouts.layouts.length ? <AppText variant="caption" tone="inkMuted">{t('Showing the first {count} layouts.', { count: plugins.layouts.layouts.length })}</AppText> : null}
      </> : null}
    </ScrollView>
    <ConfirmDialog
      visible={confirmation != null}
      title={confirmation?.action === 'uninstall' ? t('Uninstall plugin?') : t('Replace plugin files?')}
      message={confirmation?.action === 'uninstall'
        ? t('Uninstall {name} from the player?', { name: confirmation.plugin.name })
        : t('Installing or updating this plugin may replace files on the player. Continue only if you trust this plugin.')}
      confirmLabel={confirmation?.action === 'uninstall' ? t('Uninstall') : t('Continue')}
      destructive
      onClose={() => setConfirmation(null)}
      onConfirm={acceptConfirmation}
    />
  </View>;
}

function PluginCard({ plugin, onOpen, onInstall, onUpdate, onUninstall, disabled, t }: { plugin: StorePlugin; onOpen: () => void; onInstall: () => void; onUpdate: () => void; onUninstall: () => void; disabled: boolean; t: (key: string, params?: Record<string, string | number>) => string }) {
  return <Card variant="surface" style={styles.card}>
    <ListRow title={plugin.name} subtitle={`${plugin.version} · ${plugin.author || t('Unknown author')}`} trailing={<Icon name="chevronRight" />} onPress={onOpen} />
    <AppText variant="caption" tone="inkMuted">{plugin.description}</AppText>
    <AppText variant="micro" tone="inkMuted">{plugin.category}{plugin.player_layout ? ` · ${t('Player layout')}` : ''}{plugin.theme_pack ? ` · ${t('Theme pack')}` : ''}{plugin.incompatible ? ` · ${t('Incompatible')}` : ''}</AppText>
    {plugin.needs_confirmation ? <Button label={t('Review file replacement')} variant="raised" onPress={plugin.state === 'update' ? onUpdate : onInstall} disabled={disabled} /> : null}
    {!plugin.needs_confirmation && ['available', 'manual'].includes(plugin.state) ? <Button label={t('Install')} onPress={onInstall} disabled={disabled} /> : null}
    {!plugin.needs_confirmation && plugin.state === 'update' ? <Button label={t('Update')} onPress={onUpdate} disabled={disabled} /> : null}
    {['installed', 'update', 'removed'].includes(plugin.state) ? <Button label={t('Uninstall')} variant="destructive" onPress={onUninstall} disabled={disabled} /> : null}
  </Card>;
}

function PluginDetails({ plugin, onInstall, onUpdate, onUninstall, disabled, api, active }: { plugin: StorePlugin; onInstall: () => void; onUpdate: () => void; onUninstall: () => void; disabled: boolean; api: PluginsApi | null; active: boolean }) {
  const { t } = useI18n();
  const actions = getStoreDetailActions(plugin);
  return <Card variant="surface" style={styles.card}>
    <PluginPreview api={api} kind="store" id={plugin.id} active={active} />
    <AppText variant="body">{plugin.description}</AppText>
    <AppText variant="caption" tone="inkMuted">{t('Category')}: {plugin.category}</AppText>
    <AppText variant="caption" tone="inkMuted">{t('Author')}: {plugin.author || t('Unknown author')}</AppText>
    <AppText variant="caption" tone="inkMuted">{t('Version')}: {plugin.version}</AppText>
    <AppText variant="caption" tone="inkMuted">{t('Size')}: {formatSize(plugin.size)}</AppText>
    {actions.primary === 'review-install' || actions.primary === 'review-update' ? <Button label={t('Review file replacement')} variant="raised" onPress={actions.primary === 'review-update' ? onUpdate : onInstall} disabled={disabled} /> : null}
    {actions.primary === 'install' ? <Button label={t('Install')} onPress={onInstall} disabled={disabled} /> : null}
    {actions.primary === 'update' ? <Button label={t('Update')} onPress={onUpdate} disabled={disabled} /> : null}
    {actions.canUninstall ? <Button label={t('Uninstall')} variant="destructive" onPress={onUninstall} disabled={disabled} /> : null}
  </Card>;
}

function InstalledCard({ plugin, onToggle, onOpenSettings, disabled, t }: { plugin: { id: string; name: string; enabled: boolean; loaded: boolean; error: string | null; player_layout: boolean; theme_package: boolean; can_open_settings?: boolean }; onToggle: (enabled: boolean) => void; onOpenSettings: () => void; disabled: boolean; t: (key: string) => string }) {
  return <Card variant="surface" style={styles.card}>
    <ListRow title={plugin.name} subtitle={`${plugin.enabled ? t('Enabled') : t('Disabled')} · ${plugin.loaded ? t('Loaded') : t('Not loaded')}`} />
    {plugin.error ? <AppText variant="caption" tone="statusError">{plugin.error === 'load_limit_reached' ? t('Plugin load limit reached.') : t('This plugin could not be loaded.')}</AppText> : null}
    <View style={styles.row}>
      <Button label={plugin.enabled ? t('Disable') : t('Enable')} variant="raised" disabled={disabled} onPress={() => onToggle(!plugin.enabled)} />
      {plugin.can_open_settings ? <Button label={t('Open on player')} variant="container" disabled={disabled} onPress={onOpenSettings} /> : null}
    </View>
  </Card>;
}

function LayoutCard({ layout, selected, onSelect, disabled, t, api, screenActive, autoPreview }: { layout: { id: string; name: string; source: string; has_preview: boolean }; selected: boolean; onSelect: () => void; disabled: boolean; t: (key: string) => string; api: PluginsApi | null; screenActive: boolean; autoPreview: boolean }) {
  const [previewOpen, setPreviewOpen] = useState(autoPreview);
  useEffect(() => { if (autoPreview) setPreviewOpen(true); }, [autoPreview]);
  return <Card variant="surface" style={styles.card}>
    {previewOpen ? <PluginPreview api={api} kind="layout" id={layout.id} hasPreview={layout.has_preview} active={screenActive} /> : null}
    {layout.has_preview && !previewOpen ? <Button label={t('Preview')} variant="raised" onPress={() => setPreviewOpen(true)} /> : null}
    <ListRow title={layout.name} subtitle={layout.source === 'builtin_c' ? t('Built in') : layout.source === 'exported_c' ? t('Exported') : t('Plugin layout')} trailing={selected ? <AppText variant="caption" tone="accent">{t('Current')}</AppText> : null} />
    {!selected ? <Button label={t('Use layout')} onPress={onSelect} disabled={disabled} /> : null}
  </Card>;
}

function formatSize(size: number) { return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(size / 1024)} KB`; }

const styles = StyleSheet.create({
  root: { flex: 1 }, content: { paddingHorizontal: Space.lg, paddingVertical: Space.md, gap: Space.md }, tabs: { marginHorizontal: Space.lg, marginBottom: Space.sm },
  card: { padding: Space.md, gap: Space.sm }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.sm },
  center: { alignItems: 'center', gap: Space.md, paddingVertical: Space.xl }, search: { borderRadius: 12, paddingHorizontal: Space.md, paddingVertical: Space.sm },
  preview: { minHeight: 96, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
});
