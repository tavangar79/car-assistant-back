import type { ServiceInvoiceRepository } from '../modules/service-visits/service-invoice.repository.ts';
import type {
  NewServiceInvoice,
  ServiceInvoice,
  ServiceInvoiceMeta,
} from '../modules/service-visits/service-visit.types.ts';

const toMeta = ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
}: ServiceInvoice): ServiceInvoiceMeta => ({
  fileName,
  contentType,
  sizeBytes,
  updatedAt,
});

export class InMemoryServiceInvoiceRepository implements ServiceInvoiceRepository {
  readonly invoices = new Map<string, ServiceInvoice>();
  /** Each save is 1 ms later than the previous one, so `invoiceUrl` always changes. */
  private clock = Date.UTC(2026, 0, 1);

  async findByServiceId(serviceId: string): Promise<ServiceInvoice | null> {
    return this.invoices.get(serviceId) ?? null;
  }

  async findMetas(serviceIds: string[]): Promise<Map<string, ServiceInvoiceMeta>> {
    const result = new Map<string, ServiceInvoiceMeta>();
    for (const id of serviceIds) {
      const invoice = this.invoices.get(id);
      if (invoice) result.set(id, toMeta(invoice));
    }
    return result;
  }

  async save(serviceId: string, invoice: NewServiceInvoice): Promise<ServiceInvoiceMeta> {
    const saved: ServiceInvoice = {
      ...invoice,
      sizeBytes: invoice.data.byteLength,
      updatedAt: new Date(this.clock++),
    };
    this.invoices.set(serviceId, saved);
    return toMeta(saved);
  }

  async deleteByServiceIds(serviceIds: string[]): Promise<void> {
    for (const id of serviceIds) this.invoices.delete(id);
  }
}
