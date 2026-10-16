import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './shared/error-handler.ts';
import { healthRoutes } from './modules/health/health.routes.ts';
import type { VehicleRepository } from './modules/vehicles/vehicle.repository.ts';
import { vehicleRoutes } from './modules/vehicles/vehicle.routes.ts';
import { VehicleService } from './modules/vehicles/vehicle.service.ts';

// Everything the app needs from the outside world. Tests pass in-memory fakes.
export interface AppDependencies {
  vehicleRepository: VehicleRepository;
}

export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.use(express.json());

  app.use('/health', healthRoutes());
  app.use('/api/vehicles', vehicleRoutes(new VehicleService(deps.vehicleRepository)));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
