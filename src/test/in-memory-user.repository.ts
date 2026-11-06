import { randomBytes } from 'node:crypto';
import type {
  UpdateProfileInput,
  User,
  UserBlock,
  UserListQuery,
} from '../modules/auth/auth.types.ts';
import { toAsciiDigits } from '../modules/auth/phone.ts';
import type { UserRepository } from '../modules/auth/user.repository.ts';

/** A user row with only `id` and `phone` required, for seeding fakes. */
export type UserSeed = Pick<User, 'id' | 'phone'> & Partial<User>;

export function userRow(seed: UserSeed): User {
  const now = new Date();
  return {
    firstName: null,
    lastName: null,
    birthDate: null,
    blockedAt: null,
    blockReason: null,
    createdAt: now,
    updatedAt: now,
    ...seed,
  };
}

export class InMemoryUserRepository implements UserRepository {
  private readonly users = new Map<string, User>();

  constructor(seed: UserSeed[] = []) {
    for (const user of seed) this.users.set(user.id, userRow(user));
  }

  async findById(id: string): Promise<User | null> {
    return this.users.get(id) ?? null;
  }

  async findByPhone(phone: string): Promise<User | null> {
    return [...this.users.values()].find((user) => user.phone === phone) ?? null;
  }

  async create(phone: string): Promise<User> {
    const user = userRow({ id: randomBytes(12).toString('hex'), phone });
    this.users.set(user.id, user);
    return user;
  }

  async updateProfile(id: string, profile: Partial<UpdateProfileInput>): Promise<User> {
    const defined = Object.fromEntries(
      Object.entries(profile).filter(([, value]) => value !== undefined),
    );
    return this.change(id, defined);
  }

  async setBlock(id: string, block: UserBlock): Promise<User> {
    return this.change(id, block);
  }

  async list({ search, cursor, limit }: UserListQuery): Promise<User[]> {
    const text = search?.trim().toLowerCase();
    const matches = (user: User) =>
      !text ||
      user.phone.includes(toAsciiDigits(text)) ||
      Boolean(user.firstName?.toLowerCase().includes(text)) ||
      Boolean(user.lastName?.toLowerCase().includes(text));
    return [...this.users.values()]
      .filter((user) => (!cursor || user.id < cursor) && matches(user))
      .sort((a, b) => (a.id < b.id ? 1 : -1))
      .slice(0, limit);
  }

  async countBlocked(): Promise<number> {
    return [...this.users.values()].filter((user) => user.blockedAt !== null).length;
  }

  private change(id: string, changes: Partial<User>): User {
    const existing = this.users.get(id);
    if (!existing) throw new Error(`User ${id} not found`);
    const user: User = { ...existing, ...changes, updatedAt: new Date() };
    this.users.set(id, user);
    return user;
  }
}
