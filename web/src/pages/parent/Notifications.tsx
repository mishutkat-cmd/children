import { useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, Chip2, dayGroup, labelCaps, useKids } from '../../components/parent/kit'
import NotifPrefs, { NOTIF_KINDS, type NotifKind } from '../../components/parent/NotifPrefs'
import { ActionRow, FeedRow, useMarkRead, useNotifFeed } from '../../components/parent/notifications'
import { tokens } from '../../theme'

const KIND_LABEL: Record<NotifKind, string> = { completions: 'Дела', badges: 'Награды', location: 'Места' }

/** Все уведомления (V_Notif_B): фильтры слева, «что присылать» справа. */
export default function ParentNotifications() {
  const { kids } = useKids()
  const { actions, feed, isLoading, snooze } = useNotifFeed()
  const { all } = useMarkRead()
  const [onlyActions, setOnlyActions] = useState(false)
  const [kid, setKid] = useState<string | null>(null)
  const [kind, setKind] = useState<NotifKind | null>(null)

  const byKid = <T extends { kid?: { userId: string } }>(x: T) => !kid || x.kid?.userId === kid
  const shownActions = actions.filter(byKid).filter(() => !kind || kind === 'completions')
  const shownFeed = onlyActions ? [] : feed.filter(byKid).filter((f) => !kind || f.kind === kind)
  const days = [...new Set(shownFeed.map((f) => dayGroup(f.at)))]
  const reset = () => { setOnlyActions(false); setKid(null); setKind(null) }

  return (
    <Layout>
      <PageHeader title="Уведомления">
        {feed.some((f) => !f.read) && <Button variant="outlined" disabled={all.isPending} onClick={() => all.mutate()}>Прочитать все</Button>}
      </PageHeader>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }} role="group" aria-label="Фильтры">
        <Chip2 on={!onlyActions && !kid && !kind} onClick={reset}>Все · {actions.length + feed.length}</Chip2>
        <Chip2 on={onlyActions} onClick={() => setOnlyActions(!onlyActions)}>Нужно действие · {actions.length}</Chip2>
        {kids.length > 1 && kids.map((k) => <Chip2 key={k.userId} on={kid === k.userId} onClick={() => setKid(kid === k.userId ? null : k.userId)}>{k.name}</Chip2>)}
        {NOTIF_KINDS.map((k) => <Chip2 key={k.key} on={kind === k.key} onClick={() => setKind(kind === k.key ? null : k.key)}>{KIND_LABEL[k.key]}</Chip2>)}
      </Box>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownActions.length > 0 && (
            <Card sx={{ px: 2.5, py: 1.5, borderColor: '#F4D8A8' }}>
              <Typography sx={{ ...labelCaps, color: tokens.review }}>Нужно действие · {shownActions.length}</Typography>
              {shownActions.map((a) => <ActionRow key={a.key} item={a} snooze={snooze} />)}
            </Card>
          )}
          {days.map((d) => (
            <Card key={d} sx={{ px: 2.5, py: 1.5 }}>
              <Typography sx={{ ...labelCaps, mb: 0.5 }}>{d}</Typography>
              {shownFeed.filter((f) => dayGroup(f.at) === d).map((f) => <FeedRow key={f.key} item={f} />)}
            </Card>
          ))}
          {!isLoading && !shownActions.length && !shownFeed.length && (
            <Card sx={{ p: 4, textAlign: 'center' }}>
              <Typography sx={{ fontWeight: 600 }}>Здесь пусто</Typography>
              <Typography sx={{ fontSize: 14, color: tokens.text3, mt: 0.5 }}>
                {onlyActions || kid || kind ? 'По этому фильтру ничего нет.' : 'Здесь появятся дела на проверку, награды и приход детей в места.'}
              </Typography>
              {(onlyActions || kid || kind) && <Button sx={{ mt: 1.5 }} onClick={reset}>Показать все</Button>}
            </Card>
          )}
        </Box>
        <Card sx={{ p: 2.5, position: { lg: 'sticky' }, top: 28 }}>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>Что присылать</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3, mb: 1 }}>Одинаковые события за день собираем в одно</Typography>
          <NotifPrefs />
        </Card>
      </Box>
    </Layout>
  )
}
