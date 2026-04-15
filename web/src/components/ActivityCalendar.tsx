import { Box, Typography, IconButton } from '@mui/material'
import { useState } from 'react'
import ArrowBackIosIcon from '@mui/icons-material/ArrowBackIos'
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos'
import { colors } from '../theme'

interface ActivityCalendarProps {
  completions: Array<{ performedAt: string; pointsAwarded: number }>
  year?: number
  month?: number
}

export default function ActivityCalendar({ completions, year, month }: ActivityCalendarProps) {
  const currentDate = new Date()
  const [displayYear, setDisplayYear] = useState(year || currentDate.getFullYear())
  const [displayMonth, setDisplayMonth] = useState(month !== undefined ? month : currentDate.getMonth())

  // Группируем выполнения по дням
  const activityByDate = new Map<string, { count: number; points: number }>()
  
  completions.forEach((completion) => {
    const date = new Date(completion.performedAt)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    
    const existing = activityByDate.get(dateStr) || { count: 0, points: 0 }
    activityByDate.set(dateStr, {
      count: existing.count + 1,
      points: existing.points + (completion.pointsAwarded || 0),
    })
  })

  // Получаем первый и последний день месяца
  const firstDay = new Date(displayYear, displayMonth, 1)
  const lastDay = new Date(displayYear, displayMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startDayOfWeek = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1 // Понедельник = 0

  // Создаем массив дней месяца
  const days = []
  
  // Добавляем пустые ячейки для дней до начала месяца
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push(null)
  }
  
  // Добавляем дни месяца
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${displayYear}-${String(displayMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const activity = activityByDate.get(dateStr)
    days.push({ day, dateStr, activity })
  }

  const handlePrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayMonth(11)
      setDisplayYear(displayYear - 1)
    } else {
      setDisplayMonth(displayMonth - 1)
    }
  }

  const handleNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayMonth(0)
      setDisplayYear(displayYear + 1)
    } else {
      setDisplayMonth(displayMonth + 1)
    }
  }

  const dayNames = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'НД']
  const monthNames = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
  ]

  const isToday = (day: number) => {
    return (
      day === currentDate.getDate() &&
      displayMonth === currentDate.getMonth() &&
      displayYear === currentDate.getFullYear()
    )
  }

  const hasActivity = (dayData: { day: number; dateStr: string; activity?: { count: number; points: number } } | null) => {
    return dayData?.activity && dayData.activity.count > 0
  }

  return (
    <Box sx={{ 
      background: 'transparent', 
      borderRadius: 0, 
      p: 0, 
      border: 'none',
      width: '100%',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
        <IconButton 
          onClick={handlePrevMonth}
          size="small"
          sx={{ color: colors.text.secondary, p: 0.5 }}
        >
          <ArrowBackIosIcon fontSize="small" />
        </IconButton>
        <Typography variant="body2" sx={{ fontWeight: 500, color: colors.text.primary, fontSize: '0.75rem' }}>
          {monthNames[displayMonth]} {displayYear}
        </Typography>
        <IconButton 
          onClick={handleNextMonth}
          size="small"
          sx={{ color: colors.text.secondary, p: 0.5 }}
        >
          <ArrowForwardIosIcon fontSize="small" />
        </IconButton>
      </Box>
      
      <Box sx={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(7, 1fr)', 
        gap: 0.5,
        flex: 1,
        alignContent: 'start',
      }}>
        {dayNames.map((day) => (
          <Box
            key={day}
            sx={{
              textAlign: 'center',
              fontWeight: 500,
              fontSize: '0.7rem',
              color: colors.text.secondary,
              py: 0.75,
            }}
          >
            {day}
          </Box>
        ))}
        
        {days.map((dayData, index) => {
          if (!dayData) {
            return <Box key={`empty-${index}`} sx={{ aspectRatio: '1', minHeight: 32 }} />
          }
          
          const today = isToday(dayData.day)
          const active = hasActivity(dayData)

          return (
            <Box
              key={dayData.dateStr}
              sx={{
                aspectRatio: '1',
                minHeight: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: today ? 600 : 400,
                color: colors.text.primary,
                borderRadius: 0.75,
                backgroundColor: today 
                  ? colors.success.main 
                  : active 
                    ? colors.warning.main 
                    : 'transparent',
                border: today 
                  ? `1.5px solid ${colors.success.dark}` 
                  : active 
                    ? `1px solid ${colors.warning.dark}` 
                    : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': {
                  transform: 'scale(1.15)',
                  zIndex: 1,
                },
              }}
            >
              {dayData.day}
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
