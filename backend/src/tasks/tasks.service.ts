import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { FirestoreService } from '../firestore/firestore.service';
import { CreateTaskDto, UpdateTaskDto, AssignTaskDto } from './dto/tasks.dto';
// Enums заменены на строки для SQLite
type TaskStatus = 'ACTIVE' | 'ARCHIVED';
type TaskFrequency = 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM';

@Injectable()
export class TasksService {
  constructor(private firestore: FirestoreService) {}

  async findAll(familyId: string, status?: string) {
    try {
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[TasksService] findAll called:', { familyId, status });
      }
      // Сначала получаем все задачи для familyId БЕЗ сортировки, чтобы избежать требования индекса
      const where: any = { familyId };
      let tasks;
      try {
        // Пытаемся получить с сортировкой
        tasks = await this.firestore.findMany('tasks', where, { createdAt: 'desc' });
      } catch (error: any) {
        // Если ошибка индекса, получаем без сортировки и сортируем в памяти
        if (error.message && error.message.includes('index')) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[TasksService] Index error, fetching without sort and sorting in memory');
          }
          tasks = await this.firestore.findMany('tasks', where);
          // Сортируем в памяти по createdAt
          tasks.sort((a: any, b: any) => {
            const aDate = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const bDate = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return bDate.getTime() - aDate.getTime(); // desc
          });
        } else {
          throw error;
        }
      }
      // Логирование только в development
      if (process.env.NODE_ENV === 'development' && tasks.length > 0) {
        console.log('[TasksService] Found', tasks.length, 'tasks');
      }
      
      // Фильтруем по status в памяти, если нужно (чтобы избежать требования индекса)
      let filteredTasks = tasks;
      if (status) {
        filteredTasks = tasks.filter(task => {
          const matches = task.status === status;
          if (!matches && tasks.length > 0) {
            // Логирование только в development
            if (process.env.NODE_ENV === 'development') {
              console.log('[TasksService] Task filtered out:', task.id);
            }
          }
          return matches;
        });
        // Логирование только в development
        if (process.env.NODE_ENV === 'development') {
          console.log('[TasksService] Filtered by status:', filteredTasks.length, 'from', tasks.length);
        }
      }
      
      // Enrich tasks with their assignments — and each assignment with its
      // child profile — fully in parallel. Previously this was a nested
      // sequential for-of, taking O(tasks × assignments) round-trips.
      const result = await Promise.all(
        filteredTasks.map(async (task) => {
          try {
            const assignments = await this.firestore.findMany('taskAssignments', { taskId: task.id });
            const assignmentsWithChildren = await Promise.all(
              assignments.map(async (assignment) => {
                try {
                  const childProfile = await this.firestore.findFirst('childProfiles', { id: assignment.childId });
                  return { ...assignment, child: childProfile };
                } catch (error: any) {
                  if (process.env.NODE_ENV === 'development') {
                    console.error('[TasksService] Error loading child profile for assignment:', error.message);
                  }
                  return { ...assignment, child: null };
                }
              }),
            );
            return { ...task, taskAssignments: assignmentsWithChildren };
          } catch (error: any) {
            if (process.env.NODE_ENV === 'development') {
              console.error('[TasksService] Error processing task:', error.message);
            }
            return { ...task, taskAssignments: [] };
          }
        }),
      );

      return result;
    } catch (error: any) {
      // Всегда логируем ошибки
      console.error('[TasksService] Error in findAll:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('[TasksService] Error stack:', error.stack);
      }
      // Возвращаем пустой массив вместо ошибки, чтобы не ломать UI
      return [];
    }
  }

  async findOne(id: string, familyId: string) {
    const task = await this.firestore.findFirst('tasks', { id, familyId });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    const assignments = await this.firestore.findMany('taskAssignments', { taskId: id });
    // Оптимизация: загружаем все childProfiles параллельно вместо последовательных запросов
    const assignmentsWithChildren = await Promise.all(
      assignments.map(async (assignment) => {
        try {
          const childProfile = await this.firestore.findFirst('childProfiles', { id: assignment.childId });
          return {
            ...assignment,
            child: childProfile,
          };
        } catch (error: any) {
          // Если профиль не найден, возвращаем без child
          return {
            ...assignment,
            child: null,
          };
        }
      })
    );

    return {
      ...task,
      taskAssignments: assignmentsWithChildren,
    };
  }

  async create(familyId: string, dto: CreateTaskDto) {
    try {
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[TasksService] Creating task:', dto.title);
      }
      const taskId = crypto.randomUUID();
      const taskData = {
        id: taskId,
        familyId,
        title: dto.title,
        description: dto.description || null,
        icon: dto.icon || null,
        category: dto.category || null,
        points: dto.points,
        frequency: dto.frequency,
        daysOfWeek: dto.daysOfWeek && dto.daysOfWeek.length > 0 ? dto.daysOfWeek : null,
        assignedTo: dto.assignedTo || 'ALL',
        requiresProof: dto.requiresProof || false,
        requiresParentApproval: dto.requiresParentApproval !== false, // По умолчанию true
        status: 'ACTIVE',
      };
      
      await this.firestore.create('tasks', taskData, taskId);
      
      const createdTask = await this.firestore.findFirst('tasks', { id: taskId });
      
      if (!createdTask) {
        console.error('[TasksService] Task was not found after creation! TaskId:', taskId);
        throw new Error('Task was created but could not be retrieved');
      }
      
      // Логирование только в development
      if (process.env.NODE_ENV === 'development') {
        console.log('[TasksService] Task created successfully:', taskId);
      }
      
      // Добавляем taskAssignments для возврата (оптимизировано: параллельные запросы)
      const assignments = await this.firestore.findMany('taskAssignments', { taskId: taskId });
      const assignmentsWithChildren = await Promise.all(
        assignments.map(async (assignment) => {
          try {
            const childProfile = await this.firestore.findFirst('childProfiles', { id: assignment.childId });
            return {
              ...assignment,
              child: childProfile,
            };
          } catch (error: any) {
            // Если профиль не найден, возвращаем без child
            return {
              ...assignment,
              child: null,
            };
          }
        })
      );
      
      return {
        ...createdTask,
        taskAssignments: assignmentsWithChildren,
      };
    } catch (error: any) {
      // Всегда логируем ошибки
      console.error('[TasksService] Error creating task:', error.message);
      if (process.env.NODE_ENV === 'development') {
        console.error('[TasksService] Error stack:', error.stack);
      }
      throw error;
    }
  }

  async update(id: string, familyId: string, dto: UpdateTaskDto) {
    try {
      console.log('[TasksService] Updating task:', { id, familyId, dto });
      await this.findOne(id, familyId);
      const updateData: any = {};
      
      // Копируем только определенные поля из dto
      if (dto.title !== undefined) updateData.title = dto.title;
      if (dto.description !== undefined) updateData.description = dto.description || null;
      if (dto.icon !== undefined) updateData.icon = dto.icon || null;
      if (dto.category !== undefined) updateData.category = dto.category || null;
      if (dto.points !== undefined) updateData.points = dto.points;
      if (dto.frequency !== undefined) updateData.frequency = dto.frequency;
      if (dto.daysOfWeek !== undefined) {
        updateData.daysOfWeek = dto.daysOfWeek && dto.daysOfWeek.length > 0 ? dto.daysOfWeek : null;
      }
      if (dto.assignedTo !== undefined) updateData.assignedTo = dto.assignedTo || 'ALL';
      if (dto.requiresProof !== undefined) updateData.requiresProof = dto.requiresProof || false;
      if (dto.requiresParentApproval !== undefined) updateData.requiresParentApproval = dto.requiresParentApproval !== false;
      
      await this.firestore.update('tasks', id, updateData);
      console.log('[TasksService] Task updated successfully:', id);
      
      const updatedTask = await this.firestore.findFirst('tasks', { id });
      if (!updatedTask) {
        console.error('[TasksService] Task was not found after update! TaskId:', id);
        throw new Error('Task was updated but could not be retrieved');
      }
      
      // Добавляем taskAssignments для возврата
      const assignments = await this.firestore.findMany('taskAssignments', { taskId: id });
      const assignmentsWithChildren = [];
      for (const assignment of assignments) {
        try {
          const childProfile = await this.firestore.findFirst('childProfiles', { id: assignment.childId });
          assignmentsWithChildren.push({
            ...assignment,
            child: childProfile,
          });
        } catch (error: any) {
          console.error('[TasksService] Error loading child profile for assignment:', error.message);
          assignmentsWithChildren.push({
            ...assignment,
            child: null,
          });
        }
      }
      
      return {
        ...updatedTask,
        taskAssignments: assignmentsWithChildren,
      };
    } catch (error: any) {
      console.error('[TasksService] Error updating task:', error.message);
      console.error('[TasksService] Error stack:', error.stack);
      throw error;
    }
  }

  async archive(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.firestore.update('tasks', id, { status: 'ARCHIVED' });
    return this.firestore.findFirst('tasks', { id });
  }

  async unarchive(id: string, familyId: string) {
    await this.findOne(id, familyId);
    await this.firestore.update('tasks', id, { status: 'ACTIVE' });
    return this.firestore.findFirst('tasks', { id });
  }

  async delete(id: string, familyId: string) {
    // Проверяем что задача существует и принадлежит familyId
    await this.findOne(id, familyId);
    
    try {
      // 1. Удаляем все taskAssignments для этой задачи
      const assignments = await this.firestore.findMany('taskAssignments', { taskId: id });
      console.log(`[TasksService] Deleting ${assignments.length} taskAssignments for task ${id}`);
      for (const assignment of assignments) {
        await this.firestore.delete('taskAssignments', assignment.id);
      }
      
      // 2. Удаляем саму задачу
      await this.firestore.delete('tasks', id);
      console.log(`[TasksService] Task ${id} deleted successfully`);
      
      return { success: true, message: 'Task deleted successfully' };
    } catch (error: any) {
      console.error('[TasksService] Error deleting task:', error.message);
      console.error('[TasksService] Error stack:', error.stack);
      throw error;
    }
  }

  async assign(id: string, familyId: string, dto: AssignTaskDto) {
    await this.findOne(id, familyId);

    // Remove existing assignments
    const existingAssignments = await this.firestore.findMany('taskAssignments', { taskId: id });
    for (const assignment of existingAssignments) {
      await this.firestore.delete('taskAssignments', assignment.id);
    }

    // Create new assignments
    if (dto.childIds && dto.childIds.length > 0) {
      for (const childId of dto.childIds) {
        const assignmentId = crypto.randomUUID();
        await this.firestore.create('taskAssignments', {
          id: assignmentId,
          taskId: id,
          childId,
        }, assignmentId);
      }
    }

    return this.findOne(id, familyId);
  }

  async getChildTasks(childId: string, familyId: string, todayOnly: boolean = false) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    // Get assigned tasks or ALL tasks (taskAssignments use childProfileId; task.assignedTo may be userId from form)
    const assignedTaskIds = await this.firestore.findMany('taskAssignments', { childId: childProfileId });
    const assignedIds = assignedTaskIds.map((a) => a.taskId);

    // Get all active tasks for family
    const allTasks = await this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' });
    
    // Filter: show task if for ALL, or in taskAssignments for this child, or task.assignedTo === this child's userId
    const tasks = allTasks.filter(task => 
      task.assignedTo === 'ALL' || assignedIds.includes(task.id) || task.assignedTo === childId
    );

    // Add completions for each task
    const tasksWithCompletions = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (const task of tasks) {
      const completionsWhere: any = { childId: childProfileId, taskId: task.id };
      if (todayOnly) {
        // Firestore doesn't support date range queries easily, so we'll filter in memory
        completionsWhere.status = 'APPROVED';
      }
      const allCompletions = await this.firestore.findMany('completions', completionsWhere);
      
      // Filter by date if todayOnly
      const completions = todayOnly 
        ? allCompletions.filter(c => {
            const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
            return performedAt >= today && performedAt < new Date(today.getTime() + 24 * 60 * 60 * 1000);
          })
        : allCompletions;

      tasksWithCompletions.push({
        ...task,
        completions,
      });
    }

    // Filter by frequency for today
    if (todayOnly) {
      const dayOfWeek = today.getDay();
      return tasksWithCompletions.filter((task) => {
        if (task.frequency === 'DAILY') {
          return task.completions.length === 0 || 
                 task.completions.every((c) => c.status !== 'APPROVED');
        }
        if (task.frequency === 'WEEKLY') {
          return true; // Can be done once per week
        }
        if (task.frequency === 'CUSTOM' && task.daysOfWeek) {
          const daysOfWeek = typeof task.daysOfWeek === 'string' 
            ? JSON.parse(task.daysOfWeek) 
            : task.daysOfWeek;
          return Array.isArray(daysOfWeek) && daysOfWeek.includes(dayOfWeek);
        }
        return true; // ONCE
      });
    }

    return tasksWithCompletions;
  }

  async getChildTasksForDate(childId: string, familyId: string, dateString: string) {
    const childProfiles = await this.firestore.findMany('childProfiles', { userId: childId });
    if (childProfiles.length === 0) {
      throw new NotFoundException('Child not found');
    }
    const childProfileId = childProfiles[0].id;

    // Parse date string (YYYY-MM-DD)
    const targetDate = new Date(dateString + 'T00:00:00');
    if (isNaN(targetDate.getTime())) {
      throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
    }
    targetDate.setHours(0, 0, 0, 0);
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    // Get assigned tasks or ALL tasks (taskAssignments use childProfileId; task.assignedTo may be userId)
    const assignedTaskIds = await this.firestore.findMany('taskAssignments', { childId: childProfileId });
    const assignedIds = assignedTaskIds.map((a) => a.taskId);

    // Get all active tasks for family
    const allTasks = await this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' });
    
    // Filter: show task if for ALL, or in taskAssignments, or task.assignedTo === this child's userId
    const tasks = allTasks.filter(task => 
      task.assignedTo === 'ALL' || assignedIds.includes(task.id) || task.assignedTo === childId
    );

    // Add completions for each task
    const tasksWithCompletions = [];
    const dayOfWeek = targetDate.getDay();
    
    for (const task of tasks) {
      // Get completions for the target date
      const allCompletions = await this.firestore.findMany('completions', { 
        childId: childProfileId, 
        taskId: task.id 
      });
      
      // Filter completions by target date
      const completions = allCompletions.filter(c => {
        const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
        performedAt.setHours(0, 0, 0, 0);
        return performedAt.getTime() === targetDate.getTime();
      });

      tasksWithCompletions.push({
        ...task,
        completions,
      });
    }

    // Filter by frequency for the target date
    return tasksWithCompletions.filter((task) => {
      if (task.frequency === 'DAILY') {
        return true; // Daily tasks are available every day
      }
      if (task.frequency === 'WEEKLY') {
        return true; // Can be done once per week
      }
      if (task.frequency === 'CUSTOM' && task.daysOfWeek) {
        const daysOfWeek = typeof task.daysOfWeek === 'string' 
          ? JSON.parse(task.daysOfWeek) 
          : task.daysOfWeek;
        return Array.isArray(daysOfWeek) && daysOfWeek.includes(dayOfWeek);
      }
      // For ONCE tasks, check if they haven't been completed yet
      if (task.frequency === 'ONCE') {
        const hasApprovedCompletion = task.completions.some((c: any) => c.status === 'APPROVED');
        return !hasApprovedCompletion;
      }
      return true;
    });
  }

  /**
   * Per-parent dashboard "today" stats. Pre-Phase-2 this was a
   * triple-nested sequential loop (children × tasks × completions
   * sub-queries) plus tons of console.log per row — 3 kids × 20 tasks
   * = 60+ sequential round-trips per dashboard load. Now it does
   *
   *   1 read for tasks
   *   1 read for children users
   *   1 read for the family's childProfiles ({userId in childIds})
   *   1 read for taskAssignments scoped to the active tasks ({taskId in taskIds})
   *   1 read for today's completions scoped to all of the family's children
   *     ({childId in [...profileIds, ...userIds], performedAt: gte today})
   *
   * Everything else is in-memory grouping. Number of reads is constant
   * regardless of family size.
   */
  async getTodayStatistics(familyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [allTasks, children] = await Promise.all([
      this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' }),
      this.firestore.findMany('users', { familyId, role: 'CHILD' }),
    ]);
    const tasks = allTasks.filter((t: any) => t.status === 'ACTIVE');

    const statistics: Record<string, any> = {
      totalTasks: tasks.length,
      totalPointsAvailable: 0,
      totalPointsEarned: 0,
      children: [],
    };

    if (children.length === 0 || tasks.length === 0) {
      return statistics;
    }

    const childIds = children.map((c: any) => c.id);
    const taskIds = tasks.map((t: any) => t.id);

    const [profiles, assignments] = await Promise.all([
      this.firestore.findMany('childProfiles', { userId: { in: childIds } }),
      this.firestore.findMany('taskAssignments', { taskId: { in: taskIds } }),
    ]);
    const profileByUserId = new Map<string, any>();
    for (const p of profiles) profileByUserId.set(p.userId, p);
    const profileIds = profiles.map((p: any) => p.id);

    // Today's completions across the whole family, in ONE query.
    // completions.childId historically was either childProfile.id or
    // userId depending on the writer — query both id sets.
    const completionIdCandidates = [...new Set([...profileIds, ...childIds])];
    const todayCompletions =
      completionIdCandidates.length > 0
        ? await this.firestore.findMany('completions', {
            childId: { in: completionIdCandidates },
            performedAt: { gte: today, lte: tomorrow },
          })
        : [];

    // Build lookup maps:
    //   assignmentsByTaskAndChild: taskId + childProfileId -> bool
    //   completionsByTaskAndChild: taskId + (childProfileId|userId) -> completion[]
    const assignedKey = (taskId: string, profileId: string) => `${taskId}::${profileId}`;
    const assignedSet = new Set<string>();
    for (const a of assignments) assignedSet.add(assignedKey(a.taskId, a.childId));

    const completionsKey = (taskId: string, anyChildId: string) =>
      `${taskId}::${anyChildId}`;
    const completionsByKey = new Map<string, any[]>();
    for (const c of todayCompletions) {
      if (c.status !== 'APPROVED' && c.status !== 'PENDING') continue;
      const k = completionsKey(c.taskId, c.childId);
      const arr = completionsByKey.get(k) ?? [];
      arr.push(c);
      completionsByKey.set(k, arr);
    }

    for (const child of children) {
      const childProfile = profileByUserId.get(child.id) ?? null;
      const childProfileId = childProfile?.id || '';

      let pointsEarned = 0;
      let pointsAvailable = 0;
      let completedTasks = 0;
      let pendingTasks = 0;
      const completedTasksList: any[] = [];
      let totalAssignedTasks = 0;

      for (const task of tasks) {
        const isAssignedAll = task.assignedTo === 'ALL';
        const isAssignedToChild =
          isAssignedAll || assignedSet.has(assignedKey(task.id, childProfileId));
        if (!isAssignedToChild) continue;
        totalAssignedTasks++;

        // completions.childId might be either id form — check both.
        const matchedCompletions = [
          ...(completionsByKey.get(completionsKey(task.id, childProfileId)) ?? []),
          ...(completionsByKey.get(completionsKey(task.id, child.id)) ?? []),
        ];

        pointsAvailable += task.points || 0;

        if (matchedCompletions.length > 0) {
          pointsEarned += matchedCompletions.reduce(
            (sum: number, c: any) => sum + (c.pointsAwarded || task.points || 0),
            0,
          );
          if (!completedTasksList.some((t) => t.id === task.id)) {
            completedTasks++;
            completedTasksList.push(task);
          }
        } else {
          pendingTasks++;
        }
      }

      const childName =
        childProfile?.name ||
        child.login ||
        (child.email ? child.email.split('@')[0] : 'Ребенок');

      statistics.children.push({
        childId: child.id,
        childProfileId,
        childName,
        pointsEarned,
        pointsAvailable,
        pointsRemaining: pointsAvailable - pointsEarned,
        completedCount: completedTasks,
        pendingCount: pendingTasks,
        totalTasks: totalAssignedTasks,
        completedTasks: completedTasksList,
      });

      statistics.totalPointsAvailable += pointsAvailable;
      statistics.totalPointsEarned += pointsEarned;
    }

    return statistics;
  }
}
