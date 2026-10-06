export class RemoteEndpoint {
  static readonly DEFAULT_PLAYER_PORT = 8899;

  static normalizeWifiAddress(input: string, defaultPort: number = RemoteEndpoint.DEFAULT_PLAYER_PORT): string {
    if (!Number.isInteger(defaultPort) || defaultPort < 1 || defaultPort > 65535) {
      throw new Error('Default port must be between 1 and 65535');
    }
    const supplied = input.trim();
    if (!supplied) {
      throw new Error('Player address cannot be blank');
    }
    const withScheme = supplied.includes('://') ? supplied : `http://${supplied}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      throw new Error('Enter only the player\'s IP address and optional port');
    }

    if (url.protocol.toLowerCase() !== 'http:') {
      throw new Error('Use an http:// player address');
    }

    if (!url.hostname || (url.pathname !== '' && url.pathname !== '/') || url.search || url.hash || url.username || url.password) {
      throw new Error('Enter only the player\'s IP address and optional port');
    }

    let port: number;
    if (url.port) {
      port = parseInt(url.port, 10);
    } else {
      port = defaultPort;
    }

    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('Player port must be between 1 and 65535');
    }

    let host = url.hostname;
    // URL hostname on IPv6 will already be enclosed in [] in modern WHATWG URL,
    // but if not:
    if (host.includes(':') && !host.startsWith('[')) {
      host = `[${host}]`;
    }

    return `http://${host}:${port}`;
  }
}
