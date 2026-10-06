/**
 * Endpoint normalizer for Compás Remote.
 */

export const DEFAULT_PLAYER_PORT = 8899;

export function normalizeWifiAddress(input: string, defaultPort: number = DEFAULT_PLAYER_PORT): string {
  if (defaultPort < 1 || defaultPort > 65535) {
    throw new Error('Default port must be between 1 and 65535');
  }

  const supplied = input.trim();
  if (!supplied) {
    throw new Error('Enter only the player\'s IP address and optional port');
  }

  let withScheme: string;
  if (supplied.includes('://')) {
    withScheme = supplied;
  } else {
    let hostPart = supplied;
    // Handle IPv6 without brackets
    if (hostPart.includes(':') && !hostPart.startsWith('[')) {
      const colons = (hostPart.match(/:/g) || []).length;
      if (colons >= 2) {
        // If there's a port at the end e.g. [::1]:8899 vs ::1
        const lastColon = hostPart.lastIndexOf(':');
        const possiblePort = hostPart.slice(lastColon + 1);
        // If possiblePort is purely digits and < 65536 and there were at least 2 colons before it
        if (/^\d+$/.test(possiblePort) && Number(possiblePort) <= 65535 && (hostPart.slice(0, lastColon).match(/:/g) || []).length >= 2) {
          hostPart = `[${hostPart.slice(0, lastColon)}]:${possiblePort}`;
        } else {
          hostPart = `[${hostPart}]`;
        }
      }
    }
    withScheme = `http://${hostPart}`;
  }

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch (err) {
    throw new Error('Enter only the player\'s IP address and optional port');
  }

  if (url.protocol.toLowerCase() !== 'http:') {
    throw new Error('Use an http:// player address');
  }

  if (
    !url.hostname ||
    (url.pathname !== '' && url.pathname !== '/') ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error('Enter only the player\'s IP address and optional port');
  }

  let port = defaultPort;
  if (url.port) {
    const parsedPort = parseInt(url.port, 10);
    if (isNaN(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
      throw new Error('Player port must be between 1 and 65535');
    }
    port = parsedPort;
  }

  let host = url.hostname;
  if (host.includes(':') && !host.startsWith('[')) {
    host = `[${host}]`;
  }

  return `http://${host}:${port}`;
}
