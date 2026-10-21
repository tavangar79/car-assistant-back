import express, { type Express } from 'express';
import { cors, type CorsSettings } from './shared/cors.ts';
import { errorHandler, notFoundHandler } from './shared/error-handler.ts';
import { ipRateLimit, type IpRateLimitSettings } from './shared/ip-rate-limit.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import { authRoutes } from './modules/auth/auth.routes.ts';
import { AuthService } from './modules/auth/auth.service.ts';
import type { OtpSettings } from './modules/auth/auth.types.ts';
import type { AvatarRepository } from './modules/auth/avatar.repository.ts';
import type { CodeGenerator, OtpHasher } from './modules/auth/otp-code.ts';
import type { OtpRepository } from './modules/auth/otp.repository.ts';
import { requireAuth } from './modules/auth/require-auth.ts';
import type { SmsSender } from './modules/auth/sms-sender.ts';
import type { TokenService } from './modules/auth/token.service.ts';
import type { UserRepository } from './modules/auth/user.repository.ts';
import { SERVICE_INTERVALS } from './modules/service-intervals/service-interval.data.ts';
import type { ServiceIntervalRepository } from './modules/service-intervals/service-interval.repository.ts';
import { serviceIntervalRoutes } from './modules/service-intervals/service-interval.routes.ts';
import { ServiceIntervalService } from './modules/service-intervals/service-interval.service.ts';
import { SERVICE_ITEMS } from './modules/service-items/service-items.data.ts';
import { serviceItemRoutes } from './modules/service-items/service-items.routes.ts';
import { ServiceItemCatalog } from './modules/service-items/service-items.ts';
import type { ServiceInvoiceRepository } from './modules/service-visits/service-invoice.repository.ts';
import { serviceSuggestionRoutes } from './modules/service-visits/service-suggestions.routes.ts';
import type { ServiceVisitRepository } from './modules/service-visits/service-visit.repository.ts';
import { serviceVisitRoutes } from './modules/service-visits/service-visit.routes.ts';
import { ServiceVisitService } from './modules/service-visits/service-visit.service.ts';
import { VEHICLE_CATALOG } from './modules/vehicle-catalog/vehicle-catalog.data.ts';
import { vehicleCatalogRoutes } from './modules/vehicle-catalog/vehicle-catalog.routes.ts';
import { VehicleCatalog } from './modules/vehicle-catalog/vehicle-catalog.ts';
import type { OdometerReadingRepository } from './modules/vehicles/odometer.repository.ts';
import { odometerRoutes } from './modules/vehicles/odometer.routes.ts';
import { OdometerService } from './modules/vehicles/odometer.service.ts';
import type { VehiclePhotoRepository } from './modules/vehicles/vehicle-photo.repository.ts';
import type { VehicleRepository } from './modules/vehicles/vehicle.repository.ts';
import { vehicleRoutes } from './modules/vehicles/vehicle.routes.ts';
import { VehicleService } from './modules/vehicles/vehicle.service.ts';

// Everything the app needs from the outside world. Tests pass in-memory fakes.
export interface AppDependencies {
  vehicleRepository: VehicleRepository;
  vehiclePhotoRepository: VehiclePhotoRepository;
  /** Largest accepted vehicle photo upload, in bytes. */
  vehiclePhotoMaxBytes: number;
  odometerReadingRepository: OdometerReadingRepository;
  serviceVisitRepository: ServiceVisitRepository;
  serviceInvoiceRepository: ServiceInvoiceRepository;
  /** Largest accepted invoice photo upload, in bytes. */
  serviceInvoiceMaxBytes: number;
  serviceIntervalRepository: ServiceIntervalRepository;
  userRepository: UserRepository;
  avatarRepository: AvatarRepository;
  /** Largest accepted avatar upload, in bytes. */
  avatarMaxBytes: number;
  otpRepository: OtpRepository;
  smsSender: SmsSender;
  tokenService: TokenService;
  generateOtpCode: CodeGenerator;
  hashOtpCode: OtpHasher;
  now: () => Date;
  otpSettings: OtpSettings;
  authIpRateLimit: IpRateLimitSettings;
  cors: CorsSettings;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(cors(deps.cors));
  app.use(express.json());

  // Reusable guard for protected routes: router.get('/x', authenticate, handler).
  const authenticate = requireAuth(deps.tokenService);
  const authService = new AuthService({
    users: deps.userRepository,
    avatars: deps.avatarRepository,
    otps: deps.otpRepository,
    sms: deps.smsSender,
    tokens: deps.tokenService,
    generateCode: deps.generateOtpCode,
    hashCode: deps.hashOtpCode,
    now: deps.now,
    settings: deps.otpSettings,
  });

  app.use('/health', healthRoutes());
  app.use(
    '/api/auth',
    authRoutes(authService, {
      authenticate,
      limitByIp: deps.otpSettings.rateLimitEnabled
        ? ipRateLimit(deps.authIpRateLimit)
        : (_req, _res, next) => next(),
      codeLength: deps.otpSettings.codeLength,
      now: deps.now,
      avatarMaxBytes: deps.avatarMaxBytes,
    }),
  );
  // Static data, no I/O, so it is built here rather than injected.
  const vehicleCatalog = new VehicleCatalog(VEHICLE_CATALOG);
  const serviceItems = new ServiceItemCatalog(SERVICE_ITEMS);
  const vehicleService = new VehicleService({
    vehicles: deps.vehicleRepository,
    photos: deps.vehiclePhotoRepository,
    readings: deps.odometerReadingRepository,
    serviceVisits: deps.serviceVisitRepository,
    serviceInvoices: deps.serviceInvoiceRepository,
    serviceIntervals: deps.serviceIntervalRepository,
    catalog: vehicleCatalog,
    now: deps.now,
  });
  app.use('/api/vehicle-catalog', authenticate, vehicleCatalogRoutes(vehicleCatalog));
  app.use('/api/service-items', authenticate, serviceItemRoutes(serviceItems));
  const odometerService = new OdometerService({
    readings: deps.odometerReadingRepository,
    vehicles: vehicleService,
    now: deps.now,
  });
  const serviceVisitService = new ServiceVisitService({
    visits: deps.serviceVisitRepository,
    invoices: deps.serviceInvoiceRepository,
    vehicles: vehicleService,
    odometer: odometerService,
    items: serviceItems,
    now: deps.now,
  });
  const serviceIntervalService = new ServiceIntervalService({
    definitions: SERVICE_INTERVALS,
    overrides: deps.serviceIntervalRepository,
    vehicles: vehicleService,
    visits: deps.serviceVisitRepository,
    readings: deps.odometerReadingRepository,
    now: deps.now,
  });
  app.use('/api/service-suggestions', authenticate, serviceSuggestionRoutes(serviceVisitService));
  app.use(
    '/api/vehicles',
    authenticate,
    vehicleRoutes(vehicleService, deps.vehiclePhotoMaxBytes),
    odometerRoutes(odometerService),
    serviceVisitRoutes(serviceVisitService, deps.serviceInvoiceMaxBytes),
    serviceIntervalRoutes(serviceIntervalService),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
