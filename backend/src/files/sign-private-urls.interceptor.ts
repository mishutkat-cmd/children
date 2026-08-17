import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { signFileUrlFromStored } from './file-signing';

const PRIVATE_PREFIX = '/api/v1/files/';

/**
 * Sign every private-file URL on its way out of the API.
 *
 * Completions carrying a proofUrl are returned from a dozen places — the
 * approvals list, the child dashboard, notification enrichment, task lists.
 * Signing at each of those call sites means the next one added silently ships
 * an image that 401s. Doing it once, here, makes that impossible.
 *
 * Stored values keep the bare `/api/v1/files/<path>` form; the signature is
 * added per response, so it is always fresh and never persisted.
 */
@Injectable()
export class SignPrivateUrlsInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(map((body) => signDeep(body)));
  }
}

/**
 * Walks the response and rewrites private file URLs.
 *
 * The string test is ordered cheapest-first: most values fail on the first
 * character, so the walk costs little even on responses with thousands of
 * documents.
 */
export function signDeep(value: any): any {
  if (typeof value === 'string') {
    return value.charCodeAt(0) === 47 /* '/' */ && value.startsWith(PRIVATE_PREFIX)
      ? signFileUrlFromStored(value)
      : value;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = signDeep(value[i]);
    return value;
  }

  // Dates, Buffers and the like must pass through untouched.
  if (value === null || typeof value !== 'object' || value instanceof Date || Buffer.isBuffer(value)) {
    return value;
  }

  for (const key of Object.keys(value)) value[key] = signDeep(value[key]);
  return value;
}
