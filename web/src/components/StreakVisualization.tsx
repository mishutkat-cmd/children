import { Box, Typography, LinearProgress, Chip } from '@mui/material'
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment'
import { motion } from 'framer-motion'

interface StreakState {
  currentStreak?: number
  lastCompletionDate?: string | null
  ruleId?: string
  ruleTitle?: string
  nextBonusAt?: number
}

interface StreakVisualizationProps {
  streakState: StreakState | StreakState[] | any
}

export default function StreakVisualization({ streakState }: StreakVisualizationProps) {
  // Обрабатываем разные форматы streakState
  let streaks: StreakState[] = []
  if (Array.isArray(streakState)) {
    streaks = streakState
  } else if (streakState && typeof streakState === 'object') {
    if (streakState.currentStreak !== undefined) {
      streaks = [streakState]
    } else {
      // Если это объект с несколькими правилами
      streaks = Object.values(streakState).filter((s: any) => s && typeof s === 'object') as StreakState[]
    }
  }

  // Находим максимальный streak и активные правила
  const maxStreak = streaks.length > 0
    ? Math.max(...streaks.map((s: any) => s.currentStreak || 0), 0)
    : streakState?.currentStreak || 0

  // Находим активное правило с максимальным streak
  const activeStreak = streaks.length > 0
    ? streaks.reduce((max, s) => (s.currentStreak || 0) > (max.currentStreak || 0) ? s : max, streaks[0])
    : streakState

  const nextBonusAt = activeStreak?.nextBonusAt || 3 // По умолчанию 3 дня
  const progress = maxStreak > 0 ? Math.min(100, (maxStreak / nextBonusAt) * 100) : 0

  const getDaysText = (days: number) => {
    if (days === 1) return 'день'
    if (days > 1 && days < 5) return 'дня'
    return 'дней'
  }

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column', 
        alignItems: 'center', 
        justifyContent: 'center', 
        height: '100%',
        p: 2,
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
        <motion.div
          animate={maxStreak > 0 ? {
            scale: [1, 1.2, 1],
            rotate: [0, 10, -10, 0],
          } : {}}
          transition={{
            duration: 1.5,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <LocalFireDepartmentIcon
            sx={{
              fontSize: 60,
              color: maxStreak > 0 ? '#FF9500' : '#C7C7CC',
              filter: maxStreak > 0 ? 'drop-shadow(0 0 10px rgba(255, 149, 0, 0.5))' : 'none',
            }}
          />
        </motion.div>
        <Box>
          <Typography 
            variant="h2" 
            sx={{
              color: maxStreak > 0 ? '#FF9500' : '#86868B',
              fontWeight: 700,
              letterSpacing: '-0.02em',
              lineHeight: 1,
            }}
          >
            {maxStreak}
          </Typography>
          {activeStreak?.ruleTitle && (
            <Typography 
              variant="caption" 
              sx={{
                color: maxStreak > 0 ? '#FF9500' : '#86868B',
                fontSize: '0.65rem',
                display: 'block',
                mt: 0.5,
              }}
            >
              {activeStreak.ruleTitle}
            </Typography>
          )}
        </Box>
      </Box>
      
      <Typography 
        variant="h6" 
        sx={{
          color: maxStreak > 0 ? '#FF9500' : '#86868B',
          fontWeight: 600,
          letterSpacing: '-0.01em',
          mb: 1,
        }}
      >
        {maxStreak > 0 ? `${getDaysText(maxStreak)} подряд! 🔥` : 'Начни свой streak!'}
      </Typography>

      {maxStreak > 0 && maxStreak < nextBonusAt && (
        <Box sx={{ width: '100%', mb: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)' }}>
              До бонуса
            </Typography>
            <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.8)' }}>
              {maxStreak} / {nextBonusAt}
            </Typography>
          </Box>
          <LinearProgress
            variant="determinate"
            value={progress}
            sx={{
              height: 6,
              borderRadius: 3,
              backgroundColor: 'rgba(255,255,255,0.2)',
              '& .MuiLinearProgress-bar': {
                borderRadius: 3,
                background: 'linear-gradient(90deg, #FF9500 0%, #FF6B6B 100%)',
              },
            }}
          />
        </Box>
      )}

      {maxStreak >= nextBonusAt && (
        <Chip
          label="Бонус активен! 🎁"
          size="small"
          sx={{
            backgroundColor: '#FF9500',
            color: 'white',
            fontWeight: 600,
            mb: 1,
          }}
        />
      )}

      {maxStreak === 0 && (
        <Typography 
          variant="body2" 
          sx={{ 
            mt: 1, 
            textAlign: 'center',
            color: 'rgba(255,255,255,0.8)',
            fontSize: '0.75rem',
          }}
        >
          Выполняй задания каждый день, чтобы получить бонус! ⭐
        </Typography>
      )}
    </Box>
  )
}
