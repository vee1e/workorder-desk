export interface ApiFieldError {
  field: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly details?: ApiFieldError[];
  readonly requestId?: string;
  readonly status?: number;

  constructor(message: string, code: string, details?: ApiFieldError[], requestId?: string, status?: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.status = status;
  }

  fieldErrors(): Record<string, string> {
    if (!this.details) return {};
    const map: Record<string, string> = {};
    for (const d of this.details) {
      if (!(d.field in map)) map[d.field] = d.message;
    }
    return map;
  }
}

export function messageFromError(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}