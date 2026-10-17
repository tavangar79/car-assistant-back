import type { AppDependencies } from '../app.ts';
import { AVATAR_MAX_BYTES } from '../modules/auth/avatar-upload.ts';
import { createOtpHasher } from '../modules/auth/otp-code.ts';
import { TokenService } from '../modules/auth/token.service.ts';
import { VEHICLE_PHOTO_MAX_BYTES } from '../modules/vehicles/vehicle.routes.ts';
import { FakeSmsSender } from './fake-sms-sender.ts';
import { InMemoryAvatarRepository } from './in-memory-avatar.repository.ts';
import { InMemoryOtpRepository } from './in-memory-otp.repository.ts';
import { InMemoryUserRepository } from './in-memory-user.repository.ts';
import { InMemoryVehiclePhotoRepository } from './in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository.ts';

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret';

/** In-memory dependencies for `createApp`. Override any of them per test. */
export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    vehicleRepository: new InMemoryVehicleRepository(),
    vehiclePhotoRepository: new InMemoryVehiclePhotoRepository(),
    vehiclePhotoMaxBytes: VEHICLE_PHOTO_MAX_BYTES,
    userRepository: new InMemoryUserRepository(),
    avatarRepository: new InMemoryAvatarRepository(),
    avatarMaxBytes: AVATAR_MAX_BYTES,
    otpRepository: new InMemoryOtpRepository(),
    smsSender: new FakeSmsSender(),
    tokenService: new TokenService(TEST_JWT_SECRET, '30d'),
    generateOtpCode: () => '12345',
    hashOtpCode: createOtpHasher(TEST_JWT_SECRET),
    now: () => new Date(),
    otpSettings: {
      codeLength: 5,
      ttlSeconds: 120,
      resendCooldownSeconds: 60,
      maxAttempts: 5,
      maxRequestsPerWindow: 5,
      requestWindowSeconds: 3600,
      rateLimitEnabled: true,
    },
    authIpRateLimit: { max: 1000, windowSeconds: 900 },
    cors: { origins: [], allowLocalhost: true },
    ...overrides,
  };
}
