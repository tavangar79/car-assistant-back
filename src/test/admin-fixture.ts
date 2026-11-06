import { TokenService } from '../modules/auth/token.service.ts';
import { InMemoryAdminRepository } from './in-memory-admin.repository.ts';
import { TEST_ADMIN_JWT_SECRET } from './test-dependencies.ts';

export const TEST_ADMIN_ID = 'adadadadadadadadadadadad';
export const adminTokens = new TokenService(TEST_ADMIN_JWT_SECRET, '10d', 'admin');

/** One existing admin and its `Authorization` header. Pass `adminRepository` to createTestDependencies. */
export function adminFixture() {
  const now = new Date();
  const adminRepository = new InMemoryAdminRepository([
    {
      id: TEST_ADMIN_ID,
      username: 'root',
      passwordHash: 'unused',
      totpSecret: 'unused',
      lastTotpStep: null,
      createdAt: now,
      updatedAt: now,
    },
  ]);
  return { adminRepository, ADMIN: `Bearer ${adminTokens.sign(TEST_ADMIN_ID)}` };
}
