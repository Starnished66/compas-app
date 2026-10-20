import React from 'react';
import { Platform, Switch, View } from 'react-native';
import { APP_UPDATE_URL } from '../../updates/releaseUpdates';
import { useUpdates } from '../../updates/UpdatesProvider';
import { usePalette } from '../PaletteProvider';
import { Space } from '../tokens';
import { AppText } from './AppText';
import { Button } from './Button';
import { Card } from './Card';
import { Divider } from './Divider';
import { ListRow } from './ListRow';
import { useI18n } from '../../i18n';

export function UpdatesCard({ playerVersion }: { playerVersion?: string | null }) {
  const updates = useUpdates();
  const palette = usePalette();
  const { t } = useI18n();
  return <Card variant="surface">
    <ListRow title={t('Updates')} trailing={<Button label={t('Check now')} variant="plain" size="sm" busy={updates.checking}
      disabled={updates.checking} onPress={() => { void updates.check(); }} />} />
    <Divider />
    <ListRow title={t('Player firmware')} subtitle={updates.firmware ? t('Latest release: {version}', { version: updates.firmware.version }) : updates.checking ? t('Checking official releases…') : t('No supported stable release found')}
      trailing={updates.firmware ? <Button label={t('Release notes')} variant="plain" size="sm" onPress={() => { void updates.openRelease(updates.firmware!); }} /> : undefined} />
    <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.md }}>
      <AppText variant="caption" tone="inkMuted">{t('Firmware alerts announce releases. Installed firmware versions are not reported yet. Install firmware from the player’s Updates menu.')}</AppText>
    </View>
    <Divider />
    <ListRow title="Compás Remote" subtitle={t('Installed: {version}', { version: updates.appVersion })} trailing={<AppText variant="caption" tone="inkMuted">{t(APP_UPDATE_URL ? 'Check releases' : 'Coming soon')}</AppText>} />
    {playerVersion ? <>
      <ListRow title={t('Player version')} subtitle={t('Reported by the connected player: {version}', { version: playerVersion })} />
      <AppText variant="caption" tone="inkMuted">{t('Player software and firmware updates are separate.')}</AppText>
    </> : null}
    <View style={{ paddingHorizontal: Space.lg, paddingBottom: Space.md }}><AppText variant="caption" tone="inkMuted">{t('The application update source has not been configured yet.')}</AppText></View>
    {Platform.OS === 'android' ? <><Divider /><ListRow title={t('Android update alerts')} subtitle={t('Silent notifications for new releases')} trailing={<Switch accessibilityLabel={t('Android update alerts')} value={updates.alerts}
      trackColor={{ true: palette.accent, false: palette.outline }} onValueChange={(enabled) => { void updates.setAlerts(enabled); }} />} /></> : null}
    <View style={{ padding: Space.lg, paddingTop: Space.sm }}>
      <AppText variant="caption" tone="inkMuted">{updates.error || (updates.checkedAt ? t('Last checked: {date}', { date: new Date(updates.checkedAt).toLocaleString() }) : t('Checks when you open Compás, at most every six hours.'))}</AppText>
      {updates.checkedAt ? <AppText variant="caption" tone="inkMuted">{t('Checks while the app is open, at most every six hours.')}</AppText> : null}
    </View>
  </Card>;
}
