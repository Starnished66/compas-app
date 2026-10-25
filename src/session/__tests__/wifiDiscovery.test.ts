import { discoveryEndpoint, discoveryHostnameEndpoint } from '../wifiDiscovery';
const device = { id: 'x', name: 'Compás', host: '192.168.1.2', port: 8899, address: 'http://attacker.invalid:90', apiVersion: '1' };
describe('discovery endpoint validation', () => {
  it('uses the resolved source and fixed port, ignoring advertised URLs', () => {
    expect(discoveryEndpoint(device)).toBe('http://192.168.1.2:8899');
  });
  it('rejects unsupported protocol, ports, URLs and non-unicast addresses', () => {
    for (const patch of [{ apiVersion: '2' }, { port: 80 }, { host: 'http://192.168.1.2' }, { host: '127.0.0.1' }, { host: '0.0.0.0' }, { host: '224.0.0.1' }, { host: '1.2.3.999' }, { host: 'player.example' }]) {
      expect(discoveryEndpoint({ ...device, ...patch })).toBeNull();
    }
  });
});
describe('discovery hostname', () => {
  it('uses the player name without a port', () => {
    expect(discoveryHostnameEndpoint({ ...device, hostname: 'r1.compas.local' })).toBe('http://r1.compas.local');
    expect(discoveryHostnameEndpoint({ ...device, hostname: 'R3-2.compas.local' })).toBe('http://r3-2.compas.local');
  });
  it('ignores names outside compas.local and invalid advertisements', () => {
    for (const hostname of [null, '', 'player.local', 'r1.compas.local.evil', 'a.b.compas.local', 'http://r1.compas.local']) {
      expect(discoveryHostnameEndpoint({ ...device, hostname })).toBeNull();
    }
    expect(discoveryHostnameEndpoint({ ...device, hostname: 'r1.compas.local', host: '127.0.0.1' })).toBeNull();
  });
});
