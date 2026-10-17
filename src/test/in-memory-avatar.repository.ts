import type { NewUserAvatar, UserAvatar } from '../modules/auth/auth.types.ts';
import type { AvatarRepository } from '../modules/auth/avatar.repository.ts';

export class InMemoryAvatarRepository implements AvatarRepository {
  readonly avatars = new Map<string, UserAvatar>();

  async findByUserId(userId: string): Promise<UserAvatar | null> {
    return this.avatars.get(userId) ?? null;
  }

  async findUpdatedAt(userId: string): Promise<Date | null> {
    return this.avatars.get(userId)?.updatedAt ?? null;
  }

  async save(userId: string, avatar: NewUserAvatar): Promise<UserAvatar> {
    const saved: UserAvatar = { ...avatar, updatedAt: new Date() };
    this.avatars.set(userId, saved);
    return saved;
  }

  async delete(userId: string): Promise<void> {
    this.avatars.delete(userId);
  }
}
