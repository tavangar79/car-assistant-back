/**
 * The factory service catalog, seeded as **global** rows (`sortOrder` = position in these lists).
 * `npm run catalog:seed` adds only missing rows and never overwrites admin edits; the server seeds an empty
 * collection at startup. Titles, subtitles and icons are copied from the "step 1" and interval-tuning screens.
 * Ids are stored on visits and interval overrides, so never rename one; add a new id instead.
 */

/** A global service item, before it is stored. */
export interface SeedServiceItem {
  itemId: string;
  categoryId: string;
  title: string;
  subtitle: string;
  /** Material Symbols icon name. */
  icon: string;
}

/** A global interval, before it is stored. `km` / `months` are the factory defaults. */
export interface SeedInterval {
  intervalId: string;
  title: string;
  description: string;
  icon: string;
  coversItemIds: string[];
  km: number;
  months: number;
}

export const SEED_SERVICE_ITEMS: SeedServiceItem[] = [
  {
    itemId: 'engine_oil',
    categoryId: 'fluids',
    title: 'روغن موتور',
    subtitle: 'تعویض و فلاش',
    icon: 'oil_barrel',
  },
  {
    itemId: 'oil_filter',
    categoryId: 'fluids',
    title: 'فیلتر روغن',
    subtitle: 'همراه با تعویض روغن',
    icon: 'filter_alt',
  },
  {
    itemId: 'air_filter',
    categoryId: 'fluids',
    title: 'فیلتر هوا',
    subtitle: 'مکش موتور',
    icon: 'air',
  },
  {
    itemId: 'cabin_filter',
    categoryId: 'fluids',
    title: 'فیلتر کابین',
    subtitle: 'تهویه مطبوع',
    icon: 'hvac',
  },
  {
    itemId: 'coolant',
    categoryId: 'fluids',
    title: 'مایع خنک‌کننده',
    subtitle: 'ضدیخ و آب رادیاتور',
    icon: 'ac_unit',
  },
  {
    itemId: 'brake_fluid',
    categoryId: 'fluids',
    title: 'روغن ترمز',
    subtitle: 'تست رطوبت و تخلیه',
    icon: 'opacity',
  },
  {
    itemId: 'fuel_filter',
    categoryId: 'fluids',
    title: 'تعویض فیلتر بنزین',
    subtitle: 'صافی سوخت و خطوط سوخت‌رسانی',
    icon: 'local_gas_station',
  },
  {
    itemId: 'front_brake_pads',
    categoryId: 'brakes',
    title: 'لنت ترمز جلو',
    subtitle: 'دیسکی / سنسوردار',
    icon: 'disc_full',
  },
  {
    itemId: 'rear_brake_pads',
    categoryId: 'brakes',
    title: 'لنت ترمز عقب',
    subtitle: 'کاسه‌ای یا دیسکی',
    icon: 'tire_repair',
  },
  {
    itemId: 'brake_disc_skim',
    categoryId: 'brakes',
    title: 'تراش دیسک ترمز',
    subtitle: 'رفع لرزش و تاب',
    icon: 'album',
  },
  {
    itemId: 'brake_booster_hoses',
    categoryId: 'brakes',
    title: 'بوستر و شیلنگ‌ها',
    subtitle: 'بازدید نشتی مدار',
    icon: 'troubleshoot',
  },
  {
    itemId: 'wheel_alignment',
    categoryId: 'suspension',
    title: 'میزان فرمان',
    subtitle: 'تنظیم زوایای چرخ',
    icon: 'sync_alt',
  },
  {
    itemId: 'ball_joints_bushings',
    categoryId: 'suspension',
    title: 'سیبک و بوش‌ها',
    subtitle: 'رفع لقی و کوبش',
    icon: 'tune',
  },
  {
    itemId: 'shock_absorbers',
    categoryId: 'suspension',
    title: 'کمک‌فنرها',
    subtitle: 'بررسی روغن‌زدگی',
    icon: 'expand',
  },
  {
    itemId: 'wheel_balancing',
    categoryId: 'suspension',
    title: 'بالانس چرخ‌ها',
    subtitle: 'درجا یا استاتیک',
    icon: 'donut_large',
  },
  {
    itemId: 'battery',
    categoryId: 'electrical',
    title: 'تعویض باتری',
    subtitle: 'تست ولتاژ و دینام',
    icon: 'battery_charging_full',
  },
  {
    itemId: 'spark_plugs',
    categoryId: 'electrical',
    title: 'شمع‌های موتور',
    subtitle: 'تنظیم دهانه فیلر',
    icon: 'flash_on',
  },
  {
    itemId: 'alternator_starter',
    categoryId: 'electrical',
    title: 'دینام و استارت',
    subtitle: 'تست شارژ و آفتامات',
    icon: 'electric_bolt',
  },
  {
    itemId: 'lights_fuses',
    categoryId: 'electrical',
    title: 'لامپ و فیوزها',
    subtitle: 'سیستم روشنایی',
    icon: 'lightbulb',
  },
  {
    itemId: 'gearbox_oil',
    categoryId: 'drivetrain',
    title: 'روغن گیربکس',
    subtitle: 'دستی یا اتوماتیک (ATF)',
    icon: 'settings',
  },
  {
    itemId: 'clutch_kit',
    categoryId: 'drivetrain',
    title: 'دیسک و صفحه کلاچ',
    subtitle: 'بلبرینگ کلاچ',
    icon: 'album',
  },
  {
    itemId: 'cv_boots',
    categoryId: 'drivetrain',
    title: 'گردگیر پلوس و سرپلوس',
    subtitle: 'بررسی پارگی و گریس‌کاری',
    icon: 'swap_driving_apps_wheel',
  },
  {
    itemId: 'timing_belt_kit',
    categoryId: 'periodic',
    title: 'کیت تسمه تایم',
    subtitle: 'همراه هرزگرد و سفت‌کن',
    icon: 'schedule',
  },
  {
    itemId: 'drive_belt',
    categoryId: 'periodic',
    title: 'تسمه دینام',
    subtitle: 'بررسی ترک و تعویض',
    icon: 'all_inclusive',
  },
  {
    itemId: 'injector_cleaning',
    categoryId: 'periodic',
    title: 'شستشوی انژکتور',
    subtitle: 'التراسونیک و دیاگ',
    icon: 'cleaning_services',
  },
  {
    itemId: 'full_torque_check',
    categoryId: 'periodic',
    title: 'آچارکشی جامع',
    subtitle: 'پیچ‌های شاسی و اتاق',
    icon: 'handyman',
  },
];

export const SEED_INTERVALS: SeedInterval[] = [
  {
    intervalId: 'engine_oil',
    title: 'روغن موتور و فیلتر روغن',
    description: 'تعویض روغن موتور به همراه فیلتر روغن',
    icon: 'oil_barrel',
    coversItemIds: ['engine_oil', 'oil_filter'],
    km: 5000,
    months: 6,
  },
  {
    intervalId: 'air_filter',
    title: 'فیلتر هوا و اتاق',
    description: 'تعویض فیلتر هوای موتور و فیلتر کابین',
    icon: 'air',
    coversItemIds: ['air_filter', 'cabin_filter'],
    km: 10000,
    months: 6,
  },
  {
    intervalId: 'fuel_filter',
    title: 'فیلتر بنزین (صافی سوخت)',
    description: 'تعویض صافی بنزین و بازدید خطوط سوخت‌رسانی',
    icon: 'local_gas_station',
    coversItemIds: ['fuel_filter'],
    km: 10000,
    months: 12,
  },
  {
    intervalId: 'front_brake_pads',
    title: 'لنت ترمز چرخ‌های جلو',
    description: 'بازدید ضخامت لنت و دیسک چرخ‌های جلو',
    icon: 'trip_origin',
    coversItemIds: ['front_brake_pads'],
    km: 25000,
    months: 18,
  },
  {
    intervalId: 'spark_plugs',
    title: 'شمع‌های جرقه‌زن موتور',
    description: 'تعویض شمع‌ها و تنظیم دهانه فیلر',
    icon: 'electric_bolt',
    coversItemIds: ['spark_plugs'],
    km: 30000,
    months: 24,
  },
  {
    intervalId: 'gearbox_oil',
    title: 'روغن گیربکس اتوماتیک (ATF)',
    description: 'تعویض روغن گیربکس اتوماتیک (ATF)',
    icon: 'settings',
    coversItemIds: ['gearbox_oil'],
    km: 50000,
    months: 36,
  },
  {
    intervalId: 'timing_belt_kit',
    title: 'تسمه تایم و هرزگردها',
    description: 'تعویض کیت تسمه تایم به همراه هرزگرد و سفت‌کن',
    icon: 'sync',
    coversItemIds: ['timing_belt_kit'],
    km: 60000,
    months: 48,
  },
  {
    intervalId: 'coolant',
    title: 'مایع خنک‌کننده (ضدیخ و آب رادیاتور)',
    description: 'تخلیه و تعویض ضدیخ و آب رادیاتور',
    icon: 'ac_unit',
    coversItemIds: ['coolant'],
    km: 40000,
    months: 24,
  },
];
