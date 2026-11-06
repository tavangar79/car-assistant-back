import type { PrismaClient } from '@prisma/client';
import type { UpdateProfileInput, User, UserBlock, UserListQuery } from './auth.types.ts';
import { toAsciiDigits } from './phone.ts';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  create(phone: string): Promise<User>;
  /** Only call for an existing user. Fields left undefined keep their value. */
  updateProfile(id: string, profile: Partial<UpdateProfileInput>): Promise<User>;
  /** Only call for an existing user. */
  setBlock(id: string, block: UserBlock): Promise<User>;
  /** Newest `id` first. */
  list(query: UserListQuery): Promise<User[]>;
  countBlocked(): Promise<number>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { phone } });
  }

  create(phone: string): Promise<User> {
    return this.prisma.user.create({ data: { phone } });
  }

  updateProfile(id: string, profile: Partial<UpdateProfileInput>): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: profile });
  }

  setBlock(id: string, block: UserBlock): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: block });
  }

  list({ search, cursor, limit }: UserListQuery): Promise<User[]> {
    const text = search?.trim();
    return this.prisma.user.findMany({
      where: {
        ...(cursor ? { id: { lt: cursor } } : {}),
        ...(text
          ? {
              OR: [
                { phone: { contains: toAsciiDigits(text) } },
                { firstName: { contains: text, mode: 'insensitive' } },
                { lastName: { contains: text, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: { id: 'desc' },
      take: limit,
    });
  }

  countBlocked(): Promise<number> {
    // Older documents have no blockedAt at all, so "not null" alone would also match them.
    return this.prisma.user.count({ where: { blockedAt: { isSet: true, not: null } } });
  }
}
