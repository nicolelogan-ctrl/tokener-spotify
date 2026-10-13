import crypto from 'crypto';
import { TOTP_CONFIG } from '../config/constants.js';

/**
 * Encodes a buffer into RFC 4648 Base32 string.
 * @param {Buffer} buffer - Byte buffer to encode
 * @returns {string} Base32 encoded string
 */
export function encodeBase32(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;

    while (bits >= 5) {
      output += TOTP_CONFIG.BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += TOTP_CONFIG.BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Generates a Time-based One-Time Password (TOTP) for Spotify Web Player authentication.
 * 
 * Algorithm breakdown:
 * 1. Secret Transformation: Each secret byte is XORed with ((index % 33) + 9).
 * 2. UTF-8 to Hex byte conversion.
 * 3. 30-second time counter calculation based on Spotify server timestamp.
 * 4. HMAC-SHA1 signature computation.
 * 5. Dynamic truncation to extract 6-digit numeric token.
 * 
 * @param {number} timestampSeconds - Spotify server timestamp in seconds
 * @param {number[]} secretArray - Array of secret byte integers
 * @returns {number} 6-digit TOTP code
 */
export function generateTOTP(timestampSeconds, secretArray) {
  // Transform the secret array using Spotify's XOR cipher
  const transformedSecret = secretArray.map((element, index) =>
    element ^ ((index % 33) + 9)
  );

  const joinedSecret = transformedSecret.join('');
  const hexSecret = Buffer.from(joinedSecret, 'utf8').toString('hex');
  const secretBytes = Buffer.from(hexSecret, 'hex');

  const counter = Math.floor(timestampSeconds / TOTP_CONFIG.TIME_STEP);

  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = crypto.createHmac('sha1', secretBytes);
  hmac.update(counterBuffer);
  const hmacResult = hmac.digest();

  const offset = hmacResult[hmacResult.length - 1] & 0xf;

  const code =
    ((hmacResult[offset] & 0x7f) << 24) |
    ((hmacResult[offset + 1] & 0xff) << 16) |
    ((hmacResult[offset + 2] & 0xff) << 8) |
    (hmacResult[offset + 3] & 0xff);

  return code % (10 ** TOTP_CONFIG.DIGITS);
}
