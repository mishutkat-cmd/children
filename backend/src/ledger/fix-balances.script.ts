/**
 * Скрипт для автоматического исправления всех балансов
 * Можно запустить через endpoint или напрямую
 */

import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from './ledger.service';

export async function fixAllBalancesForFamily(
  firestore: FirestoreService,
  ledgerService: LedgerService,
  familyId: string,
): Promise<any> {
  console.log(`[FixBalancesScript] Starting fix for family: ${familyId}`);
  
  // Получаем всех детей из семьи
  const children = await firestore.findMany('users', { 
    familyId, 
    role: 'CHILD' 
  });
  
  console.log(`[FixBalancesScript] Found ${children.length} children in family`);
  
  const results = [];
  
  for (const child of children) {
    try {
      const userId = child.id;
      const childProfiles = await firestore.findMany('childProfiles', { userId });
      
      if (childProfiles.length === 0) {
        console.warn(`[FixBalancesScript] No child profile found for userId: ${userId}`);
        results.push({
          userId,
          childName: child.login,
          status: 'skipped',
          reason: 'No child profile found',
        });
        continue;
      }
      
      const childProfile = childProfiles[0];
      const oldBalance = childProfile.pointsBalance || 0;
      
      console.log(`[FixBalancesScript] Processing child: ${childProfile.name || child.login} (${userId})`);
      
      // Шаг 1: Удаляем дубликаты
      const allEntries = await firestore.findMany('ledgerEntries', { childId: userId });
      const completionEntries = new Map<string, any[]>();
      
      for (const entry of allEntries) {
        if (entry.refType === 'COMPLETION' && entry.refId && entry.type === 'EARN') {
          const key = entry.refId;
          if (!completionEntries.has(key)) {
            completionEntries.set(key, []);
          }
          completionEntries.get(key)!.push(entry);
        }
      }
      
      let duplicatesRemoved = 0;
      for (const [completionId, entries] of completionEntries.entries()) {
        if (entries.length > 1) {
          // Сортируем по дате создания (самая старая первая)
          entries.sort((a, b) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return aDate.getTime() - bDate.getTime();
          });
          
          // Удаляем все кроме первой
          for (let i = 1; i < entries.length; i++) {
            try {
              await firestore.delete('ledgerEntries', entries[i].id);
              duplicatesRemoved++;
              console.log(`[FixBalancesScript] Removed duplicate ledger entry: ${entries[i].id} for completion: ${completionId}`);
            } catch (error: any) {
              console.error(`[FixBalancesScript] Error deleting duplicate entry ${entries[i].id}:`, error.message);
            }
          }
        }
      }
      
      // Шаг 2: Пересчитываем баланс
      const newBalance = await ledgerService.updateChildBalance(userId);
      
      results.push({
        userId,
        childProfileId: childProfile.id,
        childName: childProfile.name || child.login,
        oldBalance,
        newBalance,
        difference: newBalance - oldBalance,
        duplicatesRemoved,
        status: 'fixed',
      });
      
      console.log(`[FixBalancesScript] Fixed balance for ${childProfile.name || child.login}: ${oldBalance} -> ${newBalance} (removed ${duplicatesRemoved} duplicates)`);
    } catch (error: any) {
      console.error(`[FixBalancesScript] Error fixing balance for child ${child.id}:`, error.message);
      console.error(`[FixBalancesScript] Error stack:`, error.stack);
      results.push({
        userId: child.id,
        childName: child.login,
        status: 'error',
        error: error.message,
      });
    }
  }
  
  const successCount = results.filter(r => r.status === 'fixed').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  const skippedCount = results.filter(r => r.status === 'skipped').length;
  
  console.log(`[FixBalancesScript] Fix all balances completed: ${successCount} fixed, ${errorCount} errors, ${skippedCount} skipped`);
  
  return {
    success: true,
    totalChildren: children.length,
    fixed: successCount,
    errors: errorCount,
    skipped: skippedCount,
    results,
  };
}
