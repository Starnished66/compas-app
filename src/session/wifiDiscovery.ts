import type { DiscoveredWifiService } from '../../modules/compas-discovery/src';
import { RemoteEndpoint } from '../data/RemoteEndpoint';

/** Resolved advertisements supply an IP, never a URL or credentials. */
export function discoveryEndpoint(service: DiscoveredWifiService): string | null {
  if (String(service.apiVersion) !== '1' || service.port !== 8899 || typeof service.host !== 'string') return null;
  const host = service.host;
  const parts = host.split('.');
  if (parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)) {
    const values = parts.map(Number);
    if (values[0] === 0 || values[0] === 127 || values[0] >= 224 || values.every((v) => v === 255)) return null;
  } else if (!/^[0-9a-fA-F:]+$/.test(host) || !host.includes(':') || host === '::' || host === '::1' || /^ff/i.test(host)) return null;
  try { return RemoteEndpoint.normalizeWifiAddress(`${host.includes(':') ? `[${host}]` : host}:8899`); }
  catch { return null; }
}
