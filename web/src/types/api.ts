// API Response Types

export interface ApiError {
  message: string
  statusCode?: number
}

export interface User {
  id: string
  role: 'PARENT' | 'CHILD'
  email?: string
  login: string
  familyId: string
  createdAt: string
  updatedAt: string
  childProfile?: ChildProfile
}

export interface ChildProfile {
  id: string
  userId: string
  name: string
  avatarUrl?: string
  pointsBalance: number
  pointsProtected: number
  streakState?: string
  selectedCharacterId?: string | null
  createdAt: string
  updatedAt: string
}

export interface Task {
  id: string
  familyId: string
  title: string
  description?: string
  icon?: string
  category?: string
  points: number
  status: 'ACTIVE' | 'ARCHIVED'
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM'
  daysOfWeek?: string
  assignedTo: string
  requiresProof: boolean
  requiresParentApproval: boolean
  createdAt: string
  updatedAt: string
  taskAssignments?: Array<{
    id: string
    taskId: string
    childId: string
    child?: ChildProfile
  }>
}

export interface Completion {
  id: string
  familyId: string
  childId: string
  taskId: string
  performedAt: string
  note?: string
  proofUrl?: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED'
  pointsAwarded: number
  approvedAt?: string
  createdAt: string
  updatedAt: string
  child?: User
  task?: Task
  createdByUserId?: string | null // null = родитель, userId = ребенок
}

export interface Challenge {
  id: string
  familyId: string
  title: string
  description?: string
  icon?: string
  pointsReward: number
  status: 'ACTIVE' | 'COMPLETED' | 'ARCHIVED'
  penaltyEnabled: boolean
  penaltyValue: number
  createdAt: string
  updatedAt: string
}

export interface Badge {
  id: string
  familyId: string
  title: string
  description?: string
  icon?: string
  imageUrl?: string
  conditionJson?: string
  createdAt: string
  updatedAt: string
}

export interface Exchange {
  id: string
  childId: string
  rewardGoalId?: string
  pointsSpent: number
  cashCents?: number
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'DELIVERED'
  requestedAt: string
  approvedAt?: string
  deliveredAt?: string
  createdAt: string
  updatedAt: string
  rewardGoal?: RewardGoal
}

export interface RewardGoal {
  id: string
  familyId: string
  title: string
  description?: string
  icon?: string
  costPoints: number
  status: 'ACTIVE' | 'ARCHIVED'
  createdAt: string
  updatedAt: string
}

export interface ChildStatistics {
  childId: string
  childName: string
  totalPointsEarned: number
  totalPointsSpent: number
  currentBalance: number
  todayPointsBalance?: number // Баллы за сегодня для расчета сытости
  moneyEarned: number
  totalMoneyEarned?: number
  totalMoneyEarnedCents?: number
  streakState?: unknown
}

export interface TodayStatistics {
  totalPointsEarned: number
  totalPointsAvailable: number
  completedTasksCount: number
  pendingTasksCount: number
  children: Array<{
    childId: string
    childName: string
    pointsEarned: number
    pointsAvailable: number
    completedCount: number
    pendingCount: number
  }>
}

export interface Character {
  id: string
  familyId: string
  name: string
  imageUrlZero?: string | null // 0 баллов
  imageUrlLow?: string | null // 1-99 баллов
  imageUrlHigh?: string | null // 100+ баллов
  createdAt: string
  updatedAt: string
}

export interface ChildSummary {
  pointsBalance: number
  todayPointsBalance?: number // Баллы за сегодня для расчета сытости
  streak: number
  maxStreak: number
  completedTasksCount: number
  recentCompletions: Completion[]
  character?: Character | null
  profile?: ChildProfile
  pendingCompletions?: number
  pendingExchanges?: number
  streakState?: any
  decayStatus?: any
  activeGoal?: RewardGoal | null
  goalProgress?: {
    current: number
    target: number
    percentage: number
  } | null
}

// Request DTOs
export interface CreateTaskDto {
  title: string
  description?: string
  icon?: string
  category?: string
  points: number
  frequency: 'ONCE' | 'DAILY' | 'WEEKLY' | 'CUSTOM'
  daysOfWeek?: number[]
  assignedTo: string
  requiresProof: boolean
  requiresParentApproval: boolean
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {}

export interface CreateChildDto {
  login: string
  password: string
  name: string
  avatarUrl?: string
}

export interface UpdateChildDto {
  name?: string
  avatarUrl?: string
  pointsProtected?: number
}

export interface CreateCompletionDto {
  taskId: string
  note?: string
  proofUrl?: string
}

export interface CreateChallengeDto {
  title: string
  description?: string
  icon?: string
  pointsReward: number
  penaltyEnabled?: boolean
  penaltyValue?: number
}

export interface CreateBadgeDto {
  title: string
  description?: string
  icon?: string
  imageUrl?: string
  conditionType?: 'DAYS' | 'POINTS' | 'CHALLENGE'
  conditionValue?: number
  conditionChallengeId?: string
}

export interface CreateExchangeDto {
  rewardGoalId: string
}
