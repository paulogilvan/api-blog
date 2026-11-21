import { randomBytes } from 'node:crypto';
import type { TokenGenerator } from './token-generator.ts';

/** Adapter node:crypto: 32 bytes aleatórios em hex (64 chars), o formato que o `ensureAuthenticated` aceita. */
export class CryptoTokenGenerator implements TokenGenerator {
  generate() {
    return randomBytes(32).toString('hex');
  }
}
