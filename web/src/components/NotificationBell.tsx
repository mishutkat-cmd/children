import { useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Badge, Box, Button, IconButton, Popover, Typography } from '@mui/material'
import { ActionRow, FeedRow, useMarkRead, useNotifFeed } from './parent/notifications'
import { dayKey, labelCaps } from './parent/kit'
import { Icon } from './ui'
import { tokens } from '../theme'

/** Колокольчик в правом верху (V_Notif_A): «Нужно действие», «Сегодня», «Ранее». */
export default function NotificationBell() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const { actions, feed, unread, snooze } = useNotifFeed()
  const { all } = useMarkRead()
  const close = () => setAnchor(null)
  const today = dayKey(new Date())
  const todayItems = feed.filter((f) => dayKey(new Date(f.at)) === today)
  const earlier = feed.filter((f) => dayKey(new Date(f.at)) !== today).slice(0, 6)
  const hasUnreadFeed = feed.some((f) => !f.read)

  return (
    <>
      <IconButton onClick={(e) => setAnchor(e.currentTarget)} aria-label={unread ? `Уведомления, новых: ${unread}` : 'Уведомления'}
        sx={{ width: 44, height: 44, border: `1px solid ${tokens.line}`, bgcolor: tokens.paper, '&:hover': { bgcolor: tokens.bg } }}>
        <Badge badgeContent={unread} color="error" max={99}><Icon name="bell" size={20} /></Badge>
      </IconButton>
      <Popover open={!!anchor} anchorEl={anchor} onClose={close} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        slotProps={{ paper: { sx: { mt: 1, width: 400, maxWidth: 'calc(100vw - 32px)', maxHeight: '80vh', borderRadius: '18px', display: 'flex', flexDirection: 'column' } } }}>
        <Box sx={{ display: 'flex', alignItems: 'center', px: 2.5, pt: 2, pb: 1 }}>
          <Typography component="h2" sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>Уведомления</Typography>
          {hasUnreadFeed && <Button size="small" disabled={all.isPending} onClick={() => all.mutate()}>Прочитать все</Button>}
        </Box>
        <Box sx={{ overflowY: 'auto', px: 2.5, pb: 1 }}>
          {actions.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ ...labelCaps, color: tokens.review, mt: 1 }}>Нужно действие · {actions.length}</Typography>
              {actions.map((a) => <ActionRow key={a.key} item={a} onDone={close} snooze={snooze} />)}
            </Box>
          )}
          {todayItems.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ ...labelCaps, mt: 1, mb: 0.5 }}>Сегодня</Typography>
              {todayItems.map((f) => <FeedRow key={f.key} item={f} onOpen={close} />)}
            </Box>
          )}
          {earlier.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography sx={{ ...labelCaps, mt: 1, mb: 0.5 }}>Ранее</Typography>
              {earlier.map((f) => <FeedRow key={f.key} item={f} onOpen={close} />)}
            </Box>
          )}
          {!actions.length && !feed.length && (
            <Box sx={{ py: 4, textAlign: 'center', color: tokens.text3 }}>
              <Icon name="bell" size={28} />
              <Typography sx={{ mt: 1, fontSize: 14 }}>Пока тихо. Здесь появятся дела на проверку, награды и приход детей в места.</Typography>
            </Box>
          )}
        </Box>
        <Box sx={{ borderTop: `1px solid ${tokens.line}`, p: 1 }}>
          <Button fullWidth component={RouterLink} to="/parent/notifications" onClick={close}>Все уведомления</Button>
        </Box>
      </Popover>
    </>
  )
}
