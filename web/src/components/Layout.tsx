import { useState, type ReactNode } from 'react'
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom'
import { Avatar, Box, ButtonBase, Drawer, IconButton, Menu, MenuItem, Typography } from '@mui/material'
import { useAuthStore } from '../store/authStore'
import { usePendingCompletions } from '../hooks/useCompletions'
import { usePendingExchanges } from '../hooks/useExchanges'
import { tokens } from '../theme'
import { Icon, type IconName } from './ui'
import NotificationBell from './NotificationBell'
import { getFamilyPcToken } from '../lib/familyPc'

type NavItem = { to: string; label: string; icon: IconName; match: (p: string) => boolean; badge?: boolean }

const MAIN: NavItem[] = [
  { to: '/parent', label: 'Сводка', icon: 'home', match: (p) => p === '/parent' || p === '/parent/' },
  { to: '/parent/approvals', label: 'Проверка', icon: 'inbox', match: (p) => p.startsWith('/parent/approvals'), badge: true },
  { to: '/parent/tasks', label: 'Задания', icon: 'list', match: (p) => p.startsWith('/parent/tasks') },
  { to: '/parent/children', label: 'Дети', icon: 'users', match: (p) => p.startsWith('/parent/children') },
]
const MORE: NavItem[] = [
  { to: '/parent/goals', label: 'Цели и награды', icon: 'gift', match: (p) => /^\/parent\/(goals|wishlist|conversion)/.test(p) },
  { to: '/parent/challenges', label: 'Челленджи', icon: 'trophy', match: (p) => p.startsWith('/parent/challenges') },
  { to: '/parent/achievements', label: 'Ачивки', icon: 'medal', match: (p) => /^\/parent\/(achievements|badges)/.test(p) },
  { to: '/parent/reports', label: 'Отчёт', icon: 'chart', match: (p) => p.startsWith('/parent/reports') },
  { to: '/parent/map', label: 'Где дети', icon: 'map', match: (p) => p.startsWith('/parent/map') },
  { to: '/parent/activity', label: 'Экранное время', icon: 'clock', match: (p) => p.startsWith('/parent/activity') },
]
const SETTINGS: NavItem = { to: '/parent/settings', label: 'Настройки', icon: 'settings', match: (p) => p.startsWith('/parent/settings') }

/** Сколько ждёт решения родителя: выполнения + обмены. Общий счётчик для бейджа и сводки. */
export function usePendingCount() {
  const { data: completions = [] } = usePendingCompletions()
  const { data: exchanges = [] } = usePendingExchanges()
  return (completions?.length || 0) + ((exchanges as any[])?.length || 0)
}

function NavLink({ item, pathname, count, onClick }: { item: NavItem; pathname: string; count?: number; onClick?: () => void }) {
  const on = item.match(pathname)
  return (
    <ButtonBase
      component={RouterLink}
      to={item.to}
      onClick={onClick}
      aria-current={on ? 'page' : undefined}
      sx={{
        justifyContent: 'flex-start', gap: 1.5, height: 44, px: 1.5, borderRadius: '12px', fontSize: 14, width: '100%',
        fontWeight: on ? 600 : 500, color: on ? tokens.primaryInk : tokens.text2, bgcolor: on ? tokens.primarySoft : 'transparent',
        '&:hover': { bgcolor: on ? tokens.primarySoft : '#F5F7FC' },
      }}
    >
      <Icon name={item.icon} size={20} stroke={2} />
      {item.label}
      {!!count && (
        <Box component="span" sx={{ ml: 'auto', minWidth: 22, height: 22, px: '6px', borderRadius: '11px', bgcolor: tokens.danger, color: '#FFF', fontSize: 12, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          {count > 99 ? '99+' : count}
        </Box>
      )}
    </ButtonBase>
  )
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { user, clearAuth } = useAuthStore()
  const pending = usePendingCount()
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const label = user?.login || user?.email || 'Родитель'

  return (
    <Box sx={{ width: 240, height: '100%', boxSizing: 'border-box', p: '24px 16px', display: 'flex', flexDirection: 'column', gap: 0.5, bgcolor: tokens.paper, overflowY: 'auto' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2.5, ml: 1.5 }}>
        <Typography sx={{ flex: 1, fontSize: 18, fontWeight: 800, letterSpacing: '-0.01em' }}>Звёздочки</Typography>
        <NotificationBell user={user} />
      </Box>
      <Box component="nav" aria-label="Разделы" sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        {MAIN.map((i) => <NavLink key={i.to} item={i} pathname={pathname} count={i.badge ? pending : undefined} onClick={onNavigate} />)}
        <Typography sx={{ m: '16px 0 4px 12px', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: tokens.text3 }}>Ещё</Typography>
        {MORE.map((i) => <NavLink key={i.to} item={i} pathname={pathname} onClick={onNavigate} />)}
      </Box>
      <Box sx={{ mt: 'auto', pt: 2, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
        <NavLink item={SETTINGS} pathname={pathname} onClick={onNavigate} />
        <ButtonBase
          onClick={(e) => setAnchor(e.currentTarget)}
          aria-label="Аккаунт"
          sx={{ justifyContent: 'flex-start', gap: 1.25, minHeight: 48, px: 1.5, borderRadius: '12px', '&:hover': { bgcolor: '#F5F7FC' } }}
        >
          <Avatar src={user?.avatarUrl || undefined} sx={{ width: 32, height: 32, bgcolor: tokens.primary, fontSize: 14 }}>{label[0]?.toUpperCase()}</Avatar>
          <Box component="span" sx={{ flex: 1, minWidth: 0, textAlign: 'left', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</Box>
          <Icon name="chevronDown" size={18} />
        </ButtonBase>
        <Menu anchorEl={anchor} open={!!anchor} onClose={() => setAnchor(null)} anchorOrigin={{ vertical: 'top', horizontal: 'left' }} transformOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
          <MenuItem onClick={() => { setAnchor(null); onNavigate?.(); navigate('/parent/account') }}>Мой аккаунт</MenuItem>
          <MenuItem onClick={() => { setAnchor(null); onNavigate?.(); navigate('/parent/settings') }}>Настройки</MenuItem>
          <MenuItem onClick={() => { setAnchor(null); clearAuth(); navigate(getFamilyPcToken() ? '/entry' : '/login') }} sx={{ color: tokens.danger }}>Выйти</MenuItem>
        </Menu>
      </Box>
    </Box>
  )
}

/** Каркас родителя: сайдбар 240px (на телефоне — выдвижное меню) и рабочая область. */
export default function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const pending = usePendingCount()
  return (
    <Box sx={{ minHeight: '100dvh', display: 'flex', bgcolor: tokens.bg, color: tokens.text }}>
      <Box component="aside" sx={{ display: { xs: 'none', md: 'block' }, flex: '0 0 240px', borderRight: `1px solid ${tokens.line}`, position: 'sticky', top: 0, height: '100dvh' }}>
        <Sidebar />
      </Box>
      <Drawer open={open} onClose={() => setOpen(false)} sx={{ display: { md: 'none' } }}>
        <Sidebar onNavigate={() => setOpen(false)} />
      </Drawer>
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box sx={{ display: { xs: 'flex', md: 'none' }, alignItems: 'center', gap: 1, px: 1, pt: 'calc(env(safe-area-inset-top, 0px) + 6px)', pb: 0.75, bgcolor: tokens.paper, borderBottom: `1px solid ${tokens.line}`, position: 'sticky', top: 0, zIndex: 1100 }}>
          <IconButton onClick={() => setOpen(true)} aria-label="Меню"><Icon name="list" /></IconButton>
          <Typography sx={{ flex: 1, fontSize: 17, fontWeight: 800 }}>Звёздочки</Typography>
          {pending > 0 && (
            <ButtonBase component={RouterLink} to="/parent/approvals" sx={{ height: 36, px: 1.5, borderRadius: '18px', bgcolor: tokens.reviewSoft, color: tokens.review, fontSize: 13, fontWeight: 700 }}>
              Проверка · {pending}
            </ButtonBase>
          )}
        </Box>
        <Box component="main" sx={{ flex: 1, minWidth: 0, p: { xs: '16px', md: '28px 32px' }, pb: 'calc(env(safe-area-inset-bottom, 0px) + 24px)', display: 'flex', flexDirection: 'column', gap: { xs: 2, md: 2.5 } }}>
          {children}
        </Box>
      </Box>
    </Box>
  )
}

/** Заголовок страницы родителя: надзаголовок, h1 и действия справа. */
export function PageHeader({ kicker, title, children }: { kicker?: ReactNode; title: ReactNode; children?: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, flexDirection: { xs: 'column', sm: 'row' } }}>
      <Box sx={{ flex: 1, minWidth: 0 }}>
        {kicker && <Typography sx={{ fontSize: 13, color: tokens.text3, '&::first-letter': { textTransform: 'uppercase' } }}>{kicker}</Typography>}
        <Typography component="h1" sx={{ mt: '2px', fontSize: { xs: 24, md: 28 }, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</Typography>
      </Box>
      {children && <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>{children}</Box>}
    </Box>
  )
}
