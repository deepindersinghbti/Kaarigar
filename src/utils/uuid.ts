/**
 * UUIDv7 - time-ordered identifiers.
 *
 * Architecture sections 7 and 9.1 specify v7 rather than v4 so that records
 * created offline keep a stable AND SORTABLE identity from the moment of
 * creation. That sortability is load-bearing here: the ledger is append-only
 * and the outbox flushes in causal order, so ids that sort by creation time
 * mean nothing needs renumbering after sync.
 *
 * Node's crypto.randomUUID() is v4 - stable but random-ordered - so it cannot
 * be used for these records.
 *
 * Layout (RFC 9562): 48-bit big-endian Unix milliseconds, 4-bit version (7),
 * 12 random bits, 2-bit variant (0b10), 62 random bits.
 *
 * Works in the browser and in Node: both provide globalThis.crypto.
 */
export function uuidv7(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);

  const ms = Date.now();
  // 48-bit timestamp, most significant byte first.
  bytes[0] = (ms / 2 ** 40) & 0xff;
  bytes[1] = (ms / 2 ** 32) & 0xff;
  bytes[2] = (ms / 2 ** 24) & 0xff;
  bytes[3] = (ms / 2 ** 16) & 0xff;
  bytes[4] = (ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;

  // Version 7 in the high nibble of byte 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 variant in the top two bits of byte 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}
