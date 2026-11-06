import type { NewUserAvatar, StoredUserAvatar } from '../modules/auth/auth.types.ts';
import type { AvatarRepository } from '../modules/auth/avatar.repository.ts';

export class InMemoryAvatarRepository implements AvatarRepository {
  readonly avatars = new Map<string, StoredUserAvatar>();
  /** Set to make `save` throw (a database outage). */
  failSaves = false;

  async findByUserId(userId: string): Promise<StoredUserAvatar | null> {
    return this.avatars.get(userId) ?? null;
  }

  async findUpdatedAt(userId: string): Promise<Date | null> {
    return this.avatars.get(userId)?.updatedAt ?? null;
  }

  async save(userId: string, avatar: NewUserAvatar): Promise<StoredUserAvatar> {
    if (this.failSaves) throw new Error('database is down');
    const saved: StoredUserAvatar = { ...avatar, updatedAt: new Date() };
    this.avatars.set(userId, saved);
    return saved;
  }

  async delete(userId: string): Promise<string[]> {
    const avatar = this.avatars.get(userId);
    this.avatars.delete(userId);
    return avatar ? [avatar.storageKey] : [];
  }
}
