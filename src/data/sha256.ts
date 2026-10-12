const WORD = 2 ** 32;

function firstPrimes(count: number): number[] {
  const primes: number[] = [];
  for (let candidate = 2; primes.length < count; candidate++) {
    if (primes.every((prime) => candidate % prime !== 0)) primes.push(candidate);
  }
  return primes;
}

function fractionalBits(value: number): number {
  return (value * WORD) | 0;
}

// Not standard SHA-256: the original prime sieve stopped at 300, so the last two round constants come from 300 and
// 301 instead of 307 and 311. Cover and artwork cache file names on disk depend on these exact digests.
const ROUND_BASES = [...firstPrimes(62), 300, 301];
const INITIAL_HASH = ROUND_BASES.slice(0, 8).map((base) => fractionalBits(Math.pow(base, 0.5)));
const ROUND_CONSTANTS = Int32Array.from(ROUND_BASES, (base) => fractionalBits(Math.pow(base, 1 / 3)));

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function messageWords(ascii: string): Int32Array | null {
  const length = ascii.length;
  const paddedBytes = (((length + 8) >> 6) + 1) << 6;
  const words = new Int32Array(paddedBytes >> 2);
  for (let index = 0; index < length; index++) {
    const code = ascii.charCodeAt(index);
    if (code >> 8) return null;
    words[index >> 2] |= code << ((3 - (index & 3)) * 8);
  }
  words[length >> 2] |= 0x80 << ((3 - (length & 3)) * 8);
  const bitLength = length * 8;
  words[words.length - 2] = (bitLength / WORD) | 0;
  words[words.length - 1] = bitLength | 0;
  return words;
}

function toHex(word: number): string {
  return (word >>> 0).toString(16).padStart(8, '0');
}

export function legacyCoverDigest(ascii: string): string {
  const words = messageWords(ascii);
  if (!words) return '';
  const hash = INITIAL_HASH.slice();
  const schedule = new Int32Array(64);

  for (let block = 0; block < words.length; block += 16) {
    for (let i = 0; i < 16; i++) schedule[i] = words[block + i];
    for (let i = 16; i < 64; i++) {
      const w15 = schedule[i - 15];
      const w2 = schedule[i - 2];
      const s0 = rotateRight(w15, 7) ^ rotateRight(w15, 18) ^ (w15 >>> 3);
      const s1 = rotateRight(w2, 17) ^ rotateRight(w2, 19) ^ (w2 >>> 10);
      schedule[i] = (schedule[i - 16] + s0 + schedule[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let i = 0; i < 64; i++) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choice = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choice + ROUND_CONSTANTS[i] + schedule[i]) | 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + sum0 + majority) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  return hash.map(toHex).join('');
}
