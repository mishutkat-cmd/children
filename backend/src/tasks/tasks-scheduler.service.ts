import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FirestoreService } from '../firestore/firestore.service';
import { CompletionsService } from '../completions/completions.service';
import { LedgerService } from '../ledger/ledger.service';
import { timestampToDate } from '../firestore/firestore.helpers';

@Injectable()
export class TasksSchedulerService {
  private readonly logger = new Logger(TasksSchedulerService.name);

  constructor(
    private firestore: FirestoreService,
    private completionsService: CompletionsService,
    private ledgerService: LedgerService,
  ) {}

  // Запускается каждый день в 00:05
  @Cron('5 0 * * *')
  async markIncompleteTasksAtMidnight() {
    this.logger.log('Starting automatic task completion check at midnight...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Получаем все семьи (уникальные familyId из родителей)
      const parents = await this.firestore.findMany('users', { role: 'PARENT' });
      const uniqueFamilyIds = [...new Set(parents.map(p => p.familyId))];

      for (const familyId of uniqueFamilyIds) {
        // Получаем всех детей в семье
        const childUsers = await this.firestore.findMany('users', { familyId, role: 'CHILD' });

        for (const childUser of childUsers) {
          const childProfiles = await this.firestore.findMany('childProfiles', { userId: childUser.id });
          if (childProfiles.length === 0) continue;
          
          const childProfile = childProfiles[0];
          const childProfileId = childProfile.id;

          // Получаем активные задания для ребенка
          const assignedTaskIds = await this.firestore.findMany('taskAssignments', { childId: childProfileId });
          const assignedIds = assignedTaskIds.map((a) => a.taskId);

          // Получаем все активные задачи семьи
          const allTasks = await this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' });
          
          // Фильтруем: только DAILY задачи, которые назначены ALL или ребенку
          const tasks = allTasks.filter(task => 
            task.frequency === 'DAILY' && 
            (task.assignedTo === 'ALL' || assignedIds.includes(task.id))
          );

          for (const task of tasks) {
            // Проверяем, был ли выполнен task вчера
            const allCompletions = await this.firestore.findMany('completions', {
              childId: childProfileId,
              taskId: task.id,
              familyId,
              status: 'APPROVED',
            });

            const completion = allCompletions.find(c => {
              const performedAt = timestampToDate(c.performedAt);
              return performedAt >= yesterday && performedAt < today;
            });

            // Если completion не найден - задание не выполнено
            if (!completion) {
              this.logger.log(
                `Task ${task.id} (${task.title}) not completed by child ${childUser.id} (${childProfile.name}) on ${yesterday.toDateString()}`,
              );

              // Создаем REJECTED completion для записи о невыполнении
              const completionId = crypto.randomUUID();
              await this.firestore.create('completions', {
                id: completionId,
                familyId,
                childId: childProfileId,
                taskId: task.id,
                status: 'REJECTED',
                pointsAwarded: 0,
                note: 'Автоматически отмечено как не выполненное после полуночи',
                performedAt: yesterday,
              }, completionId);

              // Можно также добавить penalty через ledger если нужно
            }
          }
        }
      }

      this.logger.log('Automatic task completion check completed.');
    } catch (error) {
      this.logger.error('Error in markIncompleteTasksAtMidnight:', error);
    }
  }
}
