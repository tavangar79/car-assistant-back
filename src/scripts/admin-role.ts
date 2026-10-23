// `npm run admin:grant -- 0912…` / `npm run admin:revoke -- 0912…`.
// Exits with code 1 (and a message) for a missing, invalid or unknown phone.
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma.ts';
import { setUserRole, UserRoleError } from '../modules/auth/user-role.ts';
import { PrismaUserRepository } from '../modules/auth/user.repository.ts';

const [action, phone] = process.argv.slice(2);
if ((action !== 'grant' && action !== 'revoke') || !phone) {
  console.error('Usage: npm run admin:grant -- <phone>  |  npm run admin:revoke -- <phone>');
  process.exit(1);
}

const prisma = createPrismaClient();
try {
  const role = action === 'grant' ? 'admin' : 'user';
  const normalized = await setUserRole(new PrismaUserRepository(prisma), phone, role);
  console.log(`${normalized} is now ${role}`);
} catch (error) {
  if (!(error instanceof UserRoleError)) throw error;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
