import { randomBytes } from 'node:crypto';
import type { UpdateProfileInput, User } from '../modules/auth/auth.types.ts';
import type { UserRepository } from '../modules/auth/user.repository.ts';

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.phone === phone) ?? null;
  }

  async create(phone: string): Promise<User> {
    const now = new Date();
    const user: User = {
      id: randomBytes(12).toString('hex'),
      phone,
      firstName: null,
      lastName: null,
      birthDate: null,
      createdAt: now,
      updatedAt: now,
    };
    this.users.set(user.id, user);
    return user;
  }

  async updateProfile(id: string, profile: UpdateProfileInput): Promise<User> {
    const existing = this.users.get(id);
    if (!existing) throw new Error(`User ${id} not found`);
    const user: User = { ...existing, ...profile, updatedAt: new Date() };
    this.users.set(id, user);
    return user;
  }
}
