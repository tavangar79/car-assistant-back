import type { PrismaClient } from '@prisma/client';
import type { UpdateProfileInput, User, UserRole } from './auth.types.ts';

export interface UserRepository {
  findById(id: string): Promise<User | null>;
  findByPhone(phone: string): Promise<User | null>;
  create(phone: string): Promise<User>;
  /** Only call for an existing user. */
  updateProfile(id: string, profile: UpdateProfileInput): Promise<User>;
  /** Only call for an existing user. */
  setRole(id: string, role: UserRole): Promise<User>;
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

  updateProfile(id: string, profile: UpdateProfileInput): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: profile });
  }

  setRole(id: string, role: UserRole): Promise<User> {
    return this.prisma.user.update({ where: { id }, data: { role } });
  }
}
