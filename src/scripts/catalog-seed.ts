// `npm run catalog:seed`: adds the missing global service items and intervals.
// Never overwrites existing rows, so admin edits survive.
import 'dotenv/config';
import { createPrismaClient } from '../lib/prisma.ts';
import { seedIntervals, seedServiceItems } from '../modules/service-catalog/catalog-seed.ts';
import { PrismaIntervalDefRepository } from '../modules/service-catalog/interval-def.repository.ts';
import { PrismaServiceItemDefRepository } from '../modules/service-catalog/service-item-def.repository.ts';

const prisma = createPrismaClient();
try {
  const items = await seedServiceItems(new PrismaServiceItemDefRepository(prisma));
  const intervals = await seedIntervals(new PrismaIntervalDefRepository(prisma));
  console.log(`Created ${items} service items and ${intervals} intervals.`);
} finally {
  await prisma.$disconnect();
}
