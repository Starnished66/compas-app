import { checkPlayerAddress, playerAddressHint } from '../playerAddress';

describe('checkPlayerAddress', () => {
  it('accepts hosts and IPs with or without a port', () => {
    expect(checkPlayerAddress('r1.compas.local')).toBe('valid');
    expect(checkPlayerAddress('r1.compas.local:8899')).toBe('valid');
    expect(checkPlayerAddress('192.168.1.20:8899')).toBe('valid');
  });

  it('accepts the full URL the app saves', () => {
    expect(checkPlayerAddress('http://192.168.1.234:8899')).toBe('valid');
    expect(checkPlayerAddress('http://r1.compas.local:8899/')).toBe('valid');
    expect(playerAddressHint('http://192.168.1.234:8899')).toBe('Looks good. Port 8899.');
    expect(playerAddressHint('r1.compas.local')).toBe('Looks good. Port 80.');
  });

  it('rejects text that is not an address', () => {
    expect(checkPlayerAddress('')).toBe('blank');
    expect(checkPlayerAddress('1234')).toBe('invalid');
    expect(checkPlayerAddress('http://')).toBe('invalid');
  });
});
