import type { PrismaClient } from '@prisma/client';
import type { NewUserAvatar, UserAvatar } from './auth.types.ts';

export interface AvatarRepository {
  findByUserId(userId: string): Promise<UserAvatar | null>;
  /** When the user's avatar last changed, without loading its bytes; null if none. */
  findUpdatedAt(userId: string): Promise<Date | null>;
  /** Creates or replaces the user's avatar. */
  save(userId: string, avatar: NewUserAvatar): Promise<UserAvatar>;
  /** No-op when the user has no avatar. */
  delete(userId: string): Promise<void>;
}

const AVATAR_FIELDS = { contentType: true, data: true, updatedAt: true } as const;

export class PrismaAvatarRepository implements AvatarRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByUserId(userId: string): Promise<UserAvatar | null> {
    return this.prisma.userAvatar.findUnique({ where: { userId }, select: AVATAR_FIELDS });
  }

  async findUpdatedAt(userId: string): Promise<Date | null> {
    const avatar = await this.prisma.userAvatar.findUnique({
      where: { userId },
      select: { updatedAt: true },
    });
    return avatar?.updatedAt ?? null;
  }

  save(userId: string, { contentType, data }: NewUserAvatar): Promise<UserAvatar> {
    // Prisma wants bytes backed by a plain ArrayBuffer; a Node Buffer may sit on a shared pool.
    const avatar = { contentType, data: new Uint8Array(data) };
    return this.prisma.userAvatar.upsert({
      where: { userId },
      create: { userId, ...avatar },
      update: avatar,
      select: AVATAR_FIELDS,
    });
  }

  async delete(userId: string): Promise<void> {
    await this.prisma.userAvatar.deleteMany({ where: { userId } });
  }
}
