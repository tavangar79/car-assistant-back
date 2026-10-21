import type { PrismaClient } from '@prisma/client';
import type {
  NewServiceInvoice,
  ServiceInvoice,
  ServiceInvoiceMeta,
} from './service-visit.types.ts';

export interface ServiceInvoiceRepository {
  findByServiceId(serviceId: string): Promise<ServiceInvoice | null>;
  /** Invoice facts without bytes, keyed by service id. Visits without an invoice are absent. */
  findMetas(serviceIds: string[]): Promise<Map<string, ServiceInvoiceMeta>>;
  /** Creates or replaces the visit's invoice. */
  save(serviceId: string, invoice: NewServiceInvoice): Promise<ServiceInvoiceMeta>;
  /** No-op for visits without an invoice. */
  deleteByServiceIds(serviceIds: string[]): Promise<void>;
}

const META_FIELDS = {
  fileName: true,
  contentType: true,
  sizeBytes: true,
  updatedAt: true,
} as const;

export class PrismaServiceInvoiceRepository implements ServiceInvoiceRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findByServiceId(serviceId: string): Promise<ServiceInvoice | null> {
    return this.prisma.serviceInvoice.findUnique({
      where: { serviceId },
      select: { ...META_FIELDS, data: true },
    });
  }

  async findMetas(serviceIds: string[]): Promise<Map<string, ServiceInvoiceMeta>> {
    const invoices = await this.prisma.serviceInvoice.findMany({
      where: { serviceId: { in: serviceIds } },
      select: { ...META_FIELDS, serviceId: true },
    });
    return new Map(invoices.map(({ serviceId, ...meta }) => [serviceId, meta]));
  }

  save(
    serviceId: string,
    { fileName, contentType, data }: NewServiceInvoice,
  ): Promise<ServiceInvoiceMeta> {
    // Prisma wants bytes backed by a plain ArrayBuffer; a Node Buffer may sit on a shared pool.
    const invoice = {
      fileName,
      contentType,
      sizeBytes: data.byteLength,
      data: new Uint8Array(data),
    };
    return this.prisma.serviceInvoice.upsert({
      where: { serviceId },
      create: { serviceId, ...invoice },
      update: invoice,
      select: META_FIELDS,
    });
  }

  async deleteByServiceIds(serviceIds: string[]): Promise<void> {
    if (serviceIds.length === 0) return;
    await this.prisma.serviceInvoice.deleteMany({ where: { serviceId: { in: serviceIds } } });
  }
}
