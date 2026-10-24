import React from 'react';
import { usePlaylistNameInput } from '../usePlaylistNameInput';
import { Button } from './Button';
import { Dialog } from './Dialog';
import { PlaylistNameField } from './PlaylistNameField';
import { useI18n } from '../../i18n';

export interface PlaylistNameDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  initialName?: string;
  confirmLabel: string;
  takenNames?: readonly string[];
  onSubmit: (name: string) => void;
  onClose: () => void;
}

export function PlaylistNameDialog({
  visible,
  title,
  message,
  initialName = '',
  confirmLabel,
  takenNames,
  onSubmit,
  onClose,
}: PlaylistNameDialogProps) {
  const { t } = useI18n();
  const { name, setName, issue, canSubmit } = usePlaylistNameInput(visible, initialName, takenNames);

  const submit = () => {
    if (canSubmit) onSubmit(name);
  };

  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={title}
      message={message}
      actions={
        <>
          <Button label={t('Cancel')} variant="raised" fill onPress={onClose} />
          <Button label={confirmLabel} fill disabled={!canSubmit} onPress={submit} />
        </>
      }
    >
      <PlaylistNameField value={name} issue={issue} onChangeText={setName} onSubmit={submit} />
    </Dialog>
  );
}
