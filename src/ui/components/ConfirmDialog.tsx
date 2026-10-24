import React from 'react';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { useI18n } from '../../i18n';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  destructive = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      actions={
        <>
          <Button label={cancelLabel ?? t('Cancel')} variant="raised" fill onPress={onClose} />
          <Button label={confirmLabel} variant={destructive ? 'destructive' : 'accent'} fill onPress={onConfirm} />
        </>
      }
    />
  );
}
