import { randomBytes } from 'node:crypto';
import type { Admin, AdminRepository, NewAdmin } from '../modules/admin/admin.repository.ts';

export class InMemoryAdminRepository implements AdminRepository {
  private admins = new Map<string, Admin>();

  constructor(seed: Admin[] = []) {
    for (const admin of seed) this.admins.set(admin.id, admin);
  }

  async findById(id: string): Promise<Admin | null> {
    return this.admins.get(id) ?? null;
  }

  async findByUsername(username: string): Promise<Admin | null> {
    return [...this.admins.values()].find((admin) => admin.username === username) ?? null;
  }

  async replaceAll(admin: NewAdmin): Promise<Admin> {
    const now = new Date();
    const created: Admin = {
      ...admin,
      id: randomBytes(12).toString('hex'),
      lastTotpStep: null,
      createdAt: now,
      updatedAt: now,
    };
    this.admins = new Map([[created.id, created]]);
    return created;
  }

  async acceptTotpStep(id: string, step: number): Promise<boolean> {
    const admin = this.admins.get(id);
    if (!admin || (admin.lastTotpStep !== null && admin.lastTotpStep >= step)) return false;
    this.admins.set(id, { ...admin, lastTotpStep: step, updatedAt: new Date() });
    return true;
  }

  count(): number {
    return this.admins.size;
  }
}
