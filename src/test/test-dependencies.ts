import type { AppDependencies } from '../app.ts';
import { AVATAR_MAX_BYTES } from '../modules/auth/avatar-upload.ts';
import { createOtpHasher } from '../modules/auth/otp-code.ts';
import { TokenService } from '../modules/auth/token.service.ts';
import { SERVICE_INVOICE_MAX_BYTES } from '../modules/service-visits/service-visit.routes.ts';
import { VEHICLE_PHOTO_MAX_BYTES } from '../modules/vehicles/vehicle.routes.ts';
import { FakeSmsSender } from './fake-sms-sender.ts';
import { InMemoryAvatarRepository } from './in-memory-avatar.repository.ts';
import { InMemoryOdometerReadingRepository } from './in-memory-odometer.repository.ts';
import { InMemoryOtpRepository } from './in-memory-otp.repository.ts';
import { InMemoryServiceIntervalRepository } from './in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from './in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from './in-memory-service-visit.repository.ts';
import { InMemoryUserRepository } from './in-memory-user.repository.ts';
import { InMemoryVehiclePhotoRepository } from './in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository.ts';

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret';

/** In-memory dependencies for `createApp`. Override any of them per test. */
export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  const vehicleRepository = overrides.vehicleRepository ?? new InMemoryVehicleRepository();
  return {
    vehicleRepository,
    vehiclePhotoRepository: new InMemoryVehiclePhotoRepository(),
    vehiclePhotoMaxBytes: VEHICLE_PHOTO_MAX_BYTES,
    odometerReadingRepository: new InMemoryOdometerReadingRepository(vehicleRepository),
    serviceVisitRepository: new InMemoryServiceVisitRepository(),
    serviceInvoiceRepository: new InMemoryServiceInvoiceRepository(),
    serviceInvoiceMaxBytes: SERVICE_INVOICE_MAX_BYTES,
    serviceIntervalRepository: new InMemoryServiceIntervalRepository(),
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
