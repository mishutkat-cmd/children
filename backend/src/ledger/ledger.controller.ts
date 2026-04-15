import { Controller, Get, Post, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { CleanupService } from './cleanup.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { User } from '../common/decorators/user.decorator';
import { FirestoreService } from '../firestore/firestore.service';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(
    private ledgerService: LedgerService,
    private firestore: FirestoreService,
    private cleanupService: CleanupService,
  ) {}

  /** Ручное начисление или штраф баллов ребёнку (только родитель). type: 'bonus' | 'penalty'. */
  @Post('bonus')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async addBonus(
    @Body() body: { childId: string; amount: number; reason?: string; type?: 'bonus' | 'penalty' },
    @User() user: { familyId: string },
  ) {
    const childId = body?.childId && String(body.childId).trim();
    if (!childId) {
      return { success: false, error: 'Укажите ребёнка' };
    }
    const amount = Math.round(Number(body?.amount) || 0);
    if (amount <= 0) {
      return { success: false, error: 'Укажите положительное количество баллов' };
    }
    const isPenalty = body?.type === 'penalty';
    const childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    const childProfileById = childProfile || await this.firestore.findFirst('childProfiles', { id: childId });
    if (!childProfileById) {
      return { success: false, error: 'Ребёнок не найден' };
    }
    // userId может прийти как строка или как объект (DocumentReference) из Firestore
    const rawUserId = childProfileById.userId;
    const userId =
      typeof rawUserId === 'string'
        ? rawUserId
        : (rawUserId && typeof (rawUserId as any).id === 'string'
          ? (rawUserId as any).id
          : childId);
    if (!userId) {
      return { success: false, error: 'Ребёнок не найден' };
    }
    const familyId = user.familyId;
    const userInFamily = await this.firestore.findFirst('users', { id: userId, familyId });
    if (!userInFamily) {
      return { success: false, error: 'Ребёнок не из вашей семьи' };
    }
    const metaJson = body.reason ? { reason: String(body.reason).trim() } : undefined;
    const entryType = isPenalty ? 'PENALTY' : 'BONUS';
    await this.ledgerService.createEntry(familyId, userId, entryType, 'MANUAL', amount, undefined, metaJson);
    const profile = await this.firestore.findFirst('childProfiles', { userId });
    const newBalance = profile?.pointsBalance ?? 0;
    return { success: true, newBalance, amount, type: isPenalty ? 'penalty' : 'bonus' };
  }

  @Get('diagnostics/:childId')
  async getDiagnostics(@Param('childId') childId: string, @User() user: any) {
    console.log('[LedgerController] Diagnostics requested for child:', childId);
    
    // Получаем childProfile для проверки userId
    const childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    if (!childProfile) {
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      if (!childProfileById) {
        return { error: 'Child not found' };
      }
    }
    
    const userId = childProfile?.userId || childId;
    const childProfileId = childProfile?.id || childId;
    
    // Получаем все ledger entries
    const allEntries = await this.firestore.findMany('ledgerEntries', { childId: userId });
    
    // Рассчитываем баланс вручную
    const calculatedBalance = allEntries.reduce((sum, entry) => {
      let amount = 0;
      if (entry.type === 'EARN' || entry.type === 'BONUS') {
        amount = entry.amount || 0;
      } else if (entry.type === 'SPEND' || entry.type === 'PENALTY') {
        amount = -(entry.amount || 0);
      } else if (entry.type === 'ADJUST') {
        amount = entry.amount || 0;
      }
      return sum + amount;
    }, 0);
    
    // Получаем текущий баланс из ChildProfile
    const currentProfile = await this.firestore.findFirst('childProfiles', { id: childProfileId });
    const currentBalance = currentProfile?.pointsBalance || 0;
    
    // Получаем все completions для проверки дублирования
    const completions = await this.firestore.findMany('completions', { childId: childProfileId });
    
    // Проверяем дублирование ledger entries для completions
    const completionLedgerMap = new Map<string, any[]>();
    for (const entry of allEntries) {
      if (entry.refType === 'COMPLETION' && entry.refId) {
        if (!completionLedgerMap.has(entry.refId)) {
          completionLedgerMap.set(entry.refId, []);
        }
        completionLedgerMap.get(entry.refId)!.push(entry);
      }
    }
    
    const duplicateCompletions = [];
    for (const [completionId, entries] of completionLedgerMap.entries()) {
      const earnEntries = entries.filter(e => e.type === 'EARN');
      if (earnEntries.length > 1) {
        duplicateCompletions.push({
          completionId,
          entries: earnEntries.map(e => ({
            id: e.id,
            type: e.type,
            amount: e.amount,
            createdAt: e.createdAt,
          })),
        });
      }
    }
    
    return {
      childId: userId,
      childProfileId,
      currentBalance,
      calculatedBalance,
      balanceMismatch: currentBalance !== calculatedBalance,
      totalLedgerEntries: allEntries.length,
      ledgerEntries: allEntries.map(e => ({
        id: e.id,
        type: e.type,
        amount: e.amount,
        refType: e.refType,
        refId: e.refId,
        createdAt: e.createdAt,
        metaJson: e.metaJson,
      })),
      duplicateCompletions,
      completionsCount: completions.length,
      completions: completions.map(c => ({
        id: c.id,
        taskId: c.taskId,
        status: c.status,
        pointsAwarded: c.pointsAwarded,
        performedAt: c.performedAt,
      })),
    };
  }

  @Post('fix-balance/:childId')
  async fixBalance(@Param('childId') childId: string, @User() user: any) {
    console.log('[LedgerController] Fix balance requested for child:', childId);
    
    // Получаем childProfile для проверки userId
    const childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    if (!childProfile) {
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      if (!childProfileById) {
        return { error: 'Child not found' };
      }
    }
    
    const userId = childProfile?.userId || childId;
    
    // Пересчитываем баланс
    const newBalance = await this.ledgerService.updateChildBalance(userId);
    
    return {
      success: true,
      childId: userId,
      newBalance,
      message: 'Balance has been recalculated and updated',
    };
  }

  @Post('fix-all-balances')
  async fixAllBalances(@User() user: any) {
    console.log('[LedgerController] Fix all balances requested for family:', user.familyId);
    
    // Получаем всех детей из семьи пользователя
    const children = await this.firestore.findMany('users', { 
      familyId: user.familyId, 
      role: 'CHILD' 
    });
    
    console.log(`[LedgerController] Found ${children.length} children in family`);
    
    const results = [];
    
    for (const child of children) {
      try {
        const userId = child.id;
        const childProfiles = await this.firestore.findMany('childProfiles', { userId });
        
        if (childProfiles.length === 0) {
          console.warn(`[LedgerController] No child profile found for userId: ${userId}`);
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
        
        console.log(`[LedgerController] Processing child: ${childProfile.name || child.login} (${userId})`);
        
        // Шаг 1: Удаляем дубликаты
        const allEntries = await this.firestore.findMany('ledgerEntries', { childId: userId });
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
                await this.firestore.delete('ledgerEntries', entries[i].id);
                duplicatesRemoved++;
                console.log(`[LedgerController] Removed duplicate ledger entry: ${entries[i].id} for completion: ${completionId}`);
              } catch (error: any) {
                console.error(`[LedgerController] Error deleting duplicate entry ${entries[i].id}:`, error.message);
              }
            }
          }
        }
        
        // Шаг 2: Пересчитываем баланс
        const newBalance = await this.ledgerService.updateChildBalance(userId);
        
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
        
        console.log(`[LedgerController] Fixed balance for ${childProfile.name || child.login}: ${oldBalance} -> ${newBalance} (removed ${duplicatesRemoved} duplicates)`);
      } catch (error: any) {
        console.error(`[LedgerController] Error fixing balance for child ${child.id}:`, error.message);
        console.error(`[LedgerController] Error stack:`, error.stack);
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
    
    console.log(`[LedgerController] Fix all balances completed: ${successCount} fixed, ${errorCount} errors, ${skippedCount} skipped`);
    
    return {
      success: true,
      totalChildren: children.length,
      fixed: successCount,
      errors: errorCount,
      skipped: skippedCount,
      results,
    };
  }

  @Post('remove-duplicates/:childId')
  async removeDuplicates(@Param('childId') childId: string, @User() user: any) {
    console.log('[LedgerController] Remove duplicates requested for child:', childId);
    
    // Получаем childProfile для проверки userId
    const childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    if (!childProfile) {
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      if (!childProfileById) {
        return { error: 'Child not found' };
      }
    }
    
    const userId = childProfile?.userId || childId;
    
    // Получаем все ledger entries
    const allEntries = await this.firestore.findMany('ledgerEntries', { childId: userId });
    
    // Группируем по refType и refId для COMPLETION
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
    
    // Находим дубликаты (больше одной записи для одного completion)
    const duplicates = [];
    const toDelete = [];
    
    for (const [completionId, entries] of completionEntries.entries()) {
      if (entries.length > 1) {
        // Сортируем по дате создания (самая старая первая)
        entries.sort((a, b) => {
          const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return aDate.getTime() - bDate.getTime();
        });
        
        // Оставляем первую запись, остальные помечаем на удаление
        duplicates.push({
          completionId,
          total: entries.length,
          keeping: entries[0].id,
          deleting: entries.slice(1).map(e => e.id),
        });
        
        // Удаляем все кроме первой
        for (let i = 1; i < entries.length; i++) {
          toDelete.push(entries[i].id);
        }
      }
    }
    
    // Удаляем дубликаты
    let deletedCount = 0;
    for (const entryId of toDelete) {
      try {
        await this.firestore.delete('ledgerEntries', entryId);
        deletedCount++;
      } catch (error: any) {
        console.error(`[LedgerController] Error deleting duplicate entry ${entryId}:`, error.message);
      }
    }
    
    // Пересчитываем баланс после удаления дубликатов
    const newBalance = await this.ledgerService.updateChildBalance(userId);
    
    return {
      success: true,
      userId,
      duplicatesFound: duplicates.length,
      duplicates,
      deletedCount,
      newBalance,
    };
  }

  /** Все штрафы семьи (для дашборда родителя). */
  @Get('parent/penalties')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async getFamilyPenalties(@User() user: { familyId: string }) {
    return this.ledgerService.getFamilyPenalties(user.familyId);
  }

  /** Удаление штрафа (только родитель). Пересчитывает баланс ребёнка. */
  @Delete('parent/penalties/:id')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async deletePenalty(@Param('id') id: string, @User() user: { familyId: string }) {
    try {
      return await this.ledgerService.deletePenalty(id, user.familyId);
    } catch (error: any) {
      return { success: false, error: error?.message || 'Не удалось удалить штраф' };
    }
  }

  /** Все ручные бонусы семьи (для дашборда родителя). */
  @Get('parent/bonuses')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async getFamilyBonuses(@User() user: { familyId: string }) {
    return this.ledgerService.getFamilyBonuses(user.familyId);
  }

  /** Удаление бонуса (только родитель). Пересчитывает баланс ребёнка. */
  @Delete('parent/bonuses/:id')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async deleteBonus(@Param('id') id: string, @User() user: { familyId: string }) {
    try {
      return await this.ledgerService.deleteBonus(id, user.familyId);
    } catch (error: any) {
      return { success: false, error: error?.message || 'Не удалось удалить бонус' };
    }
  }

  /** Предпросмотр очистки БД (без удаления). */
  @Get('parent/cleanup-preview')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async cleanupPreview(@User() user: { familyId: string }) {
    try {
      return await this.cleanupService.preview(user.familyId);
    } catch (error: any) {
      return { error: error?.message || 'Не удалось получить предпросмотр' };
    }
  }

  /** Очистить БД от архивных и осиротевших данных. */
  @Post('parent/cleanup')
  @UseGuards(RolesGuard)
  @Roles('PARENT')
  async cleanupRun(@User() user: { familyId: string }) {
    try {
      const result = await this.cleanupService.cleanup(user.familyId);
      return { success: true, ...result };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Очистка не удалась' };
    }
  }

  @Get('child/:childId')
  async getChildLedger(@Param('childId') childId: string, @User() user: any) {
    const childProfile = await this.firestore.findFirst('childProfiles', { userId: childId });
    if (!childProfile) {
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      if (!childProfileById) {
        return { error: 'Child not found' };
      }
    }
    
    const userId = childProfile?.userId || childId;
    return this.ledgerService.getChildLedger(userId);
  }
}
