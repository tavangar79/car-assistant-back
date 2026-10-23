import { z } from 'zod';
import {
  INTERVAL_KM_MAX,
  INTERVAL_KM_MIN,
  INTERVAL_MONTHS_MAX,
} from '../service-intervals/service-interval.types.ts';
import type { ScopedRow } from './resolve-for-vehicle.ts';

/** The 6 categories from DOMAIN.md, in display order. Static in code; rows reference them by id. */
export const SERVICE_CATEGORIES = [
  { id: 'fluids', title: 'روغن و مایعات مصرفی' },
  { id: 'brakes', title: 'ترمز و ایمنی' },
  { id: 'suspension', title: 'جلوبندی و تعلیق' },
  { id: 'electrical', title: 'برق، باتری و شمع' },
  { id: 'drivetrain', title: 'گیربکس و انتقال قدرت' },
  { id: 'periodic', title: 'سرویس‌های دوره‌ای اصلی' },
] as const;

const CATEGORY_IDS = SERVICE_CATEGORIES.map((category) => category.id) as [
  ServiceCategoryId,
  ...ServiceCategoryId[],
];
export type ServiceCategoryId = (typeof SERVICE_CATEGORIES)[number]['id'];

/** A service item definition in one scope, as stored. */
export interface ServiceItemDef extends ScopedRow {
  id: string;
  itemId: string;
  categoryId: string;
  title: string;
  subtitle: string;
  /** Material Symbols icon name. */
  icon: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A service interval definition in one scope, as stored. `km` / `months` are the defaults. */
export interface IntervalDef extends ScopedRow {
  id: string;
  intervalId: string;
  title: string;
  description: string;
  icon: string;
  coversItemIds: string[];
  km: number;
  months: number;
  createdAt: Date;
  updatedAt: Date;
}

type Stored = 'id' | 'createdAt' | 'updatedAt';
export type NewServiceItemDef = Omit<ServiceItemDef, Stored>;
export type NewIntervalDef = Omit<IntervalDef, Stored>;
export type ServiceItemDefPatch = Partial<
  Pick<ServiceItemDef, 'categoryId' | 'title' | 'subtitle' | 'icon' | 'sortOrder' | 'disabled'>
>;
export type IntervalDefPatch = Partial<
  Pick<
    IntervalDef,
    'title' | 'description' | 'icon' | 'coversItemIds' | 'km' | 'months' | 'sortOrder' | 'disabled'
  >
>;

// --- Admin API ---------------------------------------------------------------------------------

const SLUG = /^[a-z0-9_]{2,40}$/;
const SLUG_MESSAGE = 'Must be 2-40 characters of a-z, 0-9 and _';
const text = z.string().trim().min(1);
const icon = z.string().regex(/^[a-z0-9_]+$/, 'Must be a Material Symbols name');
const scopeId = z.string().min(1).nullable().default(null);

// Whether the ids exist and belong together depends on the vehicle catalog, so the service checks it.
const scopeSchema = z.object({ makeId: scopeId, modelId: scopeId, trimId: scopeId });
const immutable = z.undefined({ invalid_type_error: 'Cannot be changed' });

const itemFields = {
  categoryId: z.enum(CATEGORY_IDS),
  title: text,
  subtitle: text,
  icon,
  sortOrder: z.number().int(),
  disabled: z.boolean(),
};

export const createServiceItemDefSchema = z.object({
  itemId: z.string().regex(SLUG, SLUG_MESSAGE),
  scope: scopeSchema,
  ...itemFields,
  disabled: itemFields.disabled.default(false),
});

/** `itemId` and `scope` are immutable; sending them is a 400. */
export const updateServiceItemDefSchema = z
  .object(itemFields)
  .partial()
  .extend({ itemId: immutable, scope: immutable });

// Whether each covered item exists depends on the item rows, so the service checks it.
const intervalFields = {
  title: text,
  description: text,
  icon,
  coversItemIds: z.array(z.string().min(1)).min(1),
  km: z.number().int().min(INTERVAL_KM_MIN).max(INTERVAL_KM_MAX),
  months: z.number().int().min(1).max(INTERVAL_MONTHS_MAX),
  sortOrder: z.number().int(),
  disabled: z.boolean(),
};

export const createIntervalDefSchema = z.object({
  intervalId: z.string().regex(SLUG, SLUG_MESSAGE),
  scope: scopeSchema,
  ...intervalFields,
  disabled: intervalFields.disabled.default(false),
});

/** `intervalId` and `scope` are immutable; sending them is a 400. */
export const updateIntervalDefSchema = z
  .object(intervalFields)
  .partial()
  .extend({ intervalId: immutable, scope: immutable });

export type CreateServiceItemDefInput = z.infer<typeof createServiceItemDefSchema>;
export type UpdateServiceItemDefInput = z.infer<typeof updateServiceItemDefSchema>;
export type CreateIntervalDefInput = z.infer<typeof createIntervalDefSchema>;
export type UpdateIntervalDefInput = z.infer<typeof updateIntervalDefSchema>;
