import { calendarDate, currencyExponents } from '@finora/finance-core';

export function decimalAmount(minor: string, currency: keyof typeof currencyExponents) {
  const value = BigInt(minor);
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const exponent = currencyExponents[currency];
  const scale = 10n ** BigInt(exponent);
  return `${negative ? '-' : ''}${absolute / scale}${exponent ? `.${(absolute % scale).toString().padStart(exponent, '0')}` : ''}`;
}

// Noon in the user's configured zone avoids midnight transitions.
export function dateInstant(value: string, timezone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Enter a date as YYYY-MM-DD.');
  const base = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(base.getTime()) || base.toISOString().slice(0, 10) !== value)
    throw new Error('Choose a valid calendar date.');
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'longOffset',
  }).formatToParts(base);
  const offset = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  if (offset !== 'GMT' && !match)
    throw new Error('This timezone cannot be used. Update your timezone in Settings.');
  const minutes = match
    ? (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1)
    : 0;
  const instant = new Date(base.getTime() - minutes * 60_000);
  if (calendarDate(instant, timezone) !== value)
    throw new Error('This date does not exist in your selected timezone.');
  return instant.toISOString();
}
