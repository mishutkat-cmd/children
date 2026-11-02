import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Chip2, KidDot, card, useKids, type Kid } from '../../components/parent/kit'
import TaskWizard, { emptyTaskDraft, taskToDraft, type TaskDraft } from '../../components/parent/TaskWizard'
import { Icon, StarIcon, categoryStyle, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useTasks } from '../../hooks/useTasks'
import { SLOTS, completionRate, isAssignedTo, scheduleLabel, slotOf, type Slot } from './task-model'

type Kind = 'all' | 'DAILY' | 'DAYS' | 'ONCE' | 'ARCHIVE'
const SLOT_LOOK: Record<Slot, { icon: IconName; bg: string; color: string; add: string }> = {
  MORNING: { icon: 'sun', bg: tokens.starSoft, color: '#C47F0A', add: 'Добавить на утро' },
  DAY: { icon: 'cloud', bg: tokens.primarySoft, color: tokens.primary, add: 'Добавить на день' },
  EVENING: { icon: 'moon', bg: tokens.reviewSoft, color: tokens.review, add: 'Добавить на вечер' },
}

const kindOf = (t: any): Kind => (t.frequency === 'DAILY' ? 'DAILY' : t.frequency === 'ONCE' ? 'ONCE' : 'DAYS')

/** Задания (V_Tasks_A): карточки по утру/дню/вечеру; создание и правка — мастер по шагам (V_Tasks_B). */
export default function ParentTasks() {
  const location = useLocation()
  const { kids } = useKids()
  const { data: active = [], isLoading } = useTasks('ACTIVE')
  const { data: archived = [] } = useTasks('ARCHIVED')
  const [kidFilter, setKidFilter] = useState('all')
  const [kind, setKind] = useState<Kind>('all')
  const [draft, setDraft] = useState<TaskDraft | null>(null)

  const completionQueries = useQueries({
    queries: kids.map((k) => ({
      queryKey: ['completions', 'range', k.userId, 28],
      queryFn: async () => {
        const from = new Date()
        from.setDate(from.getDate() - 28)
        from.setHours(0, 0, 0, 0)
        return (await api.get(`/completions/parent/completions/${k.userId}?from=${from.toISOString()}`)).data || []
      },
      staleTime: 60_000,
    })),
  })
  const allCompletions = useMemo(() => completionQueries.flatMap((q) => (q.data as any[]) || []), [completionQueries])

  useEffect(() => {
    if ((location.state as any)?.create) setDraft(emptyTaskDraft())
  }, [location.state])

  const list = active as any[]
  const source = kind === 'ARCHIVE' ? (archived as any[]) : list
  const rows = source.filter((t) => {
    if (kind !== 'all' && kind !== 'ARCHIVE' && kindOf(t) !== kind) return false
    if (kidFilter !== 'all') {
      const k = kids.find((x) => x.userId === kidFilter)
      if (!k || !isAssignedTo(t, k)) return false
    }
    return true
  })
  const countFor = (k: Kid) => list.filter((t) => isAssignedTo(t, k)).length
  const assignees = (t: any) => kids.filter((k) => isAssignedTo(t, k))

  const kidChip = (_on: boolean) => ({ display: 'inline-flex', alignItems: 'center', gap: 1, pl: 0.75 } as const)

  if (draft) {
    return (
      <Layout>
        <PageHeader kicker={draft.id ? 'Правка · шаги можно переключать' : 'Каждый шаг — один вопрос'} title={draft.id ? draft.title || 'Задание' : 'Новое задание'}>
          <Button variant="outlined" onClick={() => setDraft(null)}>Отмена</Button>
        </PageHeader>
        <TaskWizard key={draft.id || 'new'} initial={draft} kids={kids} onClose={() => setDraft(null)} />
      </Layout>
    )
  }

  return (
    <Layout>
      <PageHeader kicker={`${list.length} активных · у каждого задания видно, кому, когда и сколько звёзд`} title="Задания">
        <Button variant="outlined" onClick={() => setDraft(emptyTaskDraft())}>Шаблоны</Button>
        <Button variant="contained" startIcon={<Icon name="plus" size={18} />} onClick={() => setDraft(emptyTaskDraft())}>Новое задание</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, flexWrap: 'wrap' }}>
        <Chip2 on={kidFilter === 'all'} onClick={() => setKidFilter('all')}>Все дети</Chip2>
        {kids.map((k) => (
          <Chip2 key={k.userId} on={kidFilter === k.userId} onClick={() => setKidFilter(k.userId)} sx={kidChip(kidFilter === k.userId)}>
            <KidDot name={k.name} index={k.index} pet={k.pet} size={30} />
            {k.name} · {countFor(k)}
          </Chip2>
        ))}
        <Box sx={{ flex: 1 }} />
        {([['DAILY', 'Каждый день'], ['DAYS', 'По дням'], ['ONCE', 'Разовые'], ['ARCHIVE', `Архив${(archived as any[]).length ? ` · ${(archived as any[]).length}` : ''}`]] as const).map(([id, label]) => (
          <Chip2 key={id} on={kind === id} onClick={() => setKind(kind === id ? 'all' : id)}>{label}</Chip2>
        ))}
      </Box>

      {isLoading ? <CircularProgress sx={{ alignSelf: 'center', m: 4 }} /> : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2.25, alignItems: 'start' }}>
          {SLOTS.map((s) => {
            const look = SLOT_LOOK[s.id]
            const items = rows.filter((t) => slotOf(t) === s.id).sort((a, b) => (a.time || '99').localeCompare(b.time || '99'))
            return (
              <Box key={s.id} sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, minWidth: 0 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, fontSize: 15, fontWeight: 700 }}>
                  <Box component="span" sx={{ width: 32, height: 32, borderRadius: '10px', bgcolor: look.bg, color: look.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={look.icon} size={18} /></Box>
                  {s.label}
                  <Box component="span" sx={{ color: tokens.text3, fontWeight: 500, fontSize: 13 }}>{items.length || ''}</Box>
                </Box>
                {items.map((t) => {
                  const cat = categoryStyle(t.category)
                  const rate = completionRate(t, allCompletions, kids)
                  return (
                    <ButtonBase key={t.id} onClick={() => setDraft(taskToDraft(t, kids, kind === 'ARCHIVE'))}
                      sx={{ ...card, border: 0, boxShadow: `0 1px 0 ${tokens.line}, 0 0 0 1px ${tokens.line}`, p: 1.75, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.25, textAlign: 'left', opacity: kind === 'ARCHIVE' ? 0.7 : 1, '&:hover': { boxShadow: `0 4px 14px rgba(21,24,39,.08), 0 0 0 1px ${tokens.lineStrong}` } }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                        <Box component="span" sx={{ flex: '0 0 44px', height: 44, borderRadius: '14px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{t.icon || '•'}</Box>
                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography sx={{ fontSize: 15, fontWeight: 700, lineHeight: 1.3 }}>{t.title}</Typography>
                          <Typography sx={{ fontSize: 12, color: tokens.text3 }}>
                            {scheduleLabel(t)}{t.time ? ` · ${t.time}` : t.timeOfDay === 'DAY' && t.frequency === 'CUSTOM' ? ' · после школы' : ''}{t.requiresProof ? ' · с фото' : ''}
                          </Typography>
                        </Box>
                        <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, fontSize: 16, color: tokens.starInk }}>{t.points}<StarIcon size={16} /></Box>
                      </Box>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ display: 'flex', pl: '6px' }}>
                          {assignees(t).map((k) => <Box key={k.userId} sx={{ ml: '-6px', border: '2px solid #FFF', borderRadius: '50%', display: 'flex' }}><KidDot name={k.name} index={k.index} pet={k.pet} size={28} /></Box>)}
                        </Box>
                        <Box sx={{ flex: 1 }} />
                        {rate !== null && (
                          <Typography sx={{ fontSize: 12, fontWeight: 600, color: rate >= 70 ? tokens.done : rate >= 45 ? '#9A5B00' : tokens.danger }}>{rate} % за месяц</Typography>
                        )}
                      </Box>
                    </ButtonBase>
                  )
                })}
                {kind !== 'ARCHIVE' && (
                  <ButtonBase onClick={() => setDraft(emptyTaskDraft({ timeOfDay: s.id, kids: kidFilter === 'all' ? [] : [kidFilter] }))}
                    sx={{ minHeight: 52, borderRadius: '16px', border: `2px dashed ${tokens.lineStrong}`, color: tokens.text3, fontSize: 14, fontWeight: 600, gap: 1, '&:hover': { borderColor: tokens.primary, color: tokens.primaryInk } }}>
                    <Icon name="plus" size={18} />{look.add}
                  </ButtonBase>
                )}
                {kind === 'ARCHIVE' && items.length === 0 && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Пусто</Typography>}
              </Box>
            )
          })}
        </Box>
      )}
    </Layout>
  )
}
