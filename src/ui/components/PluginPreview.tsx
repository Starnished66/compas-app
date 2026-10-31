import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { PluginsApi } from '../../data/PluginsApi';
import { useI18n } from '../../i18n';
import { usePalette } from '../PaletteProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Space } from '../tokens';
import { Spinner } from './Spinner';

type Kind = 'store' | 'layout';
type PreviewValue = { uri: string | null; status: 'ready' | 'unavailable' | 'error' | 'pending' };
type PreviewJob = { key: string; api: PluginsApi; kind: Kind; id: string; active: () => boolean; resolve: (value: PreviewValue | null) => void };
const MAX_ACTIVE = 2;
const MAX_CACHE = 16;
const MAX_ATTEMPTS = 20;
const RETRY_MS = 750;
const identity = new WeakMap<PluginsApi, number>();
let nextIdentity = 1;
const cache = new Map<string, PreviewValue>();
const inFlight = new Map<string, Promise<PreviewValue | null>>();
const queue: PreviewJob[] = [];
let activeJobs = 0;

function apiIdentity(api: PluginsApi) {
  let id = identity.get(api);
  if (!id) { id = nextIdentity++; identity.set(api, id); }
  return id;
}
function remember(key: string, value: PreviewValue) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value!);
}
function forget(key: string) {
  cache.delete(key);
}
function enqueue(api: PluginsApi, kind: Kind, id: string, active: () => boolean) {
  const key = `${apiIdentity(api)}:${kind}:${id}`;
  const cached = cache.get(key);
  if (cached) { cache.delete(key); cache.set(key, cached); return Promise.resolve(cached); }
  const pending = inFlight.get(key);
  if (pending) return pending;
  let resolve!: (value: PreviewValue | null) => void;
  const promise = new Promise<PreviewValue | null>((done) => { resolve = done; });
  inFlight.set(key, promise);
  queue.push({ key, api, kind, id, active, resolve });
  pump();
  return promise;
}
function pump() {
  while (activeJobs < MAX_ACTIVE && queue.length) {
    const job = queue.shift()!;
    if (!job.active()) { inFlight.delete(job.key); job.resolve(null); continue; }
    activeJobs += 1;
    void (async () => {
      let result: PreviewValue = { uri: null, status: 'error' };
      try {
        for (let attempt = 0; attempt < MAX_ATTEMPTS && job.active(); attempt += 1) {
          const response = job.kind === 'store' ? await job.api.storePreview(job.id) : await job.api.layoutPreview(job.id);
          if (response.state === 'ready') {
            result = { uri: `data:${response.mime};base64,${response.data}`, status: 'ready' };
            remember(job.key, result);
            break;
          }
          if (response.state === 'unavailable') {
            result = { uri: null, status: 'unavailable' };
            remember(job.key, result);
            break;
          }
          if (attempt + 1 < MAX_ATTEMPTS && job.active()) await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
        }
      } catch {
        result = { uri: null, status: 'error' };
      } finally {
        inFlight.delete(job.key);
        activeJobs -= 1;
        job.resolve(job.active() ? result : null);
        pump();
      }
    })();
  }
}

export function PluginPreview({ api, kind, id, active, hasPreview = true }: { api: PluginsApi | null; kind: Kind; id: string; active: boolean; hasPreview?: boolean }) {
  const { t } = useI18n();
  const palette = usePalette();
  const [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState<PreviewValue | null>(null);
  const handleImageError = () => {
    if (api) forget(`${apiIdentity(api)}:${kind}:${id}`);
    setPreview({ uri: null, status: 'error' });
  };
  useEffect(() => {
    setPreview(null);
    if (!api || !active || !hasPreview) return;
    setPreview({ uri: null, status: 'pending' });
    let mounted = true;
    const load = () => {
      void enqueue(api, kind, id, () => mounted && active).then((value) => {
        if (!mounted) return;
        if (value) setPreview(value);
        else if (active) setTimeout(load, 0);
      });
    };
    load();
    return () => { mounted = false; };
  }, [api, attempt, active, hasPreview, id, kind]);

  const placeholder = !hasPreview || !preview?.uri;
  return <View style={[styles.frame, { backgroundColor: palette.surfaceRaised }]}>
    {!placeholder ? <Image source={{ uri: preview!.uri! }} resizeMode="contain" style={styles.image} accessibilityLabel={t('Plugin preview')} onError={handleImageError} /> : (
      <>
        {hasPreview && preview?.status === 'pending' ? <><Spinner size={18} /><AppText variant="caption" tone="inkMuted">{t('Loading preview…')}</AppText></> : <AppText variant="caption" tone="inkMuted">{t(!hasPreview || preview?.status === 'unavailable' ? 'No preview available' : 'Preview unavailable')}</AppText>}
        {hasPreview && preview?.status === 'error' ? <Button size="sm" variant="plain" label={t('Retry preview')} onPress={() => setAttempt((value) => value + 1)} /> : null}
      </>
    )}
  </View>;
}

const styles = StyleSheet.create({
  frame: { minHeight: 128, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: Space.sm, overflow: 'hidden' },
  image: { width: '100%', height: 220 },
});
