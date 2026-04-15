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
      
      // Добавляем taskAssignments для каждой задачи
      const result = [];
      for (const task of filteredTasks) {
        try {
          const assignments = await this.firestore.findMany('taskAssignments', { taskId: task.id });
          const assignmentsWithChildren = [];
          for (const assignment of assignments) {
            try {
              const childProfile = await this.firestore.findFirst('childProfiles', { id: assignment.childId });
              assignmentsWithChildren.push({
                ...assignment,
                child: childProfile,
              });
            } catch (error: any) {
              if (process.env.NODE_ENV === 'development') {
                console.error('[TasksService] Error loading child profile for assignment:', error.message);
              }
              // Продолжаем без child profile
              assignmentsWithChildren.push({
                ...assignment,
                child: null,
              });
            }
          }
          result.push({
            ...task,
            taskAssignments: assignmentsWithChildren,
          });
        } catch (error: any) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[TasksService] Error processing task:', error.message);
          }
          // Продолжаем обработку других задач
          result.push({
            ...task,
            taskAssignments: [],
          });
        }
      }
      
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
        daysOfWeek: dto.daysOfWeek ? JSON.stringify(dto.daysOfWeek) : null,
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
        updateData.daysOfWeek = dto.daysOfWeek && dto.daysOfWeek.length > 0 ? JSON.stringify(dto.daysOfWeek) : null;
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

  async getTodayStatistics(familyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Get all active tasks
    const tasks = await this.firestore.findMany('tasks', { familyId, status: 'ACTIVE' });
    
    // Get all children
    const children = await this.firestore.findMany('users', { familyId, role: 'CHILD' });

    const statistics: Record<string, any> = {
      totalTasks: tasks.length,
      totalPointsAvailable: 0,
      totalPointsEarned: 0,
      children: [],
    };

    // Calculate statistics per child
    for (const child of children) {
      const childProfiles = await this.firestore.findMany('childProfiles', { userId: child.id });
      const childProfile = childProfiles.length > 0 ? childProfiles[0] : null;
      const childProfileId = childProfile?.id || '';
      
      console.log('[TasksService] getTodayStatistics - Child:', {
        userId: child.id,
        childProfileId,
        childProfileName: childProfile?.name,
        childLogin: child.login,
        childEmail: child.email,
      });

      let pointsEarned = 0;
      let pointsAvailable = 0;
      let completedTasks = 0;
      let pendingTasks = 0;
      const completedTasksList: any[] = [];
      let totalAssignedTasks = 0; // Общее количество задач, назначенных ребенку

      for (const task of tasks) {
        // Пропускаем архивированные задачи
        if (task.status !== 'ACTIVE') continue;
        
        // Check if task is assigned to this child
        const isAssigned = task.assignedTo === 'ALL';
        let isTaskAssignedToChild = isAssigned;
        
        if (!isAssigned) {
          const assignments = await this.firestore.findMany('taskAssignments', { taskId: task.id, childId: childProfileId });
          isTaskAssignedToChild = assignments.length > 0;
          if (!isTaskAssignedToChild) continue; // Пропускаем задачи, не назначенные ребенку
        }
        
        // Увеличиваем счетчик назначенных задач
        totalAssignedTasks++;

        // Get today's completions for this task and child (both APPROVED and PENDING)
        // Проверяем оба варианта: childId может быть childProfileId или userId
        let allCompletions = await this.firestore.findMany('completions', { 
          taskId: task.id, 
          childId: childProfileId,
        });
        
        // Если не нашли по childProfileId, пробуем найти по userId
        if (allCompletions.length === 0) {
          allCompletions = await this.firestore.findMany('completions', { 
            taskId: task.id, 
            childId: child.id,
          });
        }
        
        // Filter by date (today) and status (APPROVED or PENDING)
        const todayCompletions = allCompletions.filter(c => {
          const performedAt = c.performedAt?.toDate ? c.performedAt.toDate() : new Date(c.performedAt);
          const isToday = performedAt >= today && performedAt < tomorrow;
          const isActive = c.status === 'APPROVED' || c.status === 'PENDING';
          return isToday && isActive;
        });

        pointsAvailable += task.points || 0;

        if (todayCompletions.length > 0) {
          // Начисляем баллы за ВСЕ completions (APPROVED и PENDING), так как баллы начисляются сразу при создании
          // Баллы уже начислены в ledger при создании completion, независимо от статуса
          // Если pointsAwarded не установлен, используем базовые баллы задачи
          const taskPoints = todayCompletions.reduce((sum: number, c: any) => {
            const points = c.pointsAwarded || task.points || 0;
            console.log('[TasksService] Completion points:', {
              completionId: c.id,
              pointsAwarded: c.pointsAwarded,
              taskPoints: task.points,
              usedPoints: points,
            });
            return sum + points;
          }, 0);
          pointsEarned += taskPoints;
          
          console.log('[TasksService] Task completion points:', {
            taskId: task.id,
            taskTitle: task.title,
            completionsCount: todayCompletions.length,
            pointsFromCompletions: taskPoints,
            totalPointsEarned: pointsEarned,
            childProfileId,
            childId: child.id,
          });
          
          // Задание считается выполненным, если есть хотя бы одно completion (APPROVED или PENDING)
          // Важно: задача считается выполненной только один раз, независимо от количества completions
          // Проверяем, не была ли задача уже добавлена в список
          const alreadyAdded = completedTasksList.some(t => t.id === task.id);
          if (!alreadyAdded) {
            completedTasks++;
            // Добавляем полный объект задачи для проверки в UI
            completedTasksList.push(task);
            console.log('[TasksService] Task marked as completed:', {
              taskId: task.id,
              taskTitle: task.title,
              completedTasks,
              totalTasks: tasks.length,
            });
          } else {
            console.log('[TasksService] Task already in completed list, skipping:', task.id);
          }
          
          // pendingTasks НЕ увеличиваем здесь, так как задача уже выполнена
          // pendingTasks учитывает только задачи, которые НЕ выполнены
        } else {
          // Задача не выполнена - увеличиваем pendingTasks только если задача назначена ребенку
          if (isTaskAssignedToChild) {
            pendingTasks++;
            console.log('[TasksService] Task not completed:', {
              taskId: task.id,
              taskTitle: task.title,
              pendingTasks,
              totalAssignedTasks,
            });
          }
        }
      }

      // Получаем имя ребенка: сначала из childProfile.name, затем из child.login, затем fallback
      let childName = 'Ребенок';
      if (childProfile?.name) {
        childName = childProfile.name;
      } else if (child.login) {
        childName = child.login;
      } else if (child.email) {
        childName = child.email.split('@')[0]; // Используем часть email до @
      }

      console.log('[TasksService] Final statistics for child:', {
        childId: child.id,
        childName,
        pointsEarned,
        pointsAvailable,
        completedTasks,
        pendingTasks,
        totalAssignedTasks,
      });

      statistics.children.push({
        childId: child.id,
        childProfileId,
        childName,
        pointsEarned,
        pointsAvailable,
        pointsRemaining: pointsAvailable - pointsEarned,
        completedCount: completedTasks,
        pendingCount: pendingTasks,
        totalTasks: totalAssignedTasks, // Общее количество задач, назначенных ребенку
        completedTasks: completedTasksList, // Полные объекты Task для проверки в UI
      });

      statistics.totalPointsAvailable += pointsAvailable;
      statistics.totalPointsEarned += pointsEarned;
    }

    return statistics;
  }
}
