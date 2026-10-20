import { useEffect } from 'react';
import { useUpdates } from '../../updates/UpdatesProvider';
import { useSnackbar } from '../snackbar/useSnackbar';
import { useAppActive } from '../useAppActive';
import { useI18n } from '../../i18n';

export function UpdateAnnouncements({ onOpenUpdates }: { onOpenUpdates(): void }) {
  const updates = useUpdates();
  const snackbar = useSnackbar();
  const { t } = useI18n();
  const active = useAppActive();
  useEffect(() => {
    if (!active || !updates.unseen.length) return;
    const first = updates.unseen[0];
    updates.acknowledge(updates.unseen);
    snackbar.show({ text: first.kind === 'firmware' ? t('Compás firmware {version} released', { version: first.version }) : t('Compás Remote {version} available', { version: first.version }),
      actionLabel: t('Updates'), onAction: onOpenUpdates });
  }, [active, updates, snackbar, onOpenUpdates, t]);
  return null;
}
