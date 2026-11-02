import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQueries } from '@tanstack/react-query'
import { Box, Button, CircularProgress, Dialog, DialogContent, IconButton, InputAdornment, MenuItem, Switch, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, Chip2, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { CATEGORY_STYLE, Icon, StarAmount, categoryKey, categoryStyle } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useArchiveTask, useCreateTask, useDeleteTask, useTasks, useUnarchiveTask, useUpdateTask } from '../../hooks/useTasks'
import { TASK_TEMPLATES, type TaskTemplate } from './task-templates'
import { completionRate, scheduleLabel, type Freq } from './task-model'

const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL: Record<number, string> = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' }
const STAR_PRESETS = [5, 10, 15, 20, 30]
const ICONS = ['🪥', '🛏️', '📚', '📖', '✏️', '🧹', '🍽️', '🗑️', '🧺', '🐾', '🏊', '⚽', '🚴', '🎹', '🎨', '🌱', '🧘', '😴']

type Tab = 'DAILY' | 'DAYS' | 'ONCE' | 'ARCHIVE'

interface Draft {
  id?: string
  title: string
  description: string
  icon: string
  category: string
  points: number
  frequency: Freq
  daysOfWeek: number[]
  assignedTo: string
  requiresProof: boolean
  autoApprove: boolean
  archived?: boolean
}

const emptyDraft = (): Draft => ({
  title: '', description: '', icon: '', category: 'home', points: 10, frequency: 'DAILY', daysOfWeek: [],
  assignedTo: 'ALL', requiresProof: false, autoApprove: false,
})

const toDraft = (t: any, archived = false): Draft => ({
  id: t.id,
  title: t.title || '',
  description: t.description || '',
  icon: t.icon || '',
  category: categoryKey(t.category),
  points: t.points || 10,
  frequency: t.frequency || 'DAILY',
  daysOfWeek: Array.isArray(t.daysOfWeek) ? t.daysOfWeek : typeof t.daysOfWeek === 'string' ? JSON.parse(t.daysOfWeek || '[]') : [],
  assignedTo: t.assignedTo || 'ALL',
  requiresProof: !!t.requiresProof,
  autoApprove: t.requiresParentApproval === false,
  archived,
})

const whoLabel = (assignedTo: string | undefined, kids: Kid[]) =>
  !assignedTo || assignedTo === 'ALL' ? (kids.length === 2 ? 'оба' : 'все') : kids.find((k) => k.userId === assignedTo || k.profileId === assignedTo)?.name || '—'

/** Задания (PW_Tasks): таблица с вкладками по расписанию и редактор сбоку. */
export default function ParentTasks() {
  const location = useLocation()
  const { kids } = useKids()
  const { data: active = [], isLoading } = useTasks('ACTIVE')
  const { data: archived = [] } = useTasks('ARCHIVED')
  const [tab, setTab] = useState<Tab>('DAILY')
  const [query, setQuery] = useState('')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [templatesOpen, setTemplatesOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  // Выполнения всех детей за 4 недели — для колонки «За 4 недели».
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
    if ((location.state as any)?.create) setDraft(emptyDraft())
  }, [location.state])

  // ⌘K / Ctrl+K — к поиску.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const list = (active as any[])
  const counts = {
    DAILY: list.filter((t) => t.frequency === 'DAILY').length,
    DAYS: list.filter((t) => t.frequency === 'CUSTOM' || t.frequency === 'WEEKLY').length,
    ONCE: list.filter((t) => t.frequency === 'ONCE').length,
    ARCHIVE: (archived as any[]).length,
  }
  const rows = (tab === 'ARCHIVE' ? (archived as any[]) : list.filter((t) =>
    tab === 'DAILY' ? t.frequency === 'DAILY' : tab === 'DAYS' ? t.frequency === 'CUSTOM' || t.frequency === 'WEEKLY' : t.frequency === 'ONCE',
  )).filter((t) => !query.trim() || t.title.toLowerCase().includes(query.trim().toLowerCase()))

  const pickTemplate = (tpl: TaskTemplate) => {
    setTemplatesOpen(false)
    setDraft({ ...emptyDraft(), ...tpl })
  }

  return (
    <Layout>
      <PageHeader kicker={`${list.length} активных · ⌘K — быстрый поиск`} title="Задания">
        <Button variant="outlined" onClick={() => setTemplatesOpen(true)}>Из шаблонов</Button>
        <Button variant="contained" onClick={() => setDraft(emptyDraft())}>+ Новое задание</Button>
      </PageHeader>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: draft ? 'minmax(0, 1fr) 360px' : '1fr' }, gap: 2.5, alignItems: 'start' }}>
        <Card sx={{ overflow: 'hidden' }}>
          <Box sx={{ display: 'flex', gap: 1, p: 1.75, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip2 on={tab === 'DAILY'} onClick={() => setTab('DAILY')}>Ежедневные · {counts.DAILY}</Chip2>
            <Chip2 on={tab === 'DAYS'} onClick={() => setTab('DAYS')}>По дням · {counts.DAYS}</Chip2>
            <Chip2 on={tab === 'ONCE'} onClick={() => setTab('ONCE')}>Разовые{counts.ONCE ? ` · ${counts.ONCE}` : ''}</Chip2>
            <Chip2 on={tab === 'ARCHIVE'} onClick={() => setTab('ARCHIVE')}>Архив{counts.ARCHIVE ? ` · ${counts.ARCHIVE}` : ''}</Chip2>
            <TextField
              inputRef={searchRef}
              size="small"
              placeholder="Найти задание"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              sx={{ ml: { sm: 'auto' }, width: { xs: '100%', sm: 220 } }}
              InputProps={{ startAdornment: <InputAdornment position="start"><Icon name="search" size={18} /></InputAdornment> }}
            />
          </Box>
          {isLoading ? <CircularProgress sx={{ m: 4 }} /> : (
            <Box sx={{ overflowX: 'auto' }}>
              <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr>
                    {['Задание', 'Кто', 'Когда', 'Звёзды', 'За 4 недели'].map((h) => (
                      <Box component="th" key={h} sx={{ ...labelCaps, textAlign: 'left', p: '10px 12px', borderBottom: `1px solid ${tokens.line}` }}>{h}</Box>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><Box component="td" colSpan={5} sx={{ p: 3, color: tokens.text3, fontSize: 14 }}>{tab === 'ARCHIVE' ? 'Архив пуст.' : 'Здесь пока нет заданий.'}</Box></tr>
                  )}
                  {rows.map((t) => {
                    const cat = categoryStyle(t.category)
                    const rate = completionRate(t, allCompletions, kids)
                    const on = draft?.id === t.id
                    return (
                      <Box
                        component="tr"
                        key={t.id}
                        onClick={() => setDraft(toDraft(t, tab === 'ARCHIVE'))}
                        sx={{ cursor: 'pointer', bgcolor: on ? '#F0F4FF' : 'transparent', '&:hover': { bgcolor: on ? '#F0F4FF' : '#F8F9FC' }, '& td': { p: '12px', borderBottom: `1px solid ${tokens.chip}`, fontSize: 14, verticalAlign: 'middle' } }}
                      >
                        <td>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                            <Box sx={{ flex: '0 0 32px', height: 32, borderRadius: '9px', bgcolor: cat.bg, color: cat.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>{t.icon || '•'}</Box>
                            <b style={{ fontWeight: 600 }}>{t.title}</b>
                            {t.requiresProof && <Box component="span" title="Нужно фото" sx={{ color: tokens.text3, display: 'flex' }}><Icon name="camera" size={16} /></Box>}
                          </Box>
                        </td>
                        <td>{whoLabel(t.assignedTo, kids)}</td>
                        <td>{scheduleLabel(t)}</td>
                        <td><StarAmount value={t.points} size={14} weight={700} /></td>
                        <td>
                          {rate === null ? <Box component="span" sx={{ color: tokens.text3 }}>—</Box> : (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <Box sx={{ width: 64, height: 6, borderRadius: 3, bgcolor: tokens.chip, overflow: 'hidden' }}>
                                <Box sx={{ width: `${rate}%`, height: '100%', bgcolor: rate >= 70 ? tokens.done : rate >= 45 ? tokens.star : tokens.danger }} />
                              </Box>
                              {rate} %
                            </Box>
                          )}
                        </td>
                      </Box>
                    )
                  })}
                </tbody>
              </Box>
            </Box>
          )}
        </Card>

        {draft && <TaskEditor key={draft.id || 'new'} draft={draft} kids={kids} onClose={() => setDraft(null)} />}
      </Box>

      <Dialog open={templatesOpen} onClose={() => setTemplatesOpen(false)} fullWidth maxWidth="sm">
        <DialogContent sx={{ p: 3 }}>
          <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700, mb: 0.5 }}>Шаблоны заданий</Typography>
          <Typography sx={{ fontSize: 14, color: tokens.text3, mb: 2 }}>Выберите — и поправьте под свою семью перед сохранением.</Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
            {TASK_TEMPLATES.map((tpl) => {
              const cat = categoryStyle(tpl.category)
              return (
                <Box key={tpl.title} component="button" type="button" onClick={() => pickTemplate(tpl)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: 1.25, borderRadius: '12px', border: `1px solid ${tokens.line}`, bgcolor: tokens.paper, font: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 56, '&:hover': { borderColor: tokens.primary } }}>
                  <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '10px', bgcolor: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>{tpl.icon}</Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{tpl.title}</Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{scheduleLabel(tpl)} · {tpl.points} звёзд</Typography>
                  </Box>
                </Box>
              )
            })}
          </Box>
        </DialogContent>
      </Dialog>
    </Layout>
  )
}

function TaskEditor({ draft: initial, kids, onClose }: { draft: Draft; kids: Kid[]; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial)
  const [error, setError] = useState('')
  const create = useCreateTask()
  const update = useUpdateTask()
  const archive = useArchiveTask()
  const unarchive = useUnarchiveTask()
  const remove = useDeleteTask()
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const busy = create.isPending || update.isPending || archive.isPending || unarchive.isPending || remove.isPending

  const toggleDay = (day: number) => {
    const days = d.daysOfWeek.includes(day) ? d.daysOfWeek.filter((x) => x !== day) : [...d.daysOfWeek, day]
    set({ daysOfWeek: days })
  }

  const save = () => {
    if (!d.title.trim()) return setError('Назовите задание')
    if (d.frequency === 'CUSTOM' && d.daysOfWeek.length === 0) return setError('Выберите хотя бы один день')
    if (!(d.points > 0)) return setError('Звёзд должно быть больше нуля')
    setError('')
    const payload = {
      title: d.title.trim(),
      description: d.description.trim() || undefined,
      icon: d.icon || undefined,
      category: d.category,
      points: Math.round(d.points),
      frequency: d.frequency,
      daysOfWeek: d.frequency === 'CUSTOM' ? [...d.daysOfWeek].sort() : [],
      assignedTo: d.assignedTo,
      requiresProof: d.requiresProof,
      requiresParentApproval: !d.autoApprove,
    }
    const done = { onSuccess: onClose, onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось сохранить') }
    if (d.id) update.mutate({ id: d.id, data: payload as any }, done)
    else create.mutate(payload as any, done)
  }

  // На узком экране редактор оказывается под таблицей — прокручиваем к нему.
  const anchor = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (window.innerWidth < 1200) anchor.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const fld = { display: 'flex', flexDirection: 'column', gap: 0.75 } as const
  const fldLabel = { fontSize: 13, fontWeight: 600, color: tokens.text2 } as const

  return (
    <Card sx={{ p: 2.5, display: 'flex', flexDirection: 'column', gap: 2, position: { lg: 'sticky' }, top: { lg: 28 } }}>
      <Box ref={anchor} sx={{ display: 'flex', alignItems: 'center', gap: 1, scrollMarginTop: 72 }}>
        <Typography component="h2" sx={{ flex: 1, fontSize: 18, fontWeight: 700 }}>{d.id ? d.title || 'Задание' : 'Новое задание'}</Typography>
        <IconButton aria-label="Закрыть" onClick={onClose}><Icon name="x" size={20} /></IconButton>
      </Box>

      <TextField label="Название" value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus={!d.id} inputProps={{ maxLength: 80 }} />

      <Box sx={fld}>
        <Typography sx={fldLabel}>Картинка</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {ICONS.map((i) => (
            <Box key={i} component="button" type="button" aria-pressed={d.icon === i} onClick={() => set({ icon: d.icon === i ? '' : i })}
              sx={{ width: 40, height: 40, borderRadius: '10px', fontSize: 20, border: `2px solid ${d.icon === i ? tokens.primary : 'transparent'}`, bgcolor: d.icon === i ? tokens.primarySoft : tokens.bg, cursor: 'pointer' }}>
              {i}
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
        <TextField select label="Кто" value={d.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })}>
          <MenuItem value="ALL">Все дети</MenuItem>
          {kids.map((k) => <MenuItem key={k.userId} value={k.userId}>{k.name}</MenuItem>)}
        </TextField>
        <TextField select label="Категория" value={d.category} onChange={(e) => set({ category: e.target.value })}>
          {Object.entries(CATEGORY_STYLE).filter(([k]) => k !== 'chores').map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
        </TextField>
      </Box>

      <TextField select label="Когда" value={d.frequency} onChange={(e) => set({ frequency: e.target.value as Freq })}>
        <MenuItem value="DAILY">Каждый день</MenuItem>
        <MenuItem value="CUSTOM">По дням недели</MenuItem>
        <MenuItem value="WEEKLY">Раз в неделю, в любой день</MenuItem>
        <MenuItem value="ONCE">Один раз</MenuItem>
      </TextField>

      {d.frequency === 'CUSTOM' && (
        <Box sx={fld}>
          <Typography sx={fldLabel}>Дни</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {DAYS.map((day) => <Chip2 key={day} on={d.daysOfWeek.includes(day)} onClick={() => toggleDay(day)} sx={{ px: 1.5 }}>{DAY_LABEL[day]}</Chip2>)}
          </Box>
        </Box>
      )}

      <Box sx={fld}>
        <Typography sx={fldLabel}>Звёзды</Typography>
        <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', alignItems: 'center' }}>
          {STAR_PRESETS.map((n) => <Chip2 key={n} on={d.points === n} onClick={() => set({ points: n })}>{n}</Chip2>)}
          <TextField size="small" type="number" value={STAR_PRESETS.includes(d.points) ? '' : d.points || ''} placeholder="своё" onChange={(e) => set({ points: Number(e.target.value) })} sx={{ width: 88 }} inputProps={{ min: 1, 'aria-label': 'Своё число звёзд' }} />
        </Box>
      </Box>

      <TextField label="Пояснение для ребёнка" value={d.description} onChange={(e) => set({ description: e.target.value })} multiline minRows={2} placeholder="Прочитается вслух, если нажать на задание" />

      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Typography sx={{ flex: 1, fontSize: 14 }}>Нужно фото</Typography>
        <Switch checked={d.requiresProof} onChange={(e) => set({ requiresProof: e.target.checked })} inputProps={{ 'aria-label': 'Нужно фото' }} />
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 14 }}>Одобрять сразу</Typography>
          <Typography sx={{ fontSize: 12, color: tokens.text3 }}>Звёзды засчитываются без проверки</Typography>
        </Box>
        <Switch checked={d.autoApprove} onChange={(e) => set({ autoApprove: e.target.checked })} inputProps={{ 'aria-label': 'Одобрять сразу' }} />
      </Box>

      {error && <Typography sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}

      <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
        {d.id && !d.archived && <Button variant="outlined" disabled={busy} onClick={() => archive.mutate(d.id!, { onSuccess: onClose })}>В архив</Button>}
        {d.id && d.archived && (
          <>
            <Button variant="outlined" disabled={busy} onClick={() => unarchive.mutate(d.id!, { onSuccess: onClose })}>Вернуть</Button>
            <Button color="error" disabled={busy} onClick={() => window.confirm(`Удалить «${d.title}» насовсем? История выполнений останется.`) && remove.mutate(d.id!, { onSuccess: onClose })}>Удалить</Button>
          </>
        )}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" disabled={busy} onClick={save}>Сохранить</Button>
      </Box>
    </Card>
  )
}
