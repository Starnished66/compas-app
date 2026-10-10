import { RemoteEndpoint } from '../data/RemoteEndpoint';

export type AddressCheck = 'blank' | 'valid' | 'invalid';

const HOST_WITH_OPTIONAL_PORT = /^[a-zA-Z0-9][a-zA-Z0-9.-]*(:\d{1,5})?$/;
const IPV4_WITH_OPTIONAL_PORT = /^\d+\.\d+\.\d+\.\d+(:\d+)?$/;
const HAS_LETTER = /[a-z]/i;

export function checkPlayerAddress(input: string): AddressCheck {
  const address = input.trim();
  if (!address) return 'blank';
  const plausible =
    HOST_WITH_OPTIONAL_PORT.test(address) && (IPV4_WITH_OPTIONAL_PORT.test(address) || HAS_LETTER.test(address));
  return plausible ? 'valid' : 'invalid';
}

export function playerAddressHint(input: string): string {
  switch (checkPlayerAddress(input)) {
    case 'blank':
      return `If you leave out the port, ${RemoteEndpoint.DEFAULT_PLAYER_PORT} is used.`;
    case 'valid': {
      const port = input.trim().split(':')[1] ?? String(RemoteEndpoint.DEFAULT_PLAYER_PORT);
      return `Looks good. Port ${port}.`;
    }
    default:
      return 'That doesn’t look like an address. Try something like 192.168.1.20:8899.';
  }
}
