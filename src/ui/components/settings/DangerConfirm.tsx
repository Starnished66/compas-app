import React from 'react';
import { useI18n } from '../../../i18n';
import { ConfirmDialog } from '../ConfirmDialog';

export interface DangerConfirmProps {
  /** The loud value waiting for confirmation, or null when no dialog is needed. */
  pending: { level: number; value: number } | null;
  onConfirm: () => void;
  onClose: () => void;
}

/** Asks before raising Max Volume past the player's loud-volume warning level. */
export function DangerConfirm({ pending, onConfirm, onClose }: DangerConfirmProps) {
  const { t } = useI18n();
  return (
    <ConfirmDialog
      visible={pending != null}
      title={t('Raise the maximum volume?')}
      message={t('Above {level}% the player shows its loud-volume warning. Set the maximum to {value}%?', { level: pending?.level ?? 0, value: pending?.value ?? 0 })}
      confirmLabel={t('Set to {value}%', { value: pending?.value ?? 0 })}
      destructive
      onConfirm={onConfirm}
      onClose={onClose}
    />
  );
}
