import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { createPrismaClient } from './lib/prisma.ts';
import { PrismaVehicleRepository } from './modules/vehicles/vehicle.repository.ts';

const env = loadEnv();
const prisma = createPrismaClient();

const app = createApp({
  vehicleRepository: new PrismaVehicleRepository(prisma),
});

const server = app.listen(env.PORT, () => {
  console.log(`API listening on http://localhost:${env.PORT}`);
});

async function shutdown(): Promise<void> {
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
