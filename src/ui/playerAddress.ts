import { RemoteEndpoint } from '../data/RemoteEndpoint';
import { translate as translateEnglish } from '../i18n/translate';

type Translate = (source: string, variables?: Record<string, string | number>) => string;

export type AddressCheck = 'blank' | 'valid' | 'invalid';

const HOST_WITH_OPTIONAL_PORT = /^[a-zA-Z0-9][a-zA-Z0-9.-]*(:\d{1,5})?$/;
const IPV4_WITH_OPTIONAL_PORT = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/;
const HAS_LETTER = /[a-z]/i;

// The saved address is a full URL ("http://192.168.1.20:8899"), and people paste those too.
function withoutScheme(input: string): string {
  return input.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

export function checkPlayerAddress(input: string): AddressCheck {
  if (!input.trim()) return 'blank';
  const address = withoutScheme(input);
  const plausible =
    HOST_WITH_OPTIONAL_PORT.test(address) && (IPV4_WITH_OPTIONAL_PORT.test(address) || HAS_LETTER.test(address));
  return plausible ? 'valid' : 'invalid';
}

export function playerAddressHint(
  input: string,
  t: Translate = (source, variables) => translateEnglish(source, 'en', variables),
): string {
  switch (checkPlayerAddress(input)) {
    case 'blank':
      return t('If you leave out the port, {port} is used.', { port: RemoteEndpoint.DEFAULT_PLAYER_PORT });
    case 'valid': {
      const address = withoutScheme(input);
      const port = address.split(':')[1] ??
        (address.toLowerCase().endsWith(RemoteEndpoint.PLAYER_DOMAIN) ? '80' : String(RemoteEndpoint.DEFAULT_PLAYER_PORT));
      return t('Looks good. Port {port}.', { port });
    }
    default:
      return t('That doesn’t look like an address. Try something like 192.168.1.20:8899.');
  }
}
