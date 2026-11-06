import type { PrismaClient } from '@prisma/client';
import type {
  NewServiceInvoice,
  ServiceInvoiceMeta,
  StoredServiceInvoice,
} from './service-visit.types.ts';

export interface ServiceInvoiceRepository {
  findByServiceId(serviceId: string): Promise<StoredServiceInvoice | null>;
  /** Invoice facts, keyed by service id. Visits without an invoice are absent. */
  findMetas(serviceIds: string[]): Promise<Map<string, ServiceInvoiceMeta>>;
  /** Creates or replaces the visit's invoice row. */
  save(serviceId: string, invoice: NewServiceInvoice): Promise<ServiceInvoiceMeta>;
  /** The storage keys of the removed rows; visits without an invoice add none. */
  deleteByServiceIds(serviceIds: string[]): Promise<string[]>;
}

const META_FIELDS = {
  fileName: true,
  contentType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaServiceInvoiceRepository implements ServiceInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByServiceId(serviceId: string): Promise<StoredServiceInvoice | null> {
    return this.prisma.serviceInvoice.findUnique({
      where: { serviceId },
      select: { ...META_FIELDS, storageKey: true },
    });
  }

  async findMetas(serviceIds: string[]): Promise<Map<string, ServiceInvoiceMeta>> {
    const invoices = await this.prisma.serviceInvoice.findMany({
      where: { serviceId: { in: serviceIds } },
      select: { ...META_FIELDS, serviceId: true },
    });
    return new Map(invoices.map(({ serviceId, ...meta }) => [serviceId, meta]));
  }

  save(serviceId: string, invoice: NewServiceInvoice): Promise<ServiceInvoiceMeta> {
    return this.prisma.serviceInvoice.upsert({
      where: { serviceId },
      create: { serviceId, ...invoice },
      update: invoice,
      select: META_FIELDS,
    });
  }

  async deleteByServiceIds(serviceIds: string[]): Promise<string[]> {
    if (serviceIds.length === 0) return [];
    const where = { serviceId: { in: serviceIds } };
    const rows = await this.prisma.serviceInvoice.findMany({ where, select: { storageKey: true } });
    await this.prisma.serviceInvoice.deleteMany({ where });
    return rows.map((row) => row.storageKey);
  }
}
