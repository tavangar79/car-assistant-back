import type { NewOtpCode, OtpCode } from '../modules/auth/auth.types.ts';
import type { OtpRepository } from '../modules/auth/otp.repository.ts';

export class InMemoryOtpRepository implements OtpRepository {
  readonly codes = new Map<string, OtpCode>();
  readonly requests: { phone: string; createdAt: Date }[] = [];

  async findByPhone(phone: string): Promise<OtpCode | null> {
    const otp = this.codes.get(phone);
    return otp ? { ...otp } : null;
  }

  async replace(otp: NewOtpCode): Promise<void> {
    this.codes.set(otp.phone, { ...otp, attempts: 0 });
  }

  async useAttempt(phone: string, maxAttempts: number): Promise<boolean> {
    const otp = this.codes.get(phone);
    if (!otp || otp.attempts >= maxAttempts) return false;
    otp.attempts += 1;
    return true;
  }

  async consume(phone: string, codeHash: string): Promise<boolean> {
    if (this.codes.get(phone)?.codeHash !== codeHash) return false;
    return this.codes.delete(phone);
  }

  async recordRequest(phone: string, at: Date): Promise<void> {
    this.requests.push({ phone, createdAt: at });
  }

  async listRequestTimes(phone: string, since: Date): Promise<Date[]> {
    return this.requests
      .filter((request) => request.phone === phone && request.createdAt > since)
      .map((request) => request.createdAt)
      .sort((a, b) => a.getTime() - b.getTime());
  }

  async deleteExpired(now: Date, requestsUpTo: Date): Promise<void> {
    for (const [phone, otp] of this.codes) {
      if (otp.expiresAt <= now) this.codes.delete(phone);
    }
    const kept = this.requests.filter((request) => request.createdAt > requestsUpTo);
    this.requests.splice(0, this.requests.length, ...kept);
  }
}
