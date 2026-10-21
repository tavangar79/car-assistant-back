import type { AppDependencies } from '../app.ts';
import type { NewExpense } from '../modules/expenses/expense.types.ts';
import type { NewFuelLog } from '../modules/fuel-logs/fuel-log.types.ts';
import type { ServiceLineItem } from '../modules/service-visits/service-visit.types.ts';
import { VEHICLE_CATALOG } from '../modules/vehicle-catalog/vehicle-catalog.data.ts';
import { VehicleCatalog } from '../modules/vehicle-catalog/vehicle-catalog.ts';
import { VehicleService } from '../modules/vehicles/vehicle.service.ts';
import { JPEG_BYTES, PDF_BYTES } from './image-fixtures.ts';
import { InMemoryExpenseAttachmentRepository } from './in-memory-expense-attachment.repository.ts';
import { InMemoryExpenseRepository } from './in-memory-expense.repository.ts';
import { InMemoryFuelLogRepository } from './in-memory-fuel-log.repository.ts';
import { InMemoryOdometerReadingRepository } from './in-memory-odometer.repository.ts';
import { InMemoryServiceIntervalRepository } from './in-memory-service-interval.repository.ts';
import { InMemoryServiceInvoiceRepository } from './in-memory-service-invoice.repository.ts';
import { InMemoryServiceVisitRepository } from './in-memory-service-visit.repository.ts';
import { InMemoryVehiclePhotoRepository } from './in-memory-vehicle-photo.repository.ts';
import { InMemoryVehicleRepository } from './in-memory-vehicle.repository.ts';

const lineItem = (itemId: string, cost: number): ServiceLineItem => ({
  itemId,
  brand: null,
  cost,
  notes: null,
  nextDueKm: null,
  nextDueMonths: null,
});

/**
 * In-memory repositories plus a VehicleService over them, with helpers that seed records directly.
 * Spread `repositories` into `createTestDependencies` to exercise the same data over HTTP.
 */
export function createGarage(now: Date) {
  const vehicleRepository = new InMemoryVehicleRepository();
  const repositories = {
    vehicleRepository,
    vehiclePhotoRepository: new InMemoryVehiclePhotoRepository(),
    odometerReadingRepository: new InMemoryOdometerReadingRepository(vehicleRepository),
    serviceVisitRepository: new InMemoryServiceVisitRepository(),
    serviceInvoiceRepository: new InMemoryServiceInvoiceRepository(),
    serviceIntervalRepository: new InMemoryServiceIntervalRepository(),
    fuelLogRepository: new InMemoryFuelLogRepository(),
    expenseRepository: new InMemoryExpenseRepository(),
    expenseAttachmentRepository: new InMemoryExpenseAttachmentRepository(),
  } satisfies Partial<AppDependencies>;

  const vehicleService = new VehicleService({
    vehicles: vehicleRepository,
    photos: repositories.vehiclePhotoRepository,
    readings: repositories.odometerReadingRepository,
    serviceVisits: repositories.serviceVisitRepository,
    serviceInvoices: repositories.serviceInvoiceRepository,
    serviceIntervals: repositories.serviceIntervalRepository,
    fuelLogs: repositories.fuelLogRepository,
    expenses: repositories.expenseRepository,
    expenseAttachments: repositories.expenseAttachmentRepository,
    catalog: new VehicleCatalog(VEHICLE_CATALOG),
    now: () => now,
  });

  return {
    repositories,
    vehicleService,

    /** A vehicle whose plate differs by `threeDigits`. */
    async addVehicle(userId: string, threeDigits = '345', mileageKm = 34500): Promise<string> {
      const vehicle = await vehicleService.create(userId, {
        nickname: 'تارا',
        plate: { twoDigits: '72', letter: 'ب', threeDigits, provinceCode: '68' },
        makeId: 'iran-khodro',
        modelId: 'tara',
        yearJalali: 1402,
        mileageKm,
      });
      return vehicle.id;
    },

    /** `items` maps item id to cost. */
    async addService(
      vehicleId: string,
      serviceDate: string,
      items: Record<string, number>,
      { invoice = false, odometerKm = 30000 } = {},
    ): Promise<string> {
      const lineItems = Object.entries(items).map(([itemId, cost]) => lineItem(itemId, cost));
      const visit = await repositories.serviceVisitRepository.create({
        vehicleId,
        serviceDate: new Date(serviceDate),
        odometerKm,
        workshop: 'اتوسرویس البرز',
        notes: null,
        lineItems,
        totalCost: lineItems.reduce((sum, item) => sum + item.cost, 0),
      });
      if (invoice) {
        await repositories.serviceInvoiceRepository.save(visit.id, {
          fileName: 'invoice.jpg',
          contentType: 'image/jpeg',
          data: JPEG_BYTES,
        });
      }
      return visit.id;
    },

    async addFuel(
      vehicleId: string,
      fueledAt: string,
      overrides: Partial<NewFuelLog> = {},
    ): Promise<string> {
      const log = await repositories.fuelLogRepository.create({
        vehicleId,
        fueledAt: new Date(fueledAt),
        odometerKm: 30000,
        fuelType: 'super',
        volume: 40,
        totalCost: 120000,
        isFullFill: false,
        station: null,
        paymentMethod: null,
        notes: null,
        ...overrides,
      });
      return log.id;
    },

    async addExpense(
      vehicleId: string,
      paidAt: string,
      overrides: Partial<NewExpense> = {},
      { attachment = false } = {},
    ): Promise<string> {
      const expense = await repositories.expenseRepository.create({
        vehicleId,
        category: 'third_party_insurance',
        amount: 5850000,
        title: null,
        referenceNumber: null,
        paidAt: new Date(paidAt),
        expiresAt: null,
        expiryReminder: true,
        paymentMethod: null,
        issuer: null,
        ...overrides,
      });
      if (attachment) {
        await repositories.expenseAttachmentRepository.save(expense.id, {
          fileName: 'policy.pdf',
          contentType: 'application/pdf',
          data: PDF_BYTES,
        });
      }
      return expense.id;
    },
  };
}

export type Garage = ReturnType<typeof createGarage>;
