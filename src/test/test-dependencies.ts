import type { AppDependencies } from '../app.ts';
import { createOtpHasher } from '../modules/auth/otp-code.ts';
import { TokenService } from '../modules/auth/token.service.ts';
import { FakeSmsSender } from './fake-sms-sender.ts';
import { InMemoryOtpRepository } from './in-memory-otp.repository.ts';
import { InMemoryUserRepository } from './in-memory-user.repository.ts';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository.ts';

export const TEST_JWT_SECRET = 'test-secret-test-secret-test-secret';

/** In-memory dependencies for `createApp`. Override any of them per test. */
export function createTestDependencies(overrides: Partial<AppDependencies> = {}): AppDependencies {
  return {
    vehicleRepository: new InMemoryVehicleRepository(),
    userRepository: new InMemoryUserRepository(),
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
    },
    authIpRateLimit: { max: 1000, windowSeconds: 900 },
    ...overrides,
  };
}
