// Users are in Iran, so the year turns at Nowruz in Tehran time.
const yearFormatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  timeZone: 'Asia/Tehran',
  year: 'numeric',
});

/** The Jalali (Solar Hijri) year at instant `date` in Tehran, e.g. 1405. */
export function jalaliYear(date: Date): number {
  const year = yearFormatter.formatToParts(date).find((part) => part.type === 'year');
  return Number(year?.value);
}
