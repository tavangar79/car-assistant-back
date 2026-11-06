import type { PrismaClient } from '@prisma/client';

export interface Admin {
  id: string;
  username: string;
  passwordHash: string;
  /** Base32. */
  totpSecret: string;
  /** The last accepted TOTP step, or null before the first login. */
  lastTotpStep: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type NewAdmin = Pick<Admin, 'username' | 'passwordHash' | 'totpSecret'>;

export interface AdminRepository {
  findById(id: string): Promise<Admin | null>;
  findByUsername(username: string): Promise<Admin | null>;
  /** Atomically deletes every admin and creates this one. */
  replaceAll(admin: NewAdmin): Promise<Admin>;
  /**
   * Atomically stores `step` as the last accepted TOTP step, only when it is newer than the stored one.
   * False means the step was already used (a replay, or a concurrent login with the same code).
   */
  acceptTotpStep(id: string, step: number): Promise<boolean>;
}

export class PrismaAdminRepository implements AdminRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { id } });
  }

  findByUsername(username: string): Promise<Admin | null> {
    return this.prisma.admin.findUnique({ where: { username } });
  }

  async replaceAll(admin: NewAdmin): Promise<Admin> {
    const [, created] = await this.prisma.$transaction([
      this.prisma.admin.deleteMany(),
      this.prisma.admin.create({ data: { ...admin, lastTotpStep: null } }),
    ]);
    return created;
  }

  async acceptTotpStep(id: string, step: number): Promise<boolean> {
    const { count } = await this.prisma.admin.updateMany({
      where: {
        id,
        OR: [
          { lastTotpStep: { isSet: false } },
          { lastTotpStep: null },
          { lastTotpStep: { lt: step } },
        ],
      },
      data: { lastTotpStep: step },
    });
    return count === 1;
  }
}
