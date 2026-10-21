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
import { dashboardRoutes } from './modules/dashboard/dashboard.routes.ts';
import { DashboardService } from './modules/dashboard/dashboard.service.ts';
import type { ExpenseAttachmentRepository } from './modules/expenses/expense-attachment.repository.ts';
import type { ExpenseRepository } from './modules/expenses/expense.repository.ts';
import { expenseRoutes } from './modules/expenses/expense.routes.ts';
import { ExpenseService } from './modules/expenses/expense.service.ts';
import type { FuelLogRepository } from './modules/fuel-logs/fuel-log.repository.ts';
import { fuelLogRoutes } from './modules/fuel-logs/fuel-log.routes.ts';
import { FuelLogService } from './modules/fuel-logs/fuel-log.service.ts';
import { historyRoutes } from './modules/history/history.routes.ts';
import { HistoryService } from './modules/history/history.service.ts';
import { profileRoutes } from './modules/profile/profile.routes.ts';
import { ProfileService } from './modules/profile/profile.service.ts';
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
  fuelLogRepository: FuelLogRepository;
  expenseRepository: ExpenseRepository;
  expenseAttachmentRepository: ExpenseAttachmentRepository;
  /** Largest accepted expense attachment upload, in bytes. */
  expenseAttachmentMaxBytes: number;
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
    fuelLogs: deps.fuelLogRepository,
    expenses: deps.expenseRepository,
    expenseAttachments: deps.expenseAttachmentRepository,
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
  const fuelLogService = new FuelLogService({
    logs: deps.fuelLogRepository,
    vehicles: vehicleService,
    odometer: odometerService,
    now: deps.now,
  });
  const expenseService = new ExpenseService({
    expenses: deps.expenseRepository,
    attachments: deps.expenseAttachmentRepository,
    vehicles: vehicleService,
    now: deps.now,
  });
  const historyService = new HistoryService({
    vehicles: vehicleService,
    visits: deps.serviceVisitRepository,
    invoices: deps.serviceInvoiceRepository,
    fuelLogs: deps.fuelLogRepository,
    expenses: deps.expenseRepository,
    attachments: deps.expenseAttachmentRepository,
    items: serviceItems,
  });
  const dashboardService = new DashboardService({
    vehicles: vehicleService,
    history: historyService,
    intervals: serviceIntervalService,
    now: deps.now,
  });
  const profileService = new ProfileService({
    vehicles: vehicleService,
    visits: deps.serviceVisitRepository,
  });
  app.use('/api/service-suggestions', authenticate, serviceSuggestionRoutes(serviceVisitService));
  app.use('/api/history', authenticate, historyRoutes(historyService));
  app.use('/api/dashboard', authenticate, dashboardRoutes(dashboardService));
  app.use('/api/profile', authenticate, profileRoutes(profileService));
  app.use(
    '/api/vehicles',
    authenticate,
    vehicleRoutes(vehicleService, deps.vehiclePhotoMaxBytes),
    odometerRoutes(odometerService),
    serviceVisitRoutes(serviceVisitService, deps.serviceInvoiceMaxBytes),
    serviceIntervalRoutes(serviceIntervalService),
    fuelLogRoutes(fuelLogService),
    expenseRoutes(expenseService, deps.expenseAttachmentMaxBytes),
  );

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
