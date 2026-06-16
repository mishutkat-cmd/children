import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
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

  // Запускается каждый день в 00:05.
  // Pre-Phase-2 this was a four-level nested sequential loop
  // (families × children × tasks × completions) — O(N⁴) per night, with
  // a fresh findMany('tasks') and findMany('taskAssignments') per child
  // for every family. Now the loop is two levels: families in parallel,
  // and per family we prefetch tasks + assignments + yesterday's
  // completions in three batched reads, then group by (taskId, childId)
  // in memory.
  @Cron('5 0 * * *')
  async markIncompleteTasksAtMidnight() {
    this.logger.log('Starting automatic task completion check at midnight...');

    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const parents = await this.firestore.findMany('users', { role: 'PARENT' });
      const uniqueFamilyIds = [...new Set(parents.map((p: any) => p.familyId))];
      this.logger.log(`Processing ${uniqueFamilyIds.length} families`);

      // Families process in parallel; each family does its own prefetch
      // batch and an in-memory group-by. No nested DB scans.
      const results = await Promise.all(
        uniqueFamilyIds.map((familyId) =>
          this.processFamilyMidnight(familyId, yesterday, today).catch((err) => {
            this.logger.error(`Family ${familyId} midnight failed: ${err?.message}`);
            return 0;
          }),
        ),
      );
      const totalMarked = results.reduce((s, n) => s + n, 0);
      this.logger.log(`Automatic task completion check completed. Marked ${totalMarked} entries.`);
    } catch (error) {
      this.logger.error('Error in markIncompleteTasksAtMidnight:', error);
    }
  }

  private async processFamilyMidnight(
    familyId: string,
    yesterday: Date,
    today: Date,
  ): Promise<number> {
    const [childUsers, allTasks] = await Promise.all([
      this.firestore.findMany('users', { familyId, role: 'CHILD' }),
      this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' }),
    ]);
    const dailyTasks = allTasks.filter((t: any) => t.frequency === 'DAILY');
    if (childUsers.length === 0 || dailyTasks.length === 0) return 0;

    const userIds = childUsers.map((u: any) => u.id);
    const profiles = await this.firestore.findMany('childProfiles', {
      userId: { in: userIds },
    });
    const profileByUserId = new Map<string, any>();
    for (const p of profiles) profileByUserId.set(p.userId, p);
    const profileIds = profiles.map((p: any) => p.id);
    if (profileIds.length === 0) return 0;

    // Batched reads scoped to yesterday's window:
    //   assignments for daily tasks ({taskId in dailyTaskIds})
    //   approved completions yesterday for any child of this family
    //   ({childId in profileIds, performedAt: yesterday})
    const dailyTaskIds = dailyTasks.map((t: any) => t.id);
    const [assignments, yesterdayCompletions] = await Promise.all([
      this.firestore.findMany('taskAssignments', { taskId: { in: dailyTaskIds } }),
      this.firestore.findMany('completions', {
        familyId,
        childId: { in: profileIds },
        status: 'APPROVED',
        performedAt: { gte: yesterday, lte: today },
      }),
    ]);

    // Group: assigned[childProfileId] = Set<taskId>
    const assignedByChild = new Map<string, Set<string>>();
    for (const a of assignments) {
      const s = assignedByChild.get(a.childId) ?? new Set<string>();
      s.add(a.taskId);
      assignedByChild.set(a.childId, s);
    }
    // Group: completedKey = `${childProfileId}::${taskId}`
    const completedSet = new Set<string>();
    for (const c of yesterdayCompletions) {
      const performedAt = timestampToDate(c.performedAt);
      if (performedAt >= yesterday && performedAt < today) {
        completedSet.add(`${c.childId}::${c.taskId}`);
      }
    }

    // For each child × task, write a REJECTED row only if missing.
    const toCreate: Array<{ task: any; child: any; childProfileId: string }> = [];
    for (const child of childUsers) {
      const profile = profileByUserId.get(child.id);
      if (!profile) continue;
      const childProfileId = profile.id;
      const childAssigned = assignedByChild.get(childProfileId) ?? new Set();
      for (const task of dailyTasks) {
        const isAssignedToChild =
          task.assignedTo === 'ALL' || childAssigned.has(task.id);
        if (!isAssignedToChild) continue;
        if (completedSet.has(`${childProfileId}::${task.id}`)) continue;
        toCreate.push({ task, child, childProfileId });
      }
    }

    if (toCreate.length === 0) return 0;
    await Promise.all(
      toCreate.map(({ task, child, childProfileId }) => {
        const completionId = crypto.randomUUID();
        this.logger.log(
          `Marking task ${task.id} (${task.title}) incomplete for ${child.login}`,
        );
        return this.firestore.create(
          'completions',
          {
            id: completionId,
            familyId,
            childId: childProfileId,
            taskId: task.id,
            status: 'REJECTED',
            pointsAwarded: 0,
            note: 'Автоматически отмечено как не выполненное после полуночи',
            performedAt: yesterday,
          },
          completionId,
        );
      }),
    );
    return toCreate.length;
  }
}
