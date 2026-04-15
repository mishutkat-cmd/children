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
import { FirebaseService } from '../firebase/firebase.service';

const KV_COLLECTION = '_kv';
const STORAGE_API_KEY = process.env.STORAGE_API_KEY;

function requireApiKey(): boolean {
  return Boolean(STORAGE_API_KEY);
}

function checkApiKey(xApiKey: string | undefined): boolean {
  if (!requireApiKey()) return true;
  return xApiKey === STORAGE_API_KEY;
}

@Controller('api/v1/storage')
export class StorageKvController {
  constructor(private readonly firebaseService: FirebaseService) {}

  @Get('health')
  getHealth(): Record<string, unknown> {
    const status = this.firebaseService.getStatus();
    if (!status.enabled) {
      return {
        ok: false,
        firebase: false,
        message: 'Firebase not configured',
        reason: status.reason,
      };
    }
    return {
      ok: true,
      firebase: true,
    };
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
    const firestore = this.firebaseService.getFirestore();
    if (!firestore) {
      return {
        ok: false,
        firebase: false,
        message: 'Firebase not configured',
        reason: this.firebaseService.getStatus().reason,
      };
    }
    const { key, value } = body;
    if (!key || typeof key !== 'string') {
      return { ok: false, error: 'key required' };
    }
    try {
      await firestore.collection(KV_COLLECTION).doc(key).set({
        value,
        updatedAt: new Date().toISOString(),
      });
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
    const firestore = this.firebaseService.getFirestore();
    if (!firestore) {
      return {
        ok: false,
        firebase: false,
        message: 'Firebase not configured',
        reason: this.firebaseService.getStatus().reason,
      };
    }
    if (!key) {
      return { ok: false, error: 'key query required' };
    }
    try {
      const doc = await firestore.collection(KV_COLLECTION).doc(key).get();
      if (!doc.exists) {
        return { ok: true, value: null };
      }
      const data = doc.data();
      return { ok: true, value: data?.value ?? null };
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
    const firestore = this.firebaseService.getFirestore();
    if (!firestore) {
      return {
        ok: false,
        firebase: false,
        message: 'Firebase not configured',
        reason: this.firebaseService.getStatus().reason,
      };
    }
    if (!key) {
      return { ok: false, error: 'key query required' };
    }
    try {
      await firestore.collection(KV_COLLECTION).doc(key).delete();
      return { ok: true };
    } catch (e: any) {
      return { ok: false, error: e?.message || 'Delete failed' };
    }
  }
}
