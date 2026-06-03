import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirestoreService } from '../firestore/firestore.service';
import { BadgesService } from '../badges/badges.service';
import { LedgerType, computeBalanceDelta } from './balance-delta';

type LedgerRefType = 'COMPLETION' | 'EXCHANGE' | 'CHALLENGE' | 'DECAY' | 'MANUAL';

/**
 * Recursively drop keys whose value is `undefined`. Firestore's admin
 * client refuses documents that contain `undefined` (it throws inside
 * Transaction.set / WriteBatch.set with "Cannot use \"undefined\" as a
 * Firestore value"), so any caller that builds metaJson with optional
 * fields like `{ multiplier: cond ? 5 : undefined }` would crash the
 * whole createEntry transaction — silently swallowing the ledger entry
 * AND the balance increment on the way out. Strip those before write.
 */
function stripUndefined(value: any): any {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(stripUndefined);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined) continue;
    out[k] = stripUndefined(v);
  }
  return out;
}

@Injectable()
export class LedgerService {
  constructor(
    private firestore: FirestoreService,
    private badgesService: BadgesService,
  ) {}

  async createEntry(
    familyId: string,
    childId: string,
    type: LedgerType,
    refType: LedgerRefType,
    amount: number,
    refId?: string,
    metaJson?: any,
  ) {
    try {
      const entryId = crypto.randomUUID();
      const delta = computeBalanceDelta(type, amount);
      // metaJson is a free-form object built by callers (badge logic,
      // streak multipliers, etc) — any `undefined` field in there will
      // make Firestore reject the whole write and bury the balance
      // increment with it. Always strip before persisting.
      const safeMetaJson = metaJson ? stripUndefined(metaJson) : null;
      const entryData = {
        id: entryId,
        familyId,
        childId,
        type,
        refType,
        refId: refId ?? null, // Firestore не принимает undefined
        amount,
        metaJson: safeMetaJson,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Atomic write: insert the ledger entry AND adjust pointsBalance on
      // the child's profile in a single transaction. Replaces the old
      // pattern of create-then-recompute-from-scratch, which was O(history).
      // pointsBalance is now an authoritative denormalization; the integrity
      // check job verifies sum(ledger) == pointsBalance periodically.
      await this.firestore.runTransaction(async (tx) => {
        const profilesQuery = this.firestore
          .collection('childProfiles')
          .where('userId', '==', childId)
          .limit(1);
        const profilesSnap = await tx.get(profilesQuery);

        const ledgerRef = this.firestore.collection('ledgerEntries').doc(entryId);
        tx.set(ledgerRef, entryData);

        if (!profilesSnap.empty && delta !== 0) {
          tx.update(profilesSnap.docs[0].ref, {
            pointsBalance: admin.firestore.FieldValue.increment(delta),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      });

      // Side-effects after commit, fire-and-forget so a slow badge check
      // doesn't block the caller and a badge failure doesn't roll back
      // the ledger entry.
      void this.runPostCreateSideEffects(childId);

      return this.firestore.findFirst('ledgerEntries', { id: entryId });
    } catch (error: any) {
      console.error('[LedgerService] Error creating ledger entry:', error.message);
      throw error;
    }
  }

  private async runPostCreateSideEffects(childId: string) {
    try {
      const user = await this.firestore.findFirst('users', { id: childId });
      if (user?.familyId) {
        await this.badgesService.checkAndAwardBadges(childId, user.familyId, {});
      }
    } catch (err: any) {
      console.warn('[LedgerService] checkAndAwardBadges:', err?.message);
    }
  }

  async updateChildBalance(childId: string) {
    // childId в LedgerEntry это userId (ссылается на User.id)
    // Но pointsBalance хранится в ChildProfile
    // Логирование только в development
    if (process.env.NODE_ENV === 'development') {
      console.log('[LedgerService] updateChildBalance called:', { childId });
    }
    
    try {
      const allEntries = await this.firestore.findMany('ledgerEntries', { childId });
      
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[LedgerService] Found ledger entries:', allEntries.length);
      }
      
      // Логируем все записи для отладки (только в development)
      if (process.env.NODE_ENV === 'development' && allEntries.length > 0) {
        console.log('[LedgerService] All ledger entries:', allEntries.length, 'entries');
      }
      
      const balance = allEntries.reduce((sum, entry) => {
        // EARN/BONUS — всегда плюс, SPEND/PENALTY — всегда минус.
        // Знак нормализуем через Math.abs, чтобы корректно работать
        // независимо от того, передал ли источник положительное или
        // уже отрицательное значение в createEntry.
        let amount = 0;
        const entryAmount = entry.amount || 0;

        if (entry.type === 'EARN' || entry.type === 'BONUS') {
          amount = Math.abs(entryAmount);
        } else if (entry.type === 'SPEND' || entry.type === 'PENALTY') {
          amount = -Math.abs(entryAmount);
        } else if (entry.type === 'ADJUST') {
          // ADJUST может быть как положительным, так и отрицательным
          // Используем значение как есть (может быть отрицательным)
          amount = entryAmount;
        } else {
          // Неизвестный тип - логируем предупреждение
          if (process.env.NODE_ENV === 'development') {
            console.warn('[LedgerService] Unknown entry type:', entry.type, 'for entry:', entry.id);
          }
          amount = 0;
        }
        
        const newSum = sum + amount;
        // Детальное логирование только в development
        if (process.env.NODE_ENV === 'development') {
          console.log('[LedgerService] Entry processed:', { 
            type: entry.type, 
            amount: entryAmount,
            calculatedAmount: amount,
            newSum: newSum
          });
        }
        return newSum;
      }, 0);

      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[LedgerService] Calculated balance:', balance, 'from', allEntries.length, 'entries');
      }

      // Найти ChildProfile по userId
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
      
      if (childProfiles.length > 0) {
        const childProfileId = childProfiles[0].id;
        await this.firestore.update('childProfiles', childProfileId, { pointsBalance: balance });
        // Логирование только в development
        if (process.env.NODE_ENV === 'development') {
          console.log('[LedgerService] Balance updated successfully:', balance);
        }
        // Проверяем и начисляем бейджи по условиям (POINTS и т.д.) после изменения баланса (не ломаем ответ при ошибке)
        try {
          const user = await this.firestore.findFirst('users', { id: childId });
          const famId = user?.familyId;
          if (famId) {
            await this.badgesService.checkAndAwardBadges(childId, famId, {});
          }
        } catch (badgeErr: any) {
          console.warn('[LedgerService] checkAndAwardBadges:', badgeErr?.message);
          // Не пробрасываем — начисление баллов уже прошло
        }
      } else {
        console.warn('[LedgerService] No child profile found for userId:', childId);
      }

      return balance;
    } catch (error: any) {
      // Всегда логируем ошибки
      console.error('[LedgerService] Error updating child balance:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('[LedgerService] Error stack:', error.stack);
      }
      throw error;
    }
  }

  async getChildLedger(childId: string, from?: Date, to?: Date) {
    const allEntries = await this.firestore.findMany('ledgerEntries', { childId }, { createdAt: 'desc' });

    // Filter by date range if provided
    if (from || to) {
      return allEntries.filter(entry => {
        const createdAt = entry.createdAt?.toDate ? entry.createdAt.toDate() : new Date(entry.createdAt);
        if (from && createdAt < from) return false;
        if (to && createdAt > to) return false;
        return true;
      });
    }

    return allEntries;
  }

  /**
   * Удаляет штраф или бонус и атомарно корректирует pointsBalance.
   * Возвращает обновлённый баланс.
   */
  async deleteLedgerEntry(
    entryId: string,
    familyId: string,
    allowedTypes: LedgerType[],
  ): Promise<{ success: true; newBalance: number }> {
    // Pre-fetch outside the transaction so we can surface authz errors
    // before any writes are attempted. The transaction below re-reads the
    // entry to make the delete + balance adjustment atomic.
    const initial = await this.firestore.findFirst('ledgerEntries', { id: entryId });
    if (!initial) throw new Error('Запись не найдена');
    if (initial.familyId !== familyId) throw new Error('Запись из другой семьи');
    if (!allowedTypes.includes(initial.type)) {
      throw new Error(`Удалять можно только: ${allowedTypes.join(', ')}`);
    }

    const childId: string = initial.childId;

    const newBalance: number = await this.firestore.runTransaction(async (tx) => {
      const ledgerRef = this.firestore.collection('ledgerEntries').doc(entryId);
      const ledgerSnap = await tx.get(ledgerRef);
      if (!ledgerSnap.exists) throw new Error('Запись не найдена');
      const entry = ledgerSnap.data() as any;

      const profilesSnap = await tx.get(
        this.firestore
          .collection('childProfiles')
          .where('userId', '==', childId)
          .limit(1),
      );

      const reverseDelta = -computeBalanceDelta(entry.type, entry.amount);
      tx.delete(ledgerRef);

      if (!profilesSnap.empty && reverseDelta !== 0) {
        const profileDoc = profilesSnap.docs[0];
        tx.update(profileDoc.ref, {
          pointsBalance: admin.firestore.FieldValue.increment(reverseDelta),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Read-after-write isn't possible inside the same tx, but we know
        // the new value because of the linear adjustment.
        const oldBalance = (profileDoc.data() as any).pointsBalance || 0;
        return oldBalance + reverseDelta;
      }
      return 0;
    });

    return { success: true, newBalance };
  }

  async deletePenalty(entryId: string, familyId: string) {
    return this.deleteLedgerEntry(entryId, familyId, ['PENALTY']);
  }

  async deleteBonus(entryId: string, familyId: string) {
    return this.deleteLedgerEntry(entryId, familyId, ['BONUS']);
  }

  /**
   * Возвращает все записи указанного типа (PENALTY/BONUS) семьи
   * с именами детей и причиной. Только записи с refType = MANUAL,
   * чтобы не показывать автоматические начисления (DECAY, COMPLETION и т.д.).
   */
  private async getFamilyManualEntries(familyId: string, type: LedgerType) {
    const entries = await this.firestore.findMany(
      'ledgerEntries',
      { familyId, type },
      { createdAt: 'desc' },
    );
    const manualEntries = entries.filter((e: any) => e.refType === 'MANUAL');

    const result = [];
    for (const entry of manualEntries) {
      let childName = 'Ребёнок';
      try {
        const profile = await this.firestore.findFirst('childProfiles', { userId: entry.childId });
        if (profile) {
          childName = profile.name || childName;
        } else {
          const user = await this.firestore.findFirst('users', { id: entry.childId });
          childName = user?.login || childName;
        }
      } catch {
        // ignore lookup errors, keep default name
      }
      let reason: string | null = null;
      if (entry.metaJson) {
        try {
          const meta = typeof entry.metaJson === 'string' ? JSON.parse(entry.metaJson) : entry.metaJson;
          reason = meta?.reason || null;
        } catch {
          // ignore
        }
      }
      result.push({
        id: entry.id,
        childId: entry.childId,
        childName,
        amount: Math.abs(entry.amount || 0),
        refType: entry.refType,
        reason,
        createdAt: entry.createdAt,
      });
    }
    return result;
  }

  /**
   * Возвращает все ручные штрафы семьи. Используется на дашборде родителя.
   * Включает только записи c refType = MANUAL (без угасания и т.п.).
   */
  async getFamilyPenalties(familyId: string) {
    // Для штрафов оставляем как было — показываем все, включая автоматические,
    // потому что родителю важно видеть и DECAY. Но не даём удалять не-MANUAL.
    const entries = await this.firestore.findMany(
      'ledgerEntries',
      { familyId, type: 'PENALTY' },
      { createdAt: 'desc' },
    );

    const result = [];
    for (const entry of entries) {
      let childName = 'Ребёнок';
      try {
        const profile = await this.firestore.findFirst('childProfiles', { userId: entry.childId });
        if (profile) {
          childName = profile.name || childName;
        } else {
          const user = await this.firestore.findFirst('users', { id: entry.childId });
          childName = user?.login || childName;
        }
      } catch {
        // ignore lookup errors, keep default name
      }
      let reason: string | null = null;
      if (entry.metaJson) {
        try {
          const meta = typeof entry.metaJson === 'string' ? JSON.parse(entry.metaJson) : entry.metaJson;
          reason = meta?.reason || null;
        } catch {
          // ignore
        }
      }
      result.push({
        id: entry.id,
        childId: entry.childId,
        childName,
        amount: Math.abs(entry.amount || 0),
        refType: entry.refType,
        reason,
        createdAt: entry.createdAt,
      });
    }
    return result;
  }

  /**
   * Возвращает все ручные бонусы (BONUS, refType=MANUAL) семьи.
   * Используется на дашборде родителя.
   */
  async getFamilyBonuses(familyId: string) {
    return this.getFamilyManualEntries(familyId, 'BONUS');
  }
}
