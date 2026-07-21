export class ChronoError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ChronoError';
    this.code = code;
    this.details = details;
  }
}

export function asChronoError(error) {
  if (error instanceof ChronoError) return error;
  return new ChronoError('INTERNAL_ERROR', error?.message || String(error));
}
