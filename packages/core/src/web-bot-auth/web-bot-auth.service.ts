import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class WebBotAuthService implements OnModuleInit {
  private readonly logger = new Logger(WebBotAuthService.name);
  private keyPairs = new Map<number, { privateKey: crypto.KeyObject; keyId: string }>();
  private enabled = false;

  async onModuleInit() {
    this.enabled = process.env.WEB_BOT_AUTH_ENABLED === 'true';
    if (!this.enabled) {
      this.logger.log('Web Bot Auth disabled');
      return;
    }

    const seed = process.env.WEB_BOT_AUTH_SEED;
    if (!seed) {
      this.logger.warn('WEB_BOT_AUTH_SEED not set, Web Bot Auth disabled');
      this.enabled = false;
      return;
    }

    const proxyCount = parseInt(process.env.PROXY_COUNT || '100', 10);
    await this.generateKeyPairs(seed, proxyCount);
    this.logger.log(`Web Bot Auth initialized with ${proxyCount} key pairs`);
  }

  /**
   * Generate deterministic Ed25519 key pairs from seed + proxy index.
   * Each proxy IP gets its own key pair so Shopify treats each as a
   * separate legitimate bot with its own rate-limit allowance.
   *
   * The 32-byte SHA-256 of `${seed}:proxy:${i}` is used directly as
   * the Ed25519 private key seed (clamped internally by the Ed25519
   * algorithm). We wrap it in a minimal PKCS#8 DER envelope so that
   * Node's crypto API can import it.
   */
  private async generateKeyPairs(seed: string, count: number): Promise<void> {
    // Ed25519 PKCS#8 DER prefix: 16 bytes that precede the 32-byte private key seed.
    // Sequence -> Version(0) -> AlgId(Ed25519 OID) -> OctetString(OctetString(32 bytes))
    const pkcs8Prefix = Buffer.from('302e020100300506032b657004220420', 'hex');

    for (let i = 1; i <= count; i++) {
      const derivedSeed = crypto
        .createHash('sha256')
        .update(`${seed}:proxy:${i}`)
        .digest();

      const privateKey = crypto.createPrivateKey({
        key: Buffer.concat([pkcs8Prefix, derivedSeed]),
        format: 'der',
        type: 'pkcs8',
      });

      const publicKey = crypto.createPublicKey(privateKey);

      // JWK Thumbprint per RFC 7638: canonical JSON of required members
      // in lexicographic order for OKP key type: { "crv", "kty", "x" }
      const jwk = publicKey.export({ format: 'jwk' });
      const thumbprint = crypto
        .createHash('sha256')
        .update(JSON.stringify({ crv: jwk.crv, kty: jwk.kty, x: jwk.x }))
        .digest('base64url');

      this.keyPairs.set(i, { privateKey, keyId: thumbprint });
    }
  }

  /**
   * Sign an HTTP request using RFC 9421 HTTP Message Signatures with
   * the key pair assigned to a specific proxy number.
   *
   * Returns the three Web Bot Auth headers (`Signature-Input`,
   * `Signature`, `Signature-Agent`) to add to the outgoing request,
   * or `null` if signing is disabled or the proxy number has no key.
   *
   * IMPORTANT: Sign BEFORE sending through the proxy. The proxy must
   * not modify any of the signed components (`@method`, `@authority`,
   * `@path`, `signature-agent`).
   */
  async signRequest(
    proxyNumber: number,
    method: string,
    url: string,
  ): Promise<Record<string, string> | null> {
    if (!this.enabled) return null;

    const keyPair = this.keyPairs.get(proxyNumber);
    if (!keyPair) return null;

    const parsedUrl = new URL(url);
    const created = Math.floor(Date.now() / 1000);
    const expires = created + 300;
    const nonce = crypto.randomBytes(16).toString('base64url');

    const signatureAgent = 'ScoutLGS/1.0';

    // Covered components list for the Signature-Input structured field
    const coveredComponents = '"@method" "@authority" "@path" "signature-agent"';

    // Signature parameters string (used both in base and header)
    const signatureParams =
      `(${coveredComponents});created=${created};expires=${expires}` +
      `;keyid="${keyPair.keyId}";alg="ed25519";tag="web-bot-auth";nonce="${nonce}"`;

    // RFC 9421 signature base: each covered component on its own line
    // as `"component-id": value`, terminated by `"@signature-params": <params>`.
    // Lines are joined with a single newline character.
    const signatureBase = [
      `"@method": ${method.toUpperCase()}`,
      `"@authority": ${parsedUrl.host}`,
      `"@path": ${parsedUrl.pathname}`,
      `"signature-agent": ${signatureAgent}`,
      `"@signature-params": ${signatureParams}`,
    ].join('\n');

    // Ed25519 signature over the raw bytes of the base string
    const signature = crypto.sign(null, Buffer.from(signatureBase), keyPair.privateKey);
    const signatureB64 = signature.toString('base64');

    return {
      'Signature-Input': `sig=${signatureParams}`,
      Signature: `sig=:${signatureB64}:`,
      'Signature-Agent': signatureAgent,
    };
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}
