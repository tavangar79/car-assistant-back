import type { PrismaClient } from '@prisma/client';
import type { NewOtpCode, OtpCode } from './auth.types.ts';

export interface OtpRepository {
  findByPhone(phone: string): Promise<OtpCode | null>;
  /** Stores the code for this phone, replacing any previous one and resetting attempts. */
  replace(otp: NewOtpCode): Promise<void>;
  /**
   * Atomically counts one verify attempt if fewer than `maxAttempts` were used.
   * Returns false when attempts are exhausted (or no code exists).
   */
  useAttempt(phone: string, maxAttempts: number): Promise<boolean>;
  /** Deletes the code only if it is still the given one. Returns false if it was already used. */
  consume(phone: string, codeHash: string): Promise<boolean>;

  /** Logs that a code was sent to this phone (feeds the cooldown and the per-phone cap). */
  recordRequest(phone: string, at: Date): Promise<void>;
  /** Times of this phone's requests after `since`, oldest first. */
  listRequestTimes(phone: string, since: Date): Promise<Date[]>;
  /** Forgets this phone's request log, so its cooldown and per-phone cap start fresh. */
  clearRequests(phone: string): Promise<void>;
  /** Cleanup for all phones: codes expired by `now`, and request logs at or before `requestsUpTo`. */
  deleteExpired(now: Date, requestsUpTo: Date): Promise<void>;
}

export class PrismaOtpRepository implements OtpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByPhone(phone: string): Promise<OtpCode | null> {
    return this.prisma.otpCode.findUnique({ where: { phone } });
  }

  async replace(otp: NewOtpCode): Promise<void> {
    const data = { ...otp, attempts: 0 };
    await this.prisma.otpCode.upsert({ where: { phone: otp.phone }, create: data, update: data });
  }

  async useAttempt(phone: string, maxAttempts: number): Promise<boolean> {
    const { count } = await this.prisma.otpCode.updateMany({
      where: { phone, attempts: { lt: maxAttempts } },
      data: { attempts: { increment: 1 } },
    });
    return count > 0;
  }

  async consume(phone: string, codeHash: string): Promise<boolean> {
    const { count } = await this.prisma.otpCode.deleteMany({ where: { phone, codeHash } });
    return count > 0;
  }

  async recordRequest(phone: string, at: Date): Promise<void> {
    await this.prisma.otpRequest.create({ data: { phone, createdAt: at } });
  }

  async listRequestTimes(phone: string, since: Date): Promise<Date[]> {
    const requests = await this.prisma.otpRequest.findMany({
      where: { phone, createdAt: { gt: since } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    return requests.map((request) => request.createdAt);
  }

  async clearRequests(phone: string): Promise<void> {
    await this.prisma.otpRequest.deleteMany({ where: { phone } });
  }

  async deleteExpired(now: Date, requestsUpTo: Date): Promise<void> {
    await this.prisma.otpCode.deleteMany({ where: { expiresAt: { lte: now } } });
    await this.prisma.otpRequest.deleteMany({ where: { createdAt: { lte: requestsUpTo } } });
  }
}
