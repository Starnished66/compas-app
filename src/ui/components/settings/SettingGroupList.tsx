import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SettingDescriptor, SettingsSchema, SettingValue, SettingValues } from '../../../core/settingsModels';
import { useI18n } from '../../../i18n';
import { Button } from '../Button';
import { Card } from '../Card';
import { Divider } from '../Divider';
import { Icon } from '../Icon';
import { ListRow } from '../ListRow';
import { SectionHeader } from '../SectionHeader';
import { Space } from '../../tokens';
import { SettingControl } from './SettingControl';
import { groupIcon, groupSummary, localizedLabel, visibleGroups, visibleSettings } from './settingsPresentation';

export interface SettingGroupListProps {
  schema: SettingsSchema;
  values: SettingValues;
  onOpen: (groupId: string) => void;
}

/** The home of Player settings: one row per group the player reports, with a value summary. */
export function SettingGroupList({ schema, values, onOpen }: SettingGroupListProps) {
  const { t, language } = useI18n();
  return (
    <Card variant="surface">
      {visibleGroups(schema).map((group, index) => (
        <React.Fragment key={group.id}>
          {index > 0 ? <Divider /> : null}
          <ListRow
            title={localizedLabel(language, group.labelId, group.label)}
            subtitle={groupSummary(schema, group.id, values, language, t)}
            leading={<Icon name={groupIcon(group.id)} />}
            trailing={<Icon name="chevronRight" size={18} />}
            onPress={() => onOpen(group.id)}
          />
        </React.Fragment>
      ))}
    </Card>
  );
}

export interface SettingGroupPanelProps {
  schema: SettingsSchema;
  groupId: string;
  values: SettingValues;
  writable: boolean;
  busyKeys: readonly string[];
  pendingApply: Readonly<Record<string, string>>;
  rescanBusy: boolean;
  onChange: (setting: SettingDescriptor, value: SettingValue) => void;
  onAction: (id: string) => void;
}

/** The settings of one group in a card, plus that group's actions (Library: update the music database). */
export function SettingGroupPanel({ schema, groupId, values, writable, busyKeys, pendingApply, rescanBusy, onChange, onAction }: SettingGroupPanelProps) {
  const { t, language } = useI18n();
  const settings = visibleSettings(schema, groupId);
  const actions = schema.actions.filter((a) => a.group === groupId);
  return (
    <View style={styles.panel}>
      {settings.length > 0 ? (
        <Card variant="surface">
          {settings.map((setting, index) => (
            <React.Fragment key={setting.key}>
              {index > 0 ? <Divider /> : null}
              <SettingControl
                setting={setting}
                schema={schema}
                values={values}
                writable={writable}
                busy={busyKeys.includes(setting.key)}
                pendingApply={pendingApply[setting.key]}
                onChange={onChange}
              />
            </React.Fragment>
          ))}
        </Card>
      ) : null}
      {actions.length > 0 ? (
        <View style={styles.actions}>
          <SectionHeader label={t('Actions')} tone="muted" />
          {actions.map((action) => (
            <Button
              key={action.id}
              label={localizedLabel(language, action.labelId, action.label)}
              variant="raised"
              disabled={!writable}
              busy={rescanBusy}
              onPress={() => onAction(action.id)}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: Space.md },
  actions: { gap: Space.sm },
});
