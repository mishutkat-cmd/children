import { useEffect, useRef, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Box, ButtonBase, IconButton, Tooltip } from '@mui/material'
import { tokens } from '../theme'
import { useAuthStore } from '../store/authStore'
import { useChildName, useChildSummary, useStreak } from '../hooks/useChildData'
import { Icon, KidAvatar, StarBadge, type IconName } from './ui'
import { FAMILY_PC_IDLE_MS, getFamilyPcToken, isFamilyPcChild, setFamilyPcChild } from '../lib/familyPc'

const NAV: { to: string; label: string; icon: IconName; match: (p: string) => boolean }[] = [
  { to: '/child', label: 'Сегодня', icon: 'home', match: (p) => p === '/child' || p === '/child/' },
  { to: '/child/tasks', label: 'Задания', icon: 'check', match: (p) => p.startsWith('/child/tasks') },
  { to: '/child/goals', label: 'Цели', icon: 'gift', match: (p) => p.startsWith('/child/goals') || p.startsWith('/child/wishlist') },
  {
    to: '/child/rewards',
    label: 'Награды',
    icon: 'trophy',
    match: (p) => p.startsWith('/child/rewards') || p.startsWith('/child/challenges') || p.startsWith('/child/achievements'),
  },
  { to: '/child/profile', label: 'Я', icon: 'user', match: (p) => p.startsWith('/child/profile') || p.startsWith('/child/pet') },
]

function StreakChip({ days }: { days: number }) {
  if (days < 1) return null
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: '10px', px: 2, py: 1.5, borderRadius: '18px', bgcolor: tokens.streakSoft, color: tokens.streak }}>
      <Icon name="flame" size={26} />
      <Box component="b" sx={{ fontSize: 17, color: tokens.streakInk }}>
        {days} {plural(days, 'день', 'дня', 'дней')} подряд
      </Box>
    </Box>
  )
}

export function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return one
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few
  return many
}

/** Каркас детского веба: слева карточка ребёнка и меню, справа — экран. */
export default function ChildLayout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const clearAuth = useAuthStore((s) => s.clearAuth)
  const name = useChildName()
  const { data: summary } = useChildSummary()
  const streak = useStreak()
  const balance = summary?.pointsBalance ?? 0
  const avatar = (summary as any)?.profile?.avatarUrl

  const logout = () => {
    const pc = isFamilyPcChild()
    setFamilyPcChild(false)
    clearAuth()
    navigate(pc && getFamilyPcToken() ? '/entry' : '/login')
  }

  const logoutRef = useRef(logout)
  logoutRef.current = logout

  // На семейном компьютере ребёнка выкидывает через 20 минут без действий.
  useEffect(() => {
    if (!isFamilyPcChild()) return
    let timer = window.setTimeout(() => logoutRef.current(), FAMILY_PC_IDLE_MS)
    const bump = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => logoutRef.current(), FAMILY_PC_IDLE_MS)
    }
    const events = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }))
    return () => {
      window.clearTimeout(timer)
      events.forEach((e) => window.removeEventListener(e, bump))
    }
  }, [])


  return (
    <Box sx={{ minHeight: '100dvh', bgcolor: tokens.bg, color: tokens.text, display: 'flex' }}>
      {/* Сайдбар — от планшета и шире */}
      <Box
        component="aside"
        sx={{
          display: { xs: 'none', md: 'flex' }, flex: '0 0 260px', flexDirection: 'column', gap: 1, p: '28px 20px',
          position: 'sticky', top: 0, height: '100dvh', boxSizing: 'border-box',
        }}
      >
        <Box
          sx={{ bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}`, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', mb: 1.5 }}
        >
          <KidAvatar src={avatar} size={96} />
          <Box component="b" sx={{ fontSize: 20 }}>{name}</Box>
          <StarBadge value={balance} />
        </Box>
        <Box component="nav" aria-label="Разделы" sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV.map((n) => {
            const on = n.match(pathname)
            return (
              <ButtonBase
                key={n.to}
                component={RouterLink}
                to={n.to}
                aria-current={on ? 'page' : undefined}
                sx={{
                  justifyContent: 'flex-start', gap: '14px', height: 56, px: 2, borderRadius: '18px', fontSize: 18, fontWeight: 800,
                  color: on ? '#FFFFFF' : tokens.text2, bgcolor: on ? tokens.primary : 'transparent',
                  boxShadow: on ? `0 4px 0 ${tokens.primaryDark}` : 'none',
                  '&:hover': { bgcolor: on ? tokens.primary : 'rgba(37,86,232,0.06)' },
                }}
              >
                <Icon name={n.icon} size={26} stroke={2.4} />
                {n.label}
              </ButtonBase>
            )
          })}
        </Box>
        <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
          <StreakChip days={streak} />
          <ButtonBase onClick={logout} sx={{ justifyContent: 'flex-start', gap: '12px', height: 48, px: 2, borderRadius: '16px', fontSize: 16, fontWeight: 800, color: tokens.text3 }}>
            <Icon name="logout" size={22} />
            Выйти
          </ButtonBase>
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Шапка телефона: имя, звёзды, выход */}
        <Box
          sx={{
            display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1.5, px: 2, pt: 'calc(env(safe-area-inset-top, 0px) + 12px)', pb: 1.5,
          }}
        >
          <KidAvatar src={avatar} size={44} />
          <Box component="b" sx={{ fontSize: 19, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</Box>
          <StarBadge value={balance} size={16} />
          <Tooltip title="Выйти">
            <IconButton onClick={logout} aria-label="Выйти" sx={{ color: tokens.text3 }}>
              <Icon name="logout" size={22} />
            </IconButton>
          </Tooltip>
        </Box>

        <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: '8px 16px 104px', md: '32px 32px 28px 8px' }, display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 } }}>
          {children}
        </Box>
      </Box>

      {/* Нижняя панель телефона */}
      <Box
        component="nav"
        aria-label="Разделы"
        sx={{
          display: { xs: 'flex', md: 'none' }, position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1100, bgcolor: tokens.paper,
          borderTop: `1px solid ${tokens.line}`, px: 1, pt: 1, pb: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        }}
      >
        {NAV.map((n) => {
          const on = n.match(pathname)
          return (
            <ButtonBase
              key={n.to}
              component={RouterLink}
              to={n.to}
              aria-current={on ? 'page' : undefined}
              sx={{ flex: 1, flexDirection: 'column', gap: '2px', minHeight: 56, borderRadius: '16px', fontSize: 13, fontWeight: 800, color: on ? tokens.primary : tokens.text3, bgcolor: on ? tokens.primarySoft : 'transparent' }}
            >
              <Icon name={n.icon} size={24} stroke={2.4} />
              {n.label}
            </ButtonBase>
          )
        })}
      </Box>
    </Box>
  )
}
