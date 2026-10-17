import { createApp } from './app.ts';
import { loadEnv } from './config/env.ts';
import { createPrismaClient } from './lib/prisma.ts';
import { PrismaAvatarRepository } from './modules/auth/avatar.repository.ts';
import { AVATAR_MAX_BYTES } from './modules/auth/avatar-upload.ts';
import { createCodeGenerator, createOtpHasher } from './modules/auth/otp-code.ts';
import { PrismaOtpRepository } from './modules/auth/otp.repository.ts';
import { createSmsSender } from './modules/auth/sms-sender.ts';
import { TokenService } from './modules/auth/token.service.ts';
import { PrismaUserRepository } from './modules/auth/user.repository.ts';
import { PrismaVehiclePhotoRepository } from './modules/vehicles/vehicle-photo.repository.ts';
import { PrismaVehicleRepository } from './modules/vehicles/vehicle.repository.ts';
import { VEHICLE_PHOTO_MAX_BYTES } from './modules/vehicles/vehicle.routes.ts';

const env = loadEnv();
const prisma = createPrismaClient();

const app = createApp({
  vehicleRepository: new PrismaVehicleRepository(prisma),
  vehiclePhotoRepository: new PrismaVehiclePhotoRepository(prisma),
  vehiclePhotoMaxBytes: VEHICLE_PHOTO_MAX_BYTES,
  userRepository: new PrismaUserRepository(prisma),
  avatarRepository: new PrismaAvatarRepository(prisma),
  avatarMaxBytes: AVATAR_MAX_BYTES,
  otpRepository: new PrismaOtpRepository(prisma),
  smsSender: createSmsSender(env),
  tokenService: new TokenService(env.JWT_SECRET, env.JWT_EXPIRES_IN),
  generateOtpCode: createCodeGenerator(env.OTP_LENGTH, env.OTP_FIXED_CODE),
  // Reuses JWT_SECRET (domain-separated inside the hasher): one secret to manage, and rotating
  // it only invalidates codes that live for a couple of minutes.
  hashOtpCode: createOtpHasher(env.JWT_SECRET),
  now: () => new Date(),
  otpSettings: {
    codeLength: env.OTP_LENGTH,
    ttlSeconds: env.OTP_TTL_SECONDS,
    resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
    maxAttempts: env.OTP_MAX_ATTEMPTS,
    maxRequestsPerWindow: env.OTP_MAX_REQUESTS_PER_WINDOW,
    requestWindowSeconds: env.OTP_REQUEST_WINDOW_SECONDS,
    rateLimitEnabled: env.OTP_RATE_LIMIT_ENABLED,
  },
  authIpRateLimit: {
    max: env.AUTH_IP_RATE_LIMIT_MAX,
    windowSeconds: env.AUTH_IP_RATE_LIMIT_WINDOW_SECONDS,
  },
  cors: {
    origins: env.CORS_ORIGINS,
    // Flutter web picks a random localhost port in dev; production allows only CORS_ORIGINS.
    allowLocalhost: env.NODE_ENV !== 'production',
  },
});
// Behind N reverse proxies, req.ip (used by the per-IP rate limit) must come from X-Forwarded-For.
app.set('trust proxy', env.TRUST_PROXY_HOPS);

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
