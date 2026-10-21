import { z } from 'zod';
import { MAX_MILEAGE_KM } from '../vehicles/vehicle.types.ts';

export const SERVICE_LINE_ITEMS_MAX = 30;
export const NEXT_DUE_KM_MIN = 100;
export const NEXT_DUE_KM_MAX = 200_000;
export const NEXT_DUE_MONTHS_MAX = 120;

const text = (max: number) => z.string().trim().min(1).max(max);

const lineItemSchema = z.object({
  itemId: z.string().min(1),
  brand: text(100).nullish(),
  cost: z.number().int().min(0),
  notes: text(500).nullish(),
  nextDueKm: z.number().int().min(NEXT_DUE_KM_MIN).max(NEXT_DUE_KM_MAX).nullish(),
  nextDueMonths: z.number().int().min(1).max(NEXT_DUE_MONTHS_MAX).nullish(),
});

const lineItemsSchema = z
  .array(lineItemSchema)
  .min(1)
  .max(SERVICE_LINE_ITEMS_MAX)
  .refine(
    (items) => new Set(items.map((item) => item.itemId)).size === items.length,
    'Item ids must be unique',
  );

// "Not in the future" depends on today, and catalog membership on the catalog, so the service checks both.
export const createServiceVisitSchema = z.object({
  serviceDate: z.string().datetime({ offset: true }),
  odometerKm: z.number().int().min(0).max(MAX_MILEAGE_KM),
  workshop: text(100),
  notes: text(1000).nullish(),
  lineItems: lineItemsSchema,
});

/** `lineItems`, when present, replaces the whole list. */
export const updateServiceVisitSchema = createServiceVisitSchema.partial();

export type LineItemInput = z.infer<typeof lineItemSchema>;
export type CreateServiceVisitInput = z.infer<typeof createServiceVisitSchema>;
export type UpdateServiceVisitInput = z.infer<typeof updateServiceVisitSchema>;

export interface ServiceLineItem {
  itemId: string;
  brand: string | null;
  /** Part and labour together, in toman. */
  cost: number;
  notes: string | null;
  /** Sticker reminder: km after the visit's `odometerKm`. */
  nextDueKm: number | null;
  /** Sticker reminder: months after `serviceDate`. */
  nextDueMonths: number | null;
}

/** A visit as stored. */
export interface ServiceVisitRecord {
  id: string;
  vehicleId: string;
  serviceDate: Date;
  odometerKm: number;
  workshop: string;
  notes: string | null;
  lineItems: ServiceLineItem[];
  totalCost: number;
  createdAt: Date;
  updatedAt: Date;
}

export type NewServiceVisit = Omit<ServiceVisitRecord, 'id' | 'createdAt' | 'updatedAt'>;
export type ServiceVisitChanges = Partial<Omit<NewServiceVisit, 'vehicleId'>>;

/** Invoice facts without the bytes. */
export interface ServiceInvoiceMeta {
  fileName: string;
  contentType: string;
  sizeBytes: number;
  updatedAt: Date;
}

export interface ServiceInvoice extends ServiceInvoiceMeta {
  data: Uint8Array;
}

export type NewServiceInvoice = Omit<ServiceInvoice, 'updatedAt' | 'sizeBytes'>;

/** Values typed before across the caller's garage, most recent `serviceDate` first, at most 10 each. */
export interface ServiceSuggestions {
  workshops: string[];
  /** Keyed by item id; items without a brand are absent. */
  brands: Record<string, string[]>;
}

/** A visit as exposed by the API. */
export interface ServiceVisit extends ServiceVisitRecord {
  invoice: ServiceInvoiceMeta | null;
  /** `/api/vehicles/:id/services/:serviceId/invoice?v=<updatedAt ms>`, or null without an invoice. */
  invoiceUrl: string | null;
}
