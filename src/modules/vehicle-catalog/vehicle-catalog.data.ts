import type { CatalogMake } from './vehicle-catalog.ts';

/**
 * Makes, models and trims a user can pick when adding a car. Ids are stable slugs that are
 * stored on vehicles, so never rename one; add a new id instead.
 * Model ids are unique across the whole catalog, and so are trim ids.
 */
export const VEHICLE_CATALOG: CatalogMake[] = [
  {
    id: 'iran-khodro',
    name: 'ایران خودرو',
    models: [
      {
        id: 'tara',
        name: 'تارا',
        trims: [
          { id: 'tara-v1-mt', name: 'V1 دنده‌ای' },
          { id: 'tara-v4-at', name: 'V4 اتوماتیک - فول آپشن' },
        ],
      },
      {
        id: 'dena-plus',
        name: 'دنا پلاس',
        trims: [
          { id: 'dena-plus-mt', name: 'دنده‌ای' },
          { id: 'dena-plus-turbo-at', name: 'توربو اتوماتیک' },
        ],
      },
      {
        id: 'peugeot-207i',
        name: 'پژو 207i',
        trims: [
          { id: 'peugeot-207i-mt', name: 'دنده‌ای' },
          { id: 'peugeot-207i-at', name: 'اتوماتیک' },
          { id: 'peugeot-207i-panorama', name: 'پانوراما' },
        ],
      },
      {
        id: 'peugeot-pars',
        name: 'پژو پارس',
        trims: [{ id: 'peugeot-pars-elx', name: 'ELX' }],
      },
      {
        id: 'rana-plus',
        name: 'رانا پلاس',
        trims: [{ id: 'rana-plus-mt', name: 'دنده‌ای' }],
      },
      {
        id: 'haima-s7-plus',
        name: 'هایما S7 پلاس',
        trims: [{ id: 'haima-s7-plus-turbo-at', name: 'توربو اتوماتیک' }],
      },
      {
        id: 'reira',
        name: 'ری‌را',
        trims: [{ id: 'reira-turbo-at', name: 'توربو اتوماتیک' }],
      },
    ],
  },
  {
    id: 'saipa',
    name: 'سایپا',
    models: [
      {
        id: 'shahin',
        name: 'شاهین',
        trims: [
          { id: 'shahin-g', name: 'G دنده‌ای' },
          { id: 'shahin-cvt', name: 'اتوماتیک CVT' },
        ],
      },
      {
        id: 'quick',
        name: 'کوییک',
        trims: [
          { id: 'quick-mt', name: 'دنده‌ای' },
          { id: 'quick-r', name: 'R' },
        ],
      },
      {
        id: 'atlas',
        name: 'اطلس',
        trims: [{ id: 'atlas-g', name: 'G' }],
      },
      {
        id: 'saina-s',
        name: 'ساینا S',
        trims: [{ id: 'saina-s-mt', name: 'دنده‌ای' }],
      },
    ],
  },
  {
    id: 'bahman',
    name: 'بهمن موتور',
    models: [
      {
        id: 'fidelity',
        name: 'فیدلیتی',
        trims: [{ id: 'fidelity-prestige', name: 'پرستیژ' }],
      },
      {
        id: 'dignity',
        name: 'دیگنیتی',
        trims: [{ id: 'dignity-prestige', name: 'پرستیژ' }],
      },
      {
        id: 'capra',
        name: 'کاپرا',
        trims: [{ id: 'capra-2-double-cab', name: 'دو کابین' }],
      },
    ],
  },
  {
    id: 'mvm-chery',
    name: 'مدیران خودرو (MVM / چری)',
    models: [
      {
        id: 'mvm-x22-pro',
        name: 'MVM X22 پرو',
        trims: [{ id: 'mvm-x22-pro-at', name: 'اتوماتیک' }],
      },
      {
        id: 'tiggo-7-pro',
        name: 'تیگو 7 پرو',
        trims: [
          { id: 'tiggo-7-pro-excellent', name: 'اکسلنت' },
          { id: 'tiggo-7-pro-premium', name: 'پریمیوم' },
        ],
      },
      {
        id: 'tiggo-8-pro',
        name: 'تیگو 8 پرو',
        trims: [{ id: 'tiggo-8-pro-premium', name: 'پریمیوم' }],
      },
      {
        id: 'arrizo-6-pro',
        name: 'آریزو 6 پرو',
        trims: [{ id: 'arrizo-6-pro-at', name: 'اتوماتیک' }],
      },
    ],
  },
  {
    id: 'kmc-jac',
    name: 'کرمان موتور (KMC / جک)',
    models: [
      {
        id: 'kmc-j7',
        name: 'KMC J7',
        trims: [{ id: 'kmc-j7-at', name: 'اتوماتیک' }],
      },
      {
        id: 'kmc-t8',
        name: 'KMC T8',
        trims: [{ id: 'kmc-t8-4wd', name: 'دو دیفرانسیل' }],
      },
      {
        id: 'jac-s5',
        name: 'جک S5',
        trims: [{ id: 'jac-s5-at', name: 'اتوماتیک' }],
      },
    ],
  },
  {
    id: 'toyota',
    name: 'تویوتا',
    models: [
      {
        id: 'camry',
        name: 'کمری',
        trims: [
          { id: 'camry-2-5', name: '2.5 لیتر' },
          { id: 'camry-hybrid', name: 'هیبرید' },
        ],
      },
      {
        id: 'corolla',
        name: 'کرولا',
        trims: [{ id: 'corolla-1-8', name: '1.8 لیتر' }],
      },
      {
        id: 'rav4',
        name: 'RAV4',
        trims: [{ id: 'rav4-2-5', name: '2.5 لیتر' }],
      },
      {
        id: 'land-cruiser',
        name: 'لندکروزر',
        trims: [{ id: 'land-cruiser-gxr', name: 'GXR' }],
      },
    ],
  },
  {
    id: 'hyundai',
    name: 'هیوندای',
    models: [
      {
        id: 'elantra',
        name: 'النترا',
        trims: [{ id: 'elantra-2-0', name: '2.0 لیتر' }],
      },
      {
        id: 'sonata',
        name: 'سوناتا',
        trims: [
          { id: 'sonata-2-4', name: '2.4 لیتر' },
          { id: 'sonata-hybrid', name: 'هیبرید' },
        ],
      },
      {
        id: 'tucson',
        name: 'توسان',
        trims: [{ id: 'tucson-2-0', name: '2.0 لیتر' }],
      },
      {
        id: 'santa-fe',
        name: 'سانتافه',
        trims: [{ id: 'santa-fe-2-4', name: '2.4 لیتر' }],
      },
    ],
  },
  {
    id: 'kia',
    name: 'کیا',
    models: [
      {
        id: 'cerato',
        name: 'سراتو',
        trims: [{ id: 'cerato-2-0', name: '2.0 لیتر' }],
      },
      {
        id: 'optima',
        name: 'اپتیما',
        trims: [{ id: 'optima-2-4', name: '2.4 لیتر' }],
      },
      {
        id: 'sportage',
        name: 'اسپورتیج',
        trims: [{ id: 'sportage-2-4', name: '2.4 لیتر' }],
      },
      {
        id: 'sorento',
        name: 'سورنتو',
        trims: [{ id: 'sorento-3-5', name: '3.5 لیتر' }],
      },
    ],
  },
];
