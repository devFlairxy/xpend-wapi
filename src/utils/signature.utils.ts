import crypto from 'crypto';
import { config } from '../config';

export class SignatureUtils {
  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  public static generateSignature(payload: string, secret: string = config.webhook.sharedSecret): string {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Verify HMAC-SHA256 signature for webhook payload
   */
  public static verifySignature(
    payload: string, 
    signature: string, 
    secret: string = config.webhook.sharedSecret
  ): boolean {
    const expectedSignature = this.generateSignature(payload, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    );
  }

  /**
   * Generate signature for deposit webhook payload
   */
  public static generateDepositSignature(payload: object): string {
    const payloadString = JSON.stringify(payload);
    return this.generateSignature(payloadString);
  }

  /**
   * Verify deposit webhook signature
   */
  public static verifyDepositSignature(payload: object, signature: string): boolean {
    const payloadString = JSON.stringify(payload);
    return this.verifySignature(payloadString, signature);
  }

  /**
   * Generate nonce for transaction signing
   */
  public static generateNonce(): number {
    return Math.floor(Date.now() / 1000);
  }

  /**
   * Generate transaction hash for signing
   */
  public static generateTransactionHash(
    from: string,
    to: string,
    amount: string,
    nonce: number,
    chainId: number
  ): string {
    const data = `${from}${to}${amount}${nonce}${chainId}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }
} 