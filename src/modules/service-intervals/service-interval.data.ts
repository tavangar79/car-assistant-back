/** A tracked interval: any visit with one of `coversItemIds` resets it. Defaults are the factory values. */
export interface ServiceIntervalDefinition {
  id: string;
  title: string;
  /** One line on what the work is. */
  description: string;
  /** Material Symbols icon name. */
  icon: string;
  coversItemIds: string[];
  defaultKm: number;
  defaultMonths: number;
}

/** Titles and icons are copied from the interval-tuning screen. Ids are stored on overrides, so never rename one. */
export const SERVICE_INTERVALS: ServiceIntervalDefinition[] = [
  {
    id: 'engine_oil',
    title: 'روغن موتور و فیلتر روغن',
    description: 'تعویض روغن موتور به همراه فیلتر روغن',
    icon: 'oil_barrel',
    coversItemIds: ['engine_oil', 'oil_filter'],
    defaultKm: 5000,
    defaultMonths: 6,
  },
  {
    id: 'air_filter',
    title: 'فیلتر هوا و اتاق',
    description: 'تعویض فیلتر هوای موتور و فیلتر کابین',
    icon: 'air',
    coversItemIds: ['air_filter', 'cabin_filter'],
    defaultKm: 10000,
    defaultMonths: 6,
  },
  {
    id: 'fuel_filter',
    title: 'فیلتر بنزین (صافی سوخت)',
    description: 'تعویض صافی بنزین و بازدید خطوط سوخت‌رسانی',
    icon: 'local_gas_station',
    coversItemIds: ['fuel_filter'],
    defaultKm: 10000,
    defaultMonths: 12,
  },
  {
    id: 'front_brake_pads',
    title: 'لنت ترمز چرخ‌های جلو',
    description: 'بازدید ضخامت لنت و دیسک چرخ‌های جلو',
    icon: 'trip_origin',
    coversItemIds: ['front_brake_pads'],
    defaultKm: 25000,
    defaultMonths: 18,
  },
  {
    id: 'spark_plugs',
    title: 'شمع‌های جرقه‌زن موتور',
    description: 'تعویض شمع‌ها و تنظیم دهانه فیلر',
    icon: 'electric_bolt',
    coversItemIds: ['spark_plugs'],
    defaultKm: 30000,
    defaultMonths: 24,
  },
  {
    id: 'gearbox_oil',
    title: 'روغن گیربکس اتوماتیک (ATF)',
    description: 'تعویض روغن گیربکس اتوماتیک (ATF)',
    icon: 'settings',
    coversItemIds: ['gearbox_oil'],
    defaultKm: 50000,
    defaultMonths: 36,
  },
  {
    id: 'timing_belt_kit',
    title: 'تسمه تایم و هرزگردها',
    description: 'تعویض کیت تسمه تایم به همراه هرزگرد و سفت‌کن',
    icon: 'sync',
    coversItemIds: ['timing_belt_kit'],
    defaultKm: 60000,
    defaultMonths: 48,
  },
  {
    id: 'coolant',
    title: 'مایع خنک‌کننده (ضدیخ و آب رادیاتور)',
    description: 'تخلیه و تعویض ضدیخ و آب رادیاتور',
    icon: 'ac_unit',
    coversItemIds: ['coolant'],
    defaultKm: 40000,
    defaultMonths: 24,
  },
];
