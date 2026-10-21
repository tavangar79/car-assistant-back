import { NotFoundError, ValidationError } from '../../shared/errors.ts';
import {
  detectImageType,
  IMAGE_CONTENT_TYPES,
  type ImageContentType,
} from '../../shared/image-type.ts';
import type { ServiceItemCatalog } from '../service-items/service-items.ts';
import { FUTURE_TOLERANCE_MS, type OdometerService } from '../vehicles/odometer.service.ts';
import type { VehicleService } from '../vehicles/vehicle.service.ts';
import type { Vehicle } from '../vehicles/vehicle.types.ts';
import type { ServiceInvoiceRepository } from './service-invoice.repository.ts';
import type { ServiceVisitRepository } from './service-visit.repository.ts';
import type {
  CreateServiceVisitInput,
  LineItemInput,
  ServiceInvoice,
  ServiceInvoiceMeta,
  ServiceLineItem,
  ServiceSuggestions,
  ServiceVisit,
  ServiceVisitRecord,
  UpdateServiceVisitInput,
} from './service-visit.types.ts';

export interface ServiceVisitServiceDeps {
  visits: ServiceVisitRepository;
  invoices: ServiceInvoiceRepository;
  /** Ownership checks and the vehicle's current mileage come from here. */
  vehicles: VehicleService;
  /** Raises `Vehicle.mileageKm` when a visit's odometer is higher. */
  odometer: OdometerService;
  items: ServiceItemCatalog;
  now: () => Date;
}

export const SERVICE_LIST_LIMIT = 50;
export const SUGGESTIONS_LIMIT = 10;
export const SERVICE_INVOICE_CONTENT_TYPES: readonly ImageContentType[] = IMAGE_CONTENT_TYPES;
export const SERVICE_INVOICE_BAD_TYPE = 'Must be a JPEG, PNG or WebP image';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export interface InvoiceUpload {
  fileName: string;
  data: Uint8Array;
}

const toLineItem = (input: LineItemInput): ServiceLineItem => ({
  itemId: input.itemId,
  brand: input.brand ?? null,
  cost: input.cost,
  notes: input.notes ?? null,
  nextDueKm: input.nextDueKm ?? null,
  nextDueMonths: input.nextDueMonths ?? null,
});

const totalCost = (lineItems: ServiceLineItem[]) =>
  lineItems.reduce((sum, item) => sum + item.cost, 0);

/** Keeps the first occurrence of each distinct trimmed value, skipping blanks, up to `limit`. */
class DistinctList {
  private readonly values = new Set<string>();

  add(value: string | null): void {
    const trimmed = value?.trim();
    if (trimmed && this.values.size < SUGGESTIONS_LIMIT) this.values.add(trimmed);
  }

  toArray(): string[] {
    return [...this.values];
  }
}

/** Service visits of a user's vehicle. Another user's vehicle or visit is "not found". */
export class ServiceVisitService {
  constructor(private readonly deps: ServiceVisitServiceDeps) {}

  /** Newest `serviceDate` first, at most 50. */
  async list(userId: string, vehicleId: string): Promise<ServiceVisit[]> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const visits = await this.deps.visits.listByVehicle(vehicle.id, SERVICE_LIST_LIMIT);
    const metas = await this.deps.invoices.findMetas(visits.map((visit) => visit.id));
    return visits.map((visit) => this.toServiceVisit(visit, metas.get(visit.id) ?? null));
  }

  async getById(userId: string, vehicleId: string, serviceId: string): Promise<ServiceVisit> {
    const { visit } = await this.findOwned(userId, vehicleId, serviceId);
    return this.withInvoice(visit);
  }

  async create(
    userId: string,
    vehicleId: string,
    input: CreateServiceVisitInput,
  ): Promise<ServiceVisit> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const serviceDate = new Date(input.serviceDate);
    this.validate({ serviceDate, lineItems: input.lineItems });

    const lineItems = input.lineItems.map(toLineItem);
    const visit = await this.deps.visits.create({
      vehicleId: vehicle.id,
      serviceDate,
      odometerKm: input.odometerKm,
      workshop: input.workshop,
      notes: input.notes ?? null,
      lineItems,
      totalCost: totalCost(lineItems),
    });
    await this.raiseMileage(userId, vehicle, visit);
    return this.toServiceVisit(visit, null);
  }

  async update(
    userId: string,
    vehicleId: string,
    serviceId: string,
    input: UpdateServiceVisitInput,
  ): Promise<ServiceVisit> {
    const { vehicle, visit: existing } = await this.findOwned(userId, vehicleId, serviceId);
    const serviceDate = input.serviceDate === undefined ? undefined : new Date(input.serviceDate);
    this.validate({ serviceDate, lineItems: input.lineItems });

    const lineItems = input.lineItems?.map(toLineItem);
    const visit = await this.deps.visits.update(existing.id, {
      serviceDate,
      odometerKm: input.odometerKm,
      workshop: input.workshop,
      notes: input.notes,
      lineItems,
      totalCost: lineItems && totalCost(lineItems),
    });
    await this.raiseMileage(userId, vehicle, visit);
    return this.withInvoice(visit);
  }

  /** Deletes the invoice too. Never changes the vehicle's mileage. */
  async remove(userId: string, vehicleId: string, serviceId: string): Promise<void> {
    const { visit } = await this.findOwned(userId, vehicleId, serviceId);
    await this.deps.invoices.deleteByServiceIds([visit.id]);
    await this.deps.visits.delete(visit.id);
  }

  /** Stores (or replaces) the invoice photo. The type comes from the magic bytes, not the client. */
  async uploadInvoice(
    userId: string,
    vehicleId: string,
    serviceId: string,
    { fileName, data }: InvoiceUpload,
  ): Promise<ServiceVisit> {
    const { visit } = await this.findOwned(userId, vehicleId, serviceId);
    const contentType = detectImageType(data, SERVICE_INVOICE_CONTENT_TYPES);
    if (!contentType) throw new ValidationError({ invoice: [SERVICE_INVOICE_BAD_TYPE] });
    const meta = await this.deps.invoices.save(visit.id, { fileName, contentType, data });
    return this.toServiceVisit(visit, meta);
  }

  async getInvoice(userId: string, vehicleId: string, serviceId: string): Promise<ServiceInvoice> {
    const { visit } = await this.findOwned(userId, vehicleId, serviceId);
    const invoice = await this.deps.invoices.findByServiceId(visit.id);
    if (!invoice) throw new NotFoundError('Invoice');
    return invoice;
  }

  /** Idempotent: deleting a missing invoice still succeeds. */
  async deleteInvoice(userId: string, vehicleId: string, serviceId: string): Promise<ServiceVisit> {
    const { visit } = await this.findOwned(userId, vehicleId, serviceId);
    await this.deps.invoices.deleteByServiceIds([visit.id]);
    return this.toServiceVisit(visit, null);
  }

  /** Workshops and per-item brands typed before, across every vehicle of the user. */
  async suggestions(userId: string): Promise<ServiceSuggestions> {
    const vehicleIds = (await this.deps.vehicles.list(userId)).map((vehicle) => vehicle.id);
    const visits = await this.deps.visits.listByVehicles(vehicleIds);

    const workshops = new DistinctList();
    const brands = new Map<string, DistinctList>();
    for (const visit of visits) {
      workshops.add(visit.workshop);
      for (const item of visit.lineItems) {
        if (!item.brand?.trim()) continue;
        if (!brands.has(item.itemId)) brands.set(item.itemId, new DistinctList());
        brands.get(item.itemId)!.add(item.brand);
      }
    }
    return {
      workshops: workshops.toArray(),
      brands: Object.fromEntries([...brands].map(([itemId, list]) => [itemId, list.toArray()])),
    };
  }

  /** Rules zod can't express: the date bound depends on today, and item ids on the catalog. */
  private validate({
    serviceDate,
    lineItems,
  }: {
    serviceDate?: Date;
    lineItems?: LineItemInput[];
  }): void {
    const details: Record<string, string[]> = {};
    if (serviceDate && serviceDate.getTime() > this.deps.now().getTime() + FUTURE_TOLERANCE_MS) {
      details.serviceDate = ['Must not be in the future'];
    }
    const unknown = (lineItems ?? [])
      .map((item) => item.itemId)
      .filter((itemId) => !this.deps.items.has(itemId));
    if (unknown.length > 0) {
      details.lineItems = unknown.map((itemId) => `Unknown item: ${itemId}`);
    }
    if (Object.keys(details).length > 0) throw new ValidationError(details);
  }

  /** Mileage rule: a higher odometer becomes a reading dated `serviceDate`; a lower one is a back-dated visit. */
  private async raiseMileage(
    userId: string,
    vehicle: Vehicle,
    visit: ServiceVisitRecord,
  ): Promise<void> {
    if (visit.odometerKm <= vehicle.mileageKm) return;
    await this.deps.odometer.record(userId, vehicle.id, {
      mileageKm: visit.odometerKm,
      recordedAt: visit.serviceDate.toISOString(),
    });
  }

  /** 404 for another user's vehicle, a malformed id, an unknown id, or another vehicle's visit. */
  private async findOwned(
    userId: string,
    vehicleId: string,
    serviceId: string,
  ): Promise<{ vehicle: Vehicle; visit: ServiceVisitRecord }> {
    const vehicle = await this.deps.vehicles.getById(userId, vehicleId);
    const visit = OBJECT_ID_PATTERN.test(serviceId)
      ? await this.deps.visits.findForVehicle(serviceId, vehicle.id)
      : null;
    if (!visit) throw new NotFoundError('Service');
    return { vehicle, visit };
  }

  private async withInvoice(visit: ServiceVisitRecord): Promise<ServiceVisit> {
    const metas = await this.deps.invoices.findMetas([visit.id]);
    return this.toServiceVisit(visit, metas.get(visit.id) ?? null);
  }

  private toServiceVisit(
    visit: ServiceVisitRecord,
    invoice: ServiceInvoiceMeta | null,
  ): ServiceVisit {
    return {
      ...visit,
      invoice,
      invoiceUrl: invoice
        ? `/api/vehicles/${visit.vehicleId}/services/${visit.id}/invoice?v=${invoice.updatedAt.getTime()}`
        : null,
    };
  }
}
