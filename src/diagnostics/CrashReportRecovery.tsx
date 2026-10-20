import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { clearReport, copyReport, getPendingReport, type PendingCrashReport } from '../../modules/compas-diagnostics/src';
import { useI18n } from '../i18n';
import { AppText } from '../ui/components/AppText';
import { BottomSheet } from '../ui/components/BottomSheet';
import { Button } from '../ui/components/Button';
import { Dialog } from '../ui/components/Dialog';
import { InlineError } from '../ui/components/InlineError';
import { Space } from '../ui/tokens';

export default function CrashReportRecovery() {
  const { t } = useI18n();
  const [report, setReport] = useState<PendingCrashReport | null>(null);
  const [viewing, setViewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { setReport(getPendingReport()); }, []);
  if (!report) return null;

  const forgetReport = () => {
    if (clearReport(report.id)) {
      setReport(null);
      setViewing(false);
    } else {
      // A newer crash must not be deleted through an older report's controls.
      setReport(getPendingReport());
      setCopied(false);
      setError(t('The report changed. Please review it again.'));
    }
  };
  const copy = () => {
    const ok = copyReport(report.id);
    setCopied(ok);
    setError(ok ? null : t('Could not copy the report.'));
  };

  return (
    <>
      <Dialog
        visible={!viewing}
        onClose={() => setReport(null)}
        title={t('Compás Remote closed unexpectedly')}
        message={t('A local crash report is available. Nothing is uploaded automatically.')}
        actions={
          <>
            <Button label={t('Not now')} variant="raised" fill onPress={() => setReport(null)} />
            <Button label={t('View report')} variant="accent" fill onPress={() => setViewing(true)} />
          </>
        }
      />
      <BottomSheet visible={viewing} onClose={() => setViewing(false)} title={t('Crash report')} fullHeight scrollable={false}>
        <View style={styles.actions}>
          <Button label={copied ? t('Copied') : t('Copy report')} variant="accent" fill onPress={copy} />
          <Button label={t('Dismiss report')} variant="raised" fill onPress={forgetReport} />
        </View>
        <AppText variant="caption" tone="inkMuted" style={styles.notice}>
          {t('Review the device details and error text before sharing.')}
        </AppText>
        {error ? <InlineError message={error} /> : null}
        <ScrollView style={styles.report} contentContainerStyle={styles.reportContent}>
          <AppText selectable variant="caption" style={styles.code}>{report.text}</AppText>
        </ScrollView>
      </BottomSheet>
    </>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: Space.sm, paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  notice: { paddingHorizontal: Space.lg, paddingBottom: Space.sm },
  report: { flex: 1 },
  reportContent: { paddingHorizontal: Space.lg, paddingBottom: Space.lg },
  code: { fontFamily: 'monospace' },
});
