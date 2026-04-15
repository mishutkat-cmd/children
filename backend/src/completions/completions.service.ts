import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { LedgerService } from '../ledger/ledger.service';
import { StreakService } from '../motivation/streak.service';
import { ChallengesService } from '../motivation/challenges.service';
import { BadgesService } from '../badges/badges.service';
import { CreateCompletionDto } from './dto/completions.dto';
// Enums заменены на строки для SQLite
type CompletionStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
type LedgerType = 'EARN' | 'SPEND' | 'BONUS' | 'PENALTY' | 'ADJUST';
type LedgerRefType = 'COMPLETION' | 'EXCHANGE' | 'CHALLENGE' | 'DECAY' | 'MANUAL';

@Injectable()
export class CompletionsService {
  constructor(
    private firestore: FirestoreService,
    private ledgerService: LedgerService,
    private streakService: StreakService,
    private challengesService: ChallengesService,
    private badgesService: BadgesService,
  ) {}

  async create(childId: string, familyId: string, dto: CreateCompletionDto) {
    try {
      console.log('[CompletionsService] create called:', { childId, familyId, taskId: dto.taskId });
      
      // Валидация: убеждаемся, что taskId указан
      if (!dto.taskId) {
        throw new BadRequestException('Task ID is required');
      }
      
      // childId может быть userId или ChildProfile.id
      let childProfileId = childId;
      let userId = childId;

      // Проверяем, является ли childId userId или ChildProfile.id
      console.log('[CompletionsService] Looking for childProfile by userId:', childId);
      const childProfileByUserId = await this.firestore.findFirst('childProfiles', { userId: childId });
      console.log('[CompletionsService] Looking for childProfile by id:', childId);
      const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
      const childProfile = childProfileByUserId || childProfileById;

      if (!childProfile) {
        console.error(`[CompletionsService] Child not found: childId=${childId}, familyId=${familyId}`);
        throw new NotFoundException(`Child not found: childId=${childId}, familyId=${familyId}`);
      }
      
      console.log('[CompletionsService] Child profile found:', { childProfileId: childProfile.id, userId: childProfile.userId });

      // Проверяем, что user принадлежит к familyId
      const user = await this.firestore.findFirst('users', { id: childProfile.userId, familyId });
      if (!user) {
        throw new NotFoundException(`Child not found in family: childId=${childId}, familyId=${familyId}`);
      }

      // Теперь у нас есть и childProfile.id и userId
      childProfileId = childProfile.id;
      userId = childProfile.userId;

      const task = await this.firestore.findFirst('tasks', { id: dto.taskId, familyId });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // Определяем дату выполнения: используем переданную дату или текущую дату
      let targetDate: Date;
      if (dto.performedAt) {
        targetDate = new Date(dto.performedAt);
        targetDate.setHours(0, 0, 0, 0);
      } else {
        targetDate = new Date();
        targetDate.setHours(0, 0, 0, 0);
      }
      
      const targetDateStart = new Date(targetDate);
      targetDateStart.setHours(0, 0, 0, 0);
      const targetDateEnd = new Date(targetDate);
      targetDateEnd.setDate(targetDateEnd.getDate() + 1);
      targetDateEnd.setHours(0, 0, 0, 0);
      
      // Check if already completed on target date - для всех типов задач можно выполнить только один раз в день
      const allCompletions = await this.firestore.findMany('completions', { 
        childId: childProfileId, 
        taskId: task.id,
      });
      
      const existing = allCompletions.find(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        const performedAtDate = new Date(performedAt);
        performedAtDate.setHours(0, 0, 0, 0);
        return performedAtDate.getTime() === targetDateStart.getTime() && 
               (c.status === 'APPROVED' || c.status === 'PENDING');
      });

      if (existing) {
        const dateStr = targetDateStart.toLocaleDateString('ru-RU');
        console.log(`Task ${task.id} already completed on ${dateStr} for child ${childProfileId}. Existing completion:`, {
          id: existing.id,
          status: existing.status,
          performedAt: existing.performedAt,
        });
        throw new BadRequestException(`Задание уже выполнено ${dateStr}. Можно выполнить только один раз в день.`);
      }

      const requiresApproval = task.requiresParentApproval;
      const status: CompletionStatus = requiresApproval ? 'PENDING' : 'APPROVED';
      // Используем переданную дату или текущую дату/время
      const performedAt = dto.performedAt ? new Date(dto.performedAt) : new Date();

      const completionId = crypto.randomUUID();
      
      // Process streak bonuses first to get multiplier (для всех completions)
      const performedAtDate = performedAt instanceof Date ? performedAt : new Date(performedAt);
      const streakBonuses = await this.streakService.processStreakOnCompletion(
        familyId,
        userId,
        task.id,
        performedAtDate,
      );

      // Calculate multiplier from streak bonuses
      // Multiplier применяется только если есть активные streak bonuses с типом MULTIPLIER
      let multiplier = 1;
      if (streakBonuses && streakBonuses.length > 0) {
        for (const bonus of streakBonuses) {
          if (bonus.type === 'MULTIPLIER' && bonus.amount && bonus.amount > 1) {
            multiplier = Math.max(multiplier, bonus.amount);
          }
        }
      }

      // Apply multiplier to task points
      // Если multiplier = 1 (нет бонусов), начисляем точно базовые баллы задания
      const finalPoints = multiplier > 1 
        ? Math.round(task.points * multiplier)
        : task.points; // Используем точное значение без округления, если нет multiplier
      
      console.log('[CompletionsService] Points calculation:', {
        taskId: task.id,
        taskTitle: task.title,
        basePoints: task.points,
        multiplier,
        finalPoints,
        hasStreakBonuses: streakBonuses && streakBonuses.length > 0,
        streakBonuses: streakBonuses
      });
      
      // Баллы начисляются сразу, независимо от requiresParentApproval
      // Если требуется подтверждение, статус будет PENDING, но баллы уже начислены
      const pointsAwarded = finalPoints;

      // Определяем, кто создал completion (родитель или ребенок)
      // Если childId (первый параметр функции) === userId (из childProfile), то это ребенок сам создал
      // Проверяем, был ли вызван из child endpoint или parent endpoint
      const createdByUserId = childId === userId ? userId : null; // null означает, что родитель создал
      
      await this.firestore.create('completions', {
        id: completionId,
        familyId,
        pointsAwarded: pointsAwarded,
        childId: childProfileId,
        taskId: task.id,
        note: dto.note ?? null,
        proofUrl: dto.proofUrl ?? null,
        status,
        performedAt,
        createdByUserId: createdByUserId ?? null, // null = родитель, userId = ребенок
        ...(status === 'APPROVED' && { approvedAt: new Date() }),
      }, completionId);
      
      // Создаем уведомление для родителя, если completion создан ребенком
      if (createdByUserId) {
        try {
          const childProfileForNotification = await this.firestore.findFirst('childProfiles', { id: childProfileId });
          const notificationId = crypto.randomUUID();
          await this.firestore.create('notifications', {
            id: notificationId,
            familyId,
            type: 'COMPLETION_CREATED',
            title: 'Ребенок выполнил задание',
            message: `${childProfileForNotification?.name || 'Ребенок'} выполнил задание "${task.title}"`,
            childId: childProfileId,
            userId: userId,
            refType: 'COMPLETION',
            refId: completionId,
            read: false,
            createdAt: new Date(),
          }, notificationId);
        } catch (notificationError: any) {
          console.error('[CompletionsService] Error creating notification:', notificationError.message);
          // Не прерываем выполнение, если уведомление не создалось
        }
      }

      const completion = await this.firestore.findFirst('completions', { id: completionId });
      const completionWithTask = {
        ...completion,
        task,
      };

      // Начисляем баллы сразу при выполнении, независимо от статуса
      // LedgerEntry.childId в схеме ссылается на User.id (userId)
      // Проверяем, нет ли уже ledger entry для этого completion (защита от дублирования)
      const existingLedgerEntries = await this.firestore.findMany('ledgerEntries', {
        childId: userId,
        refType: 'COMPLETION',
        refId: completionId,
        type: 'EARN',
      });
      
      if (existingLedgerEntries.length > 0) {
        console.warn('[CompletionsService] Ledger entry already exists for completion:', {
          completionId,
          existingEntries: existingLedgerEntries.map(e => ({ id: e.id, amount: e.amount })),
        });
        // Не создаем дублирующую запись, но продолжаем выполнение
      } else {
        console.log('[CompletionsService] Awarding points:', {
          userId,
          childProfileId,
          finalPoints,
          basePoints: task.points,
          multiplier,
          taskId: task.id,
          taskTitle: task.title,
        });
        
        try {
          await this.ledgerService.createEntry(
            familyId,
            userId,
            'EARN',
            'COMPLETION',
            finalPoints,
            completionId,
            {
              taskTitle: task.title,
              basePoints: task.points,
              multiplier: multiplier > 1 ? multiplier : undefined,
              requiresApproval: requiresApproval,
            },
          );
          console.log('[CompletionsService] Points awarded successfully');
        } catch (ledgerError: any) {
          console.error('[CompletionsService] Error awarding points:', ledgerError.message);
          console.error('[CompletionsService] Ledger error stack:', ledgerError.stack);
          // Не прерываем выполнение, но логируем ошибку
          throw new BadRequestException(`Failed to award points: ${ledgerError.message}`);
        }
      }

      return completionWithTask;
    } catch (error) {
      console.error('Error in CompletionsService.create:', error);
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException(`Failed to create completion: ${error.message}`);
    }
  }

  async findAll(childId: string, familyId: string, from?: Date, to?: Date, taskId?: string) {
    // childId может быть userId или ChildProfile.id
    let childProfileId = childId;
    
    // Проверяем, является ли childId userId или ChildProfile.id
    const childProfileByUserId = await this.firestore.findFirst('childProfiles', { userId: childId });
    const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
    const childProfile = childProfileByUserId || childProfileById;
    
    if (childProfile) {
      childProfileId = childProfile.id;
    }
    
    // Строим условия для запроса
    const where: any = { childId: childProfileId, familyId };
    if (taskId) {
      where.taskId = taskId;
    }
    
    const completions = await this.firestore.findMany('completions', where, { performedAt: 'desc' });
    
    // Filter by date range if provided
    let filtered = completions;
    if (from || to) {
      filtered = completions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        if (from && performedAt < from) return false;
        if (to && performedAt > to) return false;
        return true;
      });
    }
    
    // Add task for each completion
    const result = [];
    for (const completion of filtered) {
      const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
      result.push({
        ...completion,
        task,
      });
    }
    
    return result;
  }

  async findPending(familyId: string) {
    try {
      console.log('[CompletionsService] findPending called for familyId:', familyId);
      const completions = await this.firestore.findMany('completions', { familyId, status: 'PENDING' }, { createdAt: 'desc' });
      console.log('[CompletionsService] Found pending completions:', completions.length);

      const result = [];
      for (const completion of completions) {
        try {
          const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
          
          // childId в completion это childProfileId, но проверим оба варианта
          let childProfile = null;
          let user = null;
          if (completion.childId) {
            const childProfileById = await this.firestore.findFirst('childProfiles', { id: completion.childId });
            const childProfileByUserId = await this.firestore.findFirst('childProfiles', { userId: completion.childId });
            childProfile = childProfileById || childProfileByUserId;
            
            // Получаем user для получения login и email
            if (childProfile) {
              user = await this.firestore.findFirst('users', { id: childProfile.userId, familyId });
            }
          }
          
          // Формируем объект child с полной информацией
          const childData: any = {
            ...childProfile,
            childProfile: childProfile, // Для совместимости с фронтендом
            user: user, // Добавляем user для получения login
            login: user?.login || null,
            email: user?.email || null,
            // Добавляем name напрямую для удобства
            name: childProfile?.name || user?.login || null,
          };
          
          result.push({
            ...completion,
            task,
            child: childData,
          });
        } catch (error: any) {
          console.error('[CompletionsService] Error processing completion:', error.message);
          // Продолжаем обработку других completions
        }
      }
      return result;
    } catch (error: any) {
      console.error('[CompletionsService] Error in findPending:', error.message);
      console.error('[CompletionsService] Error stack:', error.stack);
      throw error;
    }
  }

  async approve(id: string, familyId: string) {
    const completion = await this.firestore.findFirst('completions', { id, familyId });

    if (!completion) {
      throw new NotFoundException('Completion not found');
    }

    if (completion.status !== 'PENDING') {
      throw new BadRequestException('Completion is not pending');
    }

    const task = await this.firestore.findFirst('tasks', { id: completion.taskId });
    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const childProfile = await this.firestore.findFirst('childProfiles', { id: completion.childId });
    if (!childProfile) {
      throw new NotFoundException('Child profile not found');
    }

    // completion.childId это ChildProfile.id согласно схеме
    // Но для ledger и streak нужен userId
    const userId = childProfile.userId;

    // Баллы уже начислены при создании completion, просто обновляем статус
    // Проверяем, были ли уже начислены баллы
    const pointsAlreadyAwarded = completion.pointsAwarded > 0;

    // Проверяем, есть ли уже запись в ledger для этого completion, чтобы избежать дублирования
    const existingLedgerEntries = await this.firestore.findMany('ledgerEntries', {
      childId: userId,
      refType: 'COMPLETION',
      refId: completion.id,
      type: 'EARN',
    });
    
    const hasLedgerEntry = existingLedgerEntries.length > 0;
    console.log('[CompletionsService] approve - Checking for duplicate ledger entries:', {
      completionId: completion.id,
      pointsAlreadyAwarded,
      hasLedgerEntry,
      existingEntriesCount: existingLedgerEntries.length,
    });

    await this.firestore.update('completions', id, {
      status: 'APPROVED',
      approvedAt: new Date(),
      // pointsAwarded уже установлен при создании, не меняем
    });

    const updated = await this.firestore.findFirst('completions', { id });

    // Если баллы еще не начислены (старая логика), начисляем их сейчас
    // Но с новой логикой баллы уже начислены при создании
    // Также проверяем, что нет записи в ledger, чтобы избежать дублирования
    if (!pointsAlreadyAwarded && !hasLedgerEntry) {
      // Process streak bonuses first to get multiplier
      const performedAt = completion.performedAt?.toDate ? completion.performedAt.toDate() : new Date(completion.performedAt);
      const streakBonuses = await this.streakService.processStreakOnCompletion(
        familyId,
        userId,
        completion.taskId,
        performedAt,
      );

      // Calculate multiplier from streak bonuses
      // Multiplier применяется только если есть активные streak bonuses с типом MULTIPLIER
      let multiplier = 1;
      if (streakBonuses && streakBonuses.length > 0) {
        for (const bonus of streakBonuses) {
          if (bonus.type === 'MULTIPLIER' && bonus.amount && bonus.amount > 1) {
            multiplier = Math.max(multiplier, bonus.amount);
          }
        }
      }

      // Apply multiplier to task points
      // Если multiplier = 1 (нет бонусов), начисляем точно базовые баллы задания
      const finalPoints = multiplier > 1 
        ? Math.round(task.points * multiplier)
        : task.points; // Используем точное значение без округления, если нет multiplier
      
      console.log('[CompletionsService] approve - Points calculation:', {
        taskId: task.id,
        taskTitle: task.title,
        basePoints: task.points,
        multiplier,
        finalPoints,
        hasStreakBonuses: streakBonuses && streakBonuses.length > 0
      });

      // Update completion with final points
      await this.firestore.update('completions', id, { pointsAwarded: finalPoints });

      // Проверяем еще раз перед созданием ledger entry (на случай параллельных запросов)
      const finalLedgerCheck = await this.firestore.findMany('ledgerEntries', {
        childId: userId,
        refType: 'COMPLETION',
        refId: completion.id,
        type: 'EARN',
      });
      
      if (finalLedgerCheck.length === 0) {
        // Create ledger entry только если его еще нет
        console.log('[CompletionsService] approve - Creating ledger entry for completion:', completion.id);
        await this.ledgerService.createEntry(
          familyId,
          userId,
          'EARN',
          'COMPLETION',
          finalPoints,
          completion.id,
          {
            taskTitle: task.title,
            basePoints: task.points,
            multiplier: multiplier > 1 ? multiplier : undefined,
          },
        );
      } else {
        console.log('[CompletionsService] approve - Ledger entry already exists, skipping');
      }
    } else if (hasLedgerEntry) {
      console.log('[CompletionsService] approve - Points already awarded and ledger entry exists, skipping point award');
    }
    
    // Check and reward challenges for this completion
    const allChallenges = await this.firestore.findMany('challenges', { familyId, status: 'ACTIVE' });
    const now = new Date();
    const activeChallenges = allChallenges.filter(challenge => {
      const startDate = challenge.startDate?.toDate ? challenge.startDate.toDate() : new Date(challenge.startDate);
      const endDate = challenge.endDate?.toDate ? challenge.endDate.toDate() : new Date(challenge.endDate);
      return startDate <= now && endDate >= now;
    });
    
    for (const challenge of activeChallenges) {
      const participants = typeof challenge.participantsJson === 'string' 
        ? JSON.parse(challenge.participantsJson) 
        : challenge.participantsJson || [];
      if (participants.length === 0 || participants.includes(completion.childId)) {
        await this.challengesService.checkAndRewardChallenge(challenge.id, familyId, completion.childId);
      }
    }

    // Проверяем и начисляем бейджи
    const allCompletions = await this.firestore.findMany('completions', { childId: completion.childId, status: 'APPROVED' });
    const totalCompletions = allCompletions.length;
    
    await this.badgesService.checkAndAwardBadges(completion.childId, familyId, {
      totalCompletions,
      streakDays: 0, // Будет обновлено из streak state
    });

    return updated;
  }

  async reject(id: string, familyId: string) {
    const completion = await this.firestore.findFirst('completions', { id, familyId });

    if (!completion) {
      throw new NotFoundException('Completion not found');
    }

    await this.firestore.update('completions', id, {
      status: 'REJECTED',
    });
    
    return this.firestore.findFirst('completions', { id });
  }

  // Отметить задание как не выполненное (отменить completion)
  async markAsNotCompleted(taskId: string, childId: string, familyId: string, date?: Date) {
    const targetDate = date || new Date();
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    // childId может быть userId или ChildProfile.id - нужно конвертировать в ChildProfile.id для Completion
    let childProfileId = childId;
    let userId = childId;

    const childProfileByUserId = await this.firestore.findFirst('childProfiles', { userId: childId });
    const childProfileById = await this.firestore.findFirst('childProfiles', { id: childId });
    const childProfile = childProfileByUserId || childProfileById;

    if (!childProfile) {
      throw new NotFoundException(`Child not found: childId=${childId}, familyId=${familyId}`);
    }

    // Проверяем, что user принадлежит к familyId
    const user = await this.firestore.findFirst('users', { id: childProfile.userId, familyId });
    if (!user) {
      throw new NotFoundException(`Child not found in family: childId=${childId}, familyId=${familyId}`);
    }

    childProfileId = childProfile.id;
    userId = childProfile.userId;

    // Найти completion за эту дату (ищем и APPROVED, и PENDING)
    const allCompletions = await this.firestore.findMany('completions', { 
      taskId, 
      childId: childProfileId, 
      familyId,
    });
    
    const completion = allCompletions.find(c => {
      const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
      const isTargetDate = performedAt >= targetDate && performedAt < nextDay;
      const isActive = c.status === 'APPROVED' || c.status === 'PENDING';
      return isTargetDate && isActive;
    });

    if (!completion) {
      console.log('[CompletionsService] markAsNotCompleted - No completion found:', {
        taskId,
        childId,
        childProfileId,
        targetDate: targetDate.toISOString(),
        allCompletionsCount: allCompletions.length,
      });
      // Если completion не найден, просто возвращаем успех (задание уже не выполнено)
      return { success: true, message: 'Task is not marked as completed' };
    }

    const task = await this.firestore.findFirst('tasks', { id: completion.taskId });

    console.log('[CompletionsService] markAsNotCompleted - Found completion:', {
      completionId: completion.id,
      status: completion.status,
      pointsAwarded: completion.pointsAwarded,
      taskId,
      childId,
      userId,
    });

    // Находим все EARN записи для этого completion
    const earnEntries = await this.firestore.findMany('ledgerEntries', {
      childId: userId,
      refType: 'COMPLETION',
      refId: completion.id,
      type: 'EARN',
    });
    
    // Находим все ADJUST записи для этого completion с причиной отмены
    const adjustEntries = await this.firestore.findMany('ledgerEntries', {
      childId: userId,
      refType: 'COMPLETION',
      refId: completion.id,
      type: 'ADJUST',
    });
    
    const cancelledAdjustEntries = adjustEntries.filter(entry => {
      try {
        const meta = typeof entry.metaJson === 'string' ? JSON.parse(entry.metaJson) : entry.metaJson;
        return meta?.reason === 'COMPLETION_CANCELLED';
      } catch {
        return false;
      }
    });
    
    // Суммируем все начисленные баллы из EARN записей
    const totalEarned = earnEntries.reduce((sum, entry) => sum + (entry.amount || 0), 0);
    
    // Суммируем все отнятые баллы из ADJUST записей
    const totalAdjusted = cancelledAdjustEntries.reduce((sum, entry) => sum + Math.abs(entry.amount || 0), 0);
    
    // Рассчитываем, сколько еще нужно отнять
    const remainingPointsToDeduct = totalEarned - totalAdjusted;
    
    console.log('[CompletionsService] markAsNotCompleted - Ledger analysis:', {
      completionId: completion.id,
      completionPointsAwarded: completion.pointsAwarded,
      earnEntriesCount: earnEntries.length,
      totalEarned,
      adjustEntriesCount: adjustEntries.length,
      cancelledAdjustEntriesCount: cancelledAdjustEntries.length,
      totalAdjusted,
      remainingPointsToDeduct,
    });

    // Если есть некомпенсированные баллы - создаем ADJUST запись
    if (remainingPointsToDeduct > 0) {
      console.log('[CompletionsService] markAsNotCompleted - Creating adjust entry to cancel remaining points:', remainingPointsToDeduct);
      await this.ledgerService.createEntry(
        familyId,
        userId, // Используем userId для LedgerEntry
        'ADJUST',
        'COMPLETION',
        -remainingPointsToDeduct,
        completion.id,
        {
          taskTitle: task?.title || 'Unknown',
          reason: 'COMPLETION_CANCELLED',
        },
      );
      console.log('[CompletionsService] markAsNotCompleted - Balance should be updated via ledgerService');
    } else if (remainingPointsToDeduct === 0) {
      console.log('[CompletionsService] markAsNotCompleted - All points already cancelled, skipping');
    } else {
      console.warn('[CompletionsService] markAsNotCompleted - Negative remaining points detected (more adjusted than earned), this should not happen!');
    }

    // Удаляем или помечаем completion как отмененный
    await this.firestore.update('completions', completion.id, {
      status: 'REJECTED',
      pointsAwarded: 0,
    });

    // Убедимся, что баланс обновлен
    try {
      await this.ledgerService.updateChildBalance(userId);
      console.log('[CompletionsService] markAsNotCompleted - Balance updated explicitly');
    } catch (error: any) {
      console.warn('[CompletionsService] markAsNotCompleted - Error updating balance:', error.message);
      // Не прерываем выполнение, так как ledgerService.createEntry уже должен был обновить баланс
    }

    return { success: true, completion };
  }
}
