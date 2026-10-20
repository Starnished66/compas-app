import { discoveryEndpoint } from '../wifiDiscovery';
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
