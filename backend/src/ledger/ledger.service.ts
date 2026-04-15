import { Injectable } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { BadgesService } from '../badges/badges.service';
// Enums заменены на строки для SQLite
type LedgerType = 'EARN' | 'SPEND' | 'BONUS' | 'PENALTY' | 'ADJUST';
type LedgerRefType = 'COMPLETION' | 'EXCHANGE' | 'CHALLENGE' | 'DECAY' | 'MANUAL';

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
    // Логирование только в development
    if (process.env.NODE_ENV === 'development') {
      console.log('[LedgerService] createEntry called:', { type, refType, amount });
    }
    
    try {
      const entryId = crypto.randomUUID();
      const entryData = {
        id: entryId,
        familyId,
        childId,
        type,
        refType,
        refId: refId ?? null, // Firestore не принимает undefined
        amount,
        metaJson: metaJson ? JSON.stringify(metaJson) : null,
      };

      await this.firestore.create('ledgerEntries', entryData, entryId);

      // Update child balance
      const balance = await this.updateChildBalance(childId);
      
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[LedgerService] Ledger entry created and balance updated:', entryId, 'balance:', balance);
      }

      const createdEntry = await this.firestore.findFirst('ledgerEntries', { id: entryId });
      return createdEntry;
    } catch (error: any) {
      // Всегда логируем ошибки
      console.error('[LedgerService] Error creating ledger entry:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('[LedgerService] Error stack:', error.stack);
      }
      throw error;
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
   * Удаляет штраф или бонус и пересчитывает баланс ребёнка.
   * Возвращает обновлённый баланс.
   */
  async deleteLedgerEntry(
    entryId: string,
    familyId: string,
    allowedTypes: LedgerType[],
  ): Promise<{ success: true; newBalance: number }> {
    const entry = await this.firestore.findFirst('ledgerEntries', { id: entryId });
    if (!entry) {
      throw new Error('Запись не найдена');
    }
    if (entry.familyId !== familyId) {
      throw new Error('Запись из другой семьи');
    }
    if (!allowedTypes.includes(entry.type)) {
      throw new Error(`Удалять можно только: ${allowedTypes.join(', ')}`);
    }

    await this.firestore.delete('ledgerEntries', entryId);
    const newBalance = await this.updateChildBalance(entry.childId);
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
