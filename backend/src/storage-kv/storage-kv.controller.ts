import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Query,
  Headers,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { DocStore } from '../db/doc-store.service';

const KV_COLLECTION = '_kv';

// Fail closed: if STORAGE_API_KEY is unset we refuse, instead of leaving the
// KV endpoints world-accessible.
function checkApiKey(xApiKey: string | undefined): boolean {
  const expected = process.env.STORAGE_API_KEY;
  if (!expected) return false;
  return xApiKey === expected;
}

/**
 * Small key/value store exposed to other services over HTTP.
 *
 * Keys arrive from the caller and become document ids. That was harmless in
 * Firestore and stays harmless here — ids are bound as SQL parameters, never
 * interpolated — but keys are still length-capped so one caller cannot bloat
 * the database with a megabyte-long key.
 */
const MAX_KEY_LENGTH = 512;

@Controller('api/v1/storage')
export class StorageKvController {
  constructor(private readonly db: DocStore) {}

  @Get('health')
  getHealth(): Record<string, unknown> {
    const status = this.db.getStatus();
    return {
      ok: status.enabled,
      database: status.enabled,
      ...(status.enabled ? {} : { reason: status.reason }),
    };
  }

  private validateKey(key: string): string | null {
    if (!key || typeof key !== 'string') return 'key required';
    if (key.length > MAX_KEY_LENGTH) return `key too long (max ${MAX_KEY_LENGTH})`;
    return null;
  }

  @Post('set')
  @HttpCode(HttpStatus.OK)
  async set(
    @Body() body: { key: string; value: unknown },
    @Headers('x-api-key') xApiKey?: string,
  ): Promise<Record<string, unknown>> {
    if (!checkApiKey(xApiKey)) {
      return { ok: false, error: 'Missing or invalid x-api-key' };
    }
    const { key, value } = body ?? ({} as any);
    const invalid = this.validateKey(key);
    if (invalid) return { ok: false, error: invalid };

    try {
      await this.db.set(KV_COLLECTION, key, { value });
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Set failed' };
    }
  }

  @Get('get')
  async get(
    @Query('key') key: string,
    @Headers('x-api-key') xApiKey?: string,
  ): Promise<Record<string, unknown>> {
    if (!checkApiKey(xApiKey)) {
      return { ok: false, error: 'Missing or invalid x-api-key' };
    }
    const invalid = this.validateKey(key);
    if (invalid) return { ok: false, error: invalid };

    try {
      const doc = await this.db.get(KV_COLLECTION, key);
      return { ok: true, value: doc?.value ?? null };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Get failed' };
    }
  }

  @Delete('delete')
  async delete(
    @Query('key') key: string,
    @Headers('x-api-key') xApiKey?: string,
  ): Promise<Record<string, unknown>> {
    if (!checkApiKey(xApiKey)) {
      return { ok: false, error: 'Missing or invalid x-api-key' };
    }
    const invalid = this.validateKey(key);
    if (invalid) return { ok: false, error: invalid };

    try {
      await this.db.delete(KV_COLLECTION, key);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Delete failed' };
    }
  }
}
