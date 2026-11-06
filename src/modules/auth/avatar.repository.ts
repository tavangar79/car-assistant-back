import type { PrismaClient } from '@prisma/client';
import type { NewUserAvatar, StoredUserAvatar } from './auth.types.ts';

export interface AvatarRepository {
  findByUserId(userId: string): Promise<StoredUserAvatar | null>;
  /** When the user's avatar last changed; null if none. */
  findUpdatedAt(userId: string): Promise<Date | null>;
  /** Creates or replaces the user's avatar row. */
  save(userId: string, avatar: NewUserAvatar): Promise<StoredUserAvatar>;
  /** The storage keys of the removed rows (none when the user has no avatar). */
  delete(userId: string): Promise<string[]>;
}

const AVATAR_FIELDS = {
  contentType: true,
  storageKey: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaAvatarRepository implements AvatarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUserId(userId: string): Promise<StoredUserAvatar | null> {
    return this.prisma.userAvatar.findUnique({ where: { userId }, select: AVATAR_FIELDS });
  }

  async findUpdatedAt(userId: string): Promise<Date | null> {
    const avatar = await this.prisma.userAvatar.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return avatar?.updatedAt ?? null;
  }

  save(userId: string, avatar: NewUserAvatar): Promise<StoredUserAvatar> {
    return this.prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, ...avatar },
      update: avatar,
      select: AVATAR_FIELDS,
    });
  }

  async delete(userId: string): Promise<string[]> {
    const rows = await this.prisma.userAvatar.findMany({
      where: { userId },
      select: { storageKey: true },
    });
    await this.prisma.userAvatar.deleteMany({ where: { userId } });
    return rows.map((row) => row.storageKey);
  }
}
