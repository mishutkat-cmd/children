import { Box, Tabs, Tab, Typography } from '@mui/material'
import { colors } from '../theme'

interface ChildSwitcherProps {
  value?: number
  onChange?: (index: number) => void
  hideAllChildren?: boolean
  childrenStats: Array<{ childId: string; childName: string }> | null | undefined
  isLoading?: boolean
}

// ВЕРСИЯ: 3.0.0 - максимально упрощенный компонент БЕЗ React.memo и БЕЗ хуков (2026-01-26)
export default function ChildSwitcher({ 
  value: controlledValue = 0, 
  onChange, 
  hideAllChildren = false,
  childrenStats,
  isLoading = false
}: ChildSwitcherProps) {
  // НИКАКИХ ХУКОВ! НИКАКИХ ОПТИМИЗАЦИЙ! ТОЛЬКО ПРОСТАЯ ФУНКЦИЯ!
  
  const normalizedChildrenStats = Array.isArray(childrenStats) ? childrenStats : []
  const childrenCount = normalizedChildrenStats.length
  const hasChildren = childrenCount > 0
  
  const value = controlledValue

  const safeValue = childrenCount === 0 
    ? -1 
    : value === -1 
      ? -1 
      : Math.max(0, Math.min(value, childrenCount - 1))

  const totalTabs = childrenCount === 0 
    ? 0 
    : hideAllChildren 
      ? childrenCount 
      : childrenCount + 1

  const tabsValue = childrenCount === 0 || totalTabs === 0
    ? 0
    : hideAllChildren
      ? Math.max(0, Math.min(safeValue < 0 ? 0 : safeValue, totalTabs - 1))
      : Math.max(0, Math.min(safeValue === -1 ? 0 : safeValue + 1, totalTabs - 1))

  const finalTabsValue = totalTabs === 0 
    ? 0 
    : tabsValue >= 0 && tabsValue < totalTabs 
      ? tabsValue 
      : 0

  const handleChange = (_: React.SyntheticEvent, newValue: number) => {
    if (hideAllChildren) {
      const safeNewValue = Math.max(0, Math.min(newValue, totalTabs - 1))
      onChange?.(safeNewValue)
    } else {
      const safeNewValue = Math.max(0, Math.min(newValue, totalTabs - 1))
      const actualValue = safeNewValue === 0 ? -1 : safeNewValue - 1
      onChange?.(actualValue)
    }
  }

  if (isLoading) {
    return <Box sx={{ mb: 4, minHeight: 48 }} />
  }

  if (!hasChildren) {
    return (
      <Box sx={{ mb: 4, minHeight: 48 }}>
        <Typography variant="body2" sx={{ color: colors.text.secondary, textAlign: 'center', py: 2 }}>
          Нет детей для отображения
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ mb: 4, minHeight: 48 }}>
      <Tabs
        value={finalTabsValue}
        onChange={handleChange}
        variant="scrollable"
        scrollButtons="auto"
        sx={{
          borderBottom: '0.5px solid #D2D2D7',
          '& .MuiTabs-indicator': {
            height: 2,
            backgroundColor: colors.primary.main,
          },
          '& .MuiTab-root': {
            textTransform: 'none',
            fontWeight: 500,
            fontSize: '0.9375rem',
            color: colors.text.secondary,
            minHeight: 48,
            '&.Mui-selected': {
              color: colors.primary.main,
              fontWeight: 600,
            },
            '&:hover': {
              color: colors.primary.main,
            },
          },
        }}
      >
        {!hideAllChildren && <Tab label="Все дети" />}
        {normalizedChildrenStats.map((stat) => (
          <Tab
            key={stat.childId}
            label={stat.childName}
          />
        ))}
      </Tabs>
    </Box>
  )
}
