import type { ServiceCategory } from './service-items.ts';

/**
 * What a user can tick when recording a service visit. Titles, subtitles and Material Symbols
 * icon names are copied from the "step 1" screen; `fuel_filter` only exists on the interval screen.
 * Ids are stored on visits, so never rename one; add a new id instead.
 */
export const SERVICE_ITEMS: ServiceCategory[] = [
  {
    id: 'fluids',
    title: 'روغن و مایعات مصرفی',
    items: [
      { id: 'engine_oil', title: 'روغن موتور', subtitle: 'تعویض و فلاش', icon: 'oil_barrel' },
      {
        id: 'oil_filter',
        title: 'فیلتر روغن',
        subtitle: 'همراه با تعویض روغن',
        icon: 'filter_alt',
      },
      { id: 'air_filter', title: 'فیلتر هوا', subtitle: 'مکش موتور', icon: 'air' },
      { id: 'cabin_filter', title: 'فیلتر کابین', subtitle: 'تهویه مطبوع', icon: 'hvac' },
      { id: 'coolant', title: 'مایع خنک‌کننده', subtitle: 'ضدیخ و آب رادیاتور', icon: 'ac_unit' },
      { id: 'brake_fluid', title: 'روغن ترمز', subtitle: 'تست رطوبت و تخلیه', icon: 'opacity' },
      {
        id: 'fuel_filter',
        title: 'تعویض فیلتر بنزین',
        subtitle: 'صافی سوخت و خطوط سوخت‌رسانی',
        icon: 'local_gas_station',
      },
    ],
  },
  {
    id: 'brakes',
    title: 'ترمز و ایمنی',
    items: [
      {
        id: 'front_brake_pads',
        title: 'لنت ترمز جلو',
        subtitle: 'دیسکی / سنسوردار',
        icon: 'disc_full',
      },
      {
        id: 'rear_brake_pads',
        title: 'لنت ترمز عقب',
        subtitle: 'کاسه‌ای یا دیسکی',
        icon: 'tire_repair',
      },
      { id: 'brake_disc_skim', title: 'تراش دیسک ترمز', subtitle: 'رفع لرزش و تاب', icon: 'album' },
      {
        id: 'brake_booster_hoses',
        title: 'بوستر و شیلنگ‌ها',
        subtitle: 'بازدید نشتی مدار',
        icon: 'troubleshoot',
      },
    ],
  },
  {
    id: 'suspension',
    title: 'جلوبندی و تعلیق',
    items: [
      {
        id: 'wheel_alignment',
        title: 'میزان فرمان',
        subtitle: 'تنظیم زوایای چرخ',
        icon: 'sync_alt',
      },
      {
        id: 'ball_joints_bushings',
        title: 'سیبک و بوش‌ها',
        subtitle: 'رفع لقی و کوبش',
        icon: 'tune',
      },
      { id: 'shock_absorbers', title: 'کمک‌فنرها', subtitle: 'بررسی روغن‌زدگی', icon: 'expand' },
      {
        id: 'wheel_balancing',
        title: 'بالانس چرخ‌ها',
        subtitle: 'درجا یا استاتیک',
        icon: 'donut_large',
      },
    ],
  },
  {
    id: 'electrical',
    title: 'برق، باتری و شمع',
    items: [
      {
        id: 'battery',
        title: 'تعویض باتری',
        subtitle: 'تست ولتاژ و دینام',
        icon: 'battery_charging_full',
      },
      { id: 'spark_plugs', title: 'شمع‌های موتور', subtitle: 'تنظیم دهانه فیلر', icon: 'flash_on' },
      {
        id: 'alternator_starter',
        title: 'دینام و استارت',
        subtitle: 'تست شارژ و آفتامات',
        icon: 'electric_bolt',
      },
      { id: 'lights_fuses', title: 'لامپ و فیوزها', subtitle: 'سیستم روشنایی', icon: 'lightbulb' },
    ],
  },
  {
    id: 'drivetrain',
    title: 'گیربکس و انتقال قدرت',
    items: [
      {
        id: 'gearbox_oil',
        title: 'روغن گیربکس',
        subtitle: 'دستی یا اتوماتیک (ATF)',
        icon: 'settings',
      },
      { id: 'clutch_kit', title: 'دیسک و صفحه کلاچ', subtitle: 'بلبرینگ کلاچ', icon: 'album' },
      {
        id: 'cv_boots',
        title: 'گردگیر پلوس و سرپلوس',
        subtitle: 'بررسی پارگی و گریس‌کاری',
        icon: 'swap_driving_apps_wheel',
      },
    ],
  },
  {
    id: 'periodic',
    title: 'سرویس‌های دوره‌ای اصلی',
    items: [
      {
        id: 'timing_belt_kit',
        title: 'کیت تسمه تایم',
        subtitle: 'همراه هرزگرد و سفت‌کن',
        icon: 'schedule',
      },
      {
        id: 'drive_belt',
        title: 'تسمه دینام',
        subtitle: 'بررسی ترک و تعویض',
        icon: 'all_inclusive',
      },
      {
        id: 'injector_cleaning',
        title: 'شستشوی انژکتور',
        subtitle: 'التراسونیک و دیاگ',
        icon: 'cleaning_services',
      },
      {
        id: 'full_torque_check',
        title: 'آچارکشی جامع',
        subtitle: 'پیچ‌های شاسی و اتاق',
        icon: 'handyman',
      },
    ],
  },
];
