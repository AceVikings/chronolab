import { ChronoError } from './errors.js';

const UNITS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

export function parseDuration(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new ChronoError('INVALID_DURATION', 'A duration is required.');
  }
  const value = input.trim();
  const simple = /^(\d+(?:\.\d+)?)(ms|s|m|h|d|w)$/i.exec(value);
  if (simple) return { milliseconds: Number(simple[1]) * UNITS[simple[2].toLowerCase()], months: 0 };
  const month = /^(\d+)(mo|y)$/i.exec(value);
  if (month) return { milliseconds: 0, months: Number(month[1]) * (month[2].toLowerCase() === 'y' ? 12 : 1) };
  const iso = /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/i.exec(value);
  if (iso && iso.slice(1).some(Boolean)) {
    return {
      months: Number(iso[1] || 0) * 12 + Number(iso[2] || 0),
      milliseconds: Number(iso[3] || 0) * UNITS.d + Number(iso[4] || 0) * UNITS.h + Number(iso[5] || 0) * UNITS.m + Number(iso[6] || 0) * UNITS.s,
    };
  }
  throw new ChronoError('INVALID_DURATION', `Unsupported duration: ${input}`);
}

export function addDuration(isoTime, duration) {
  const date = new Date(isoTime);
  if (Number.isNaN(date.valueOf())) throw new ChronoError('INVALID_TIME', `Invalid timestamp: ${isoTime}`);
  if (duration.months) date.setUTCMonth(date.getUTCMonth() + duration.months);
  date.setTime(date.getTime() + duration.milliseconds);
  return date.toISOString();
}

export function normalizeTime(input) {
  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) throw new ChronoError('INVALID_TIME', `Invalid timestamp: ${input}`);
  return date.toISOString();
}
