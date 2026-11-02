import { useState, type ReactNode } from 'react'
import { Box, Button, Checkbox, FormControlLabel, MenuItem, Switch, TextField, Typography } from '@mui/material'
import { Card, Chip2, KidDot, kidColor, labelCaps, type Kid } from './kit'
import { CATEGORY_STYLE, Icon, StarIcon, categoryKey, categoryStyle, type IconName } from '../ui'
import { tokens, fonts } from '../../theme'
import { PetArt } from '../../lib/pets'
import { useArchiveTask, useCreateTask, useDeleteTask, useUnarchiveTask, useUpdateTask } from '../../hooks/useTasks'
import { TASK_TEMPLATES } from '../../pages/parent/task-templates'
import { parseDays, scheduleLabel, type Freq, type Slot } from '../../pages/parent/task-model'

const DAYS = [1, 2, 3, 4, 5, 6, 0]
const DAY_LABEL: Record<number, string> = { 0: 'Вс', 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб' }
const STAR_PRESETS = [5, 10, 15, 20, 30, 50]
const ICONS = ['🪥', '🛏️', '📚', '📖', '✏️', '🧹', '🍽️', '🗑️', '🧺', '🐾', '🐕', '🏊', '⚽', '🚴', '🎹', '🎨', '🌱', '🧘', '🧸', '😴']
const STEPS = ['Что', 'Кому', 'Когда', 'Награда'] as const

export interface TaskDraft {
  id?: string
  title: string
  description: string
  icon: string
  category: string
  points: number
  frequency: Freq
  daysOfWeek: number[]
  /** userId детей; пусто или все — «ALL». */
  kids: string[]
  timeOfDay: Slot | null
  time: string
  remind: boolean
  requiresProof: boolean
  autoApprove: boolean
  archived?: boolean
}

export const emptyTaskDraft = (patch: Partial<TaskDraft> = {}): TaskDraft => ({
  title: '', description: '', icon: '', category: 'home', points: 10, frequency: 'DAILY', daysOfWeek: [], kids: [],
  timeOfDay: null, time: '', remind: false, requiresProof: false, autoApprove: false, ...patch,
})

export const taskToDraft = (t: any, kids: Kid[], archived = false): TaskDraft => {
  const kid = kids.find((k) => k.userId === t.assignedTo || k.profileId === t.assignedTo)
  return {
    id: t.id,
    title: t.title || '',
    description: t.description || '',
    icon: t.icon || '',
    category: categoryKey(t.category),
    points: t.points || 10,
    frequency: t.frequency || 'DAILY',
    daysOfWeek: parseDays(t.daysOfWeek),
    kids: kid ? [kid.userId] : [],
    timeOfDay: t.timeOfDay || null,
    time: t.time || '',
    remind: !!t.remind,
    requiresProof: !!t.requiresProof,
    autoApprove: t.requiresParentApproval === false,
    archived,
  }
}

const SLOT_OPTIONS: { id: Slot | 'EXACT'; label: string; hint: string; icon: IconName; color: string }[] = [
  { id: 'MORNING', label: 'Утро', hint: 'до 12:00', icon: 'sun', color: tokens.star },
  { id: 'DAY', label: 'После школы', hint: '14–18', icon: 'cloud', color: tokens.primary },
  { id: 'EVENING', label: 'Вечер', hint: 'после 18', icon: 'moon', color: tokens.review },
  { id: 'EXACT', label: 'Точное время', hint: 'к часу', icon: 'clock', color: tokens.text2 },
]

const whenText = (d: TaskDraft) => {
  const days = d.frequency === 'CUSTOM' ? scheduleLabel({ frequency: 'CUSTOM', daysOfWeek: d.daysOfWeek }) : scheduleLabel(d)
  const slot = d.time ? d.time : SLOT_OPTIONS.find((s) => s.id === d.timeOfDay)?.label.toLowerCase()
  return slot ? `${days}, ${slot}` : days
}

/** Новое задание по шагам «Что → Кому → Когда → Награда» с превью для ребёнка (V_Tasks_B). */
export default function TaskWizard({ initial, kids, onClose }: { initial: TaskDraft; kids: Kid[]; onClose: () => void }) {
  const [d, setD] = useState<TaskDraft>(initial)
  const [step, setStep] = useState(0)
  const [error, setError] = useState('')
  const create = useCreateTask()
  const update = useUpdateTask()
  const archive = useArchiveTask()
  const unarchive = useUnarchiveTask()
  const remove = useDeleteTask()
  const busy = create.isPending || update.isPending || archive.isPending || unarchive.isPending || remove.isPending
  const set = (patch: Partial<TaskDraft>) => setD((x) => ({ ...x, ...patch }))
  const editing = !!d.id

  const chosen = d.kids.length ? kids.filter((k) => d.kids.includes(k.userId)) : kids
  const previewKid = chosen[0]

  const check = (s: number): string => {
    if (s >= 0 && !d.title.trim()) return 'Назовите задание'
    if (s >= 2 && d.frequency === 'CUSTOM' && d.daysOfWeek.length === 0) return 'Выберите хотя бы один день'
    if (s >= 3 && !(d.points > 0)) return 'Звёзд должно быть больше нуля'
    return ''
  }
  const go = (s: number) => {
    const e = s > step ? check(step) : ''
    setError(e)
    if (!e) setStep(s)
  }

  const save = async () => {
    const e = check(3)
    if (e) return setError(e)
    setError('')
    const payload = {
      title: d.title.trim(),
      description: d.description.trim() || undefined,
      icon: d.icon || undefined,
      category: d.category,
      points: Math.round(d.points),
      frequency: d.frequency,
      daysOfWeek: d.frequency === 'CUSTOM' ? [...d.daysOfWeek].sort() : [],
      requiresProof: d.requiresProof,
      requiresParentApproval: !d.autoApprove,
      timeOfDay: d.time ? null : d.timeOfDay,
      time: d.time || null,
      remind: d.remind,
    }
    // Все дети — одно общее задание; несколько из нескольких — по копии на каждого.
    const targets = d.kids.length === 0 || d.kids.length === kids.length ? ['ALL'] : d.kids
    try {
      const [first, ...rest] = targets
      if (d.id) await update.mutateAsync({ id: d.id, data: { ...payload, assignedTo: first } as any })
      else await create.mutateAsync({ ...payload, assignedTo: first } as any)
      for (const t of rest) await create.mutateAsync({ ...payload, assignedTo: t } as any)
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Не получилось сохранить')
    }
  }

  // Пустой список значит «все»: клик по ребёнку снимает именно его.
  const toggleKid = (id: string) => {
    const cur = d.kids.length ? d.kids : kids.map((k) => k.userId)
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]
    set({ kids: next.length === kids.length ? [] : next })
  }
  const toggleDay = (day: number) => {
    const days = d.frequency === 'CUSTOM' ? d.daysOfWeek : d.frequency === 'DAILY' ? DAYS : []
    const next = days.includes(day) ? days.filter((x) => x !== day) : [...days, day]
    set(next.length === 7 ? { frequency: 'DAILY', daysOfWeek: [] } : { frequency: 'CUSTOM', daysOfWeek: next })
  }
  const dayOn = (day: number) => d.frequency === 'DAILY' || (d.frequency === 'CUSTOM' && d.daysOfWeek.includes(day))

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.25 }}>
      <Card sx={{ p: '14px 20px', display: 'flex', alignItems: 'center', gap: 1, overflowX: 'auto' }}>
        {STEPS.map((label, i) => {
          const done = i < step
          const on = i === step
          return (
            <Box key={label} component="button" type="button" onClick={() => go(i)} aria-current={on ? 'step' : undefined}
              sx={{ flex: 1, minWidth: 120, display: 'flex', alignItems: 'center', gap: 1.25, border: 0, bgcolor: 'transparent', font: 'inherit', cursor: 'pointer', p: 0 }}>
              <Box component="span" sx={{ flex: '0 0 32px', height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, bgcolor: done ? tokens.done : on ? tokens.primary : tokens.chip, color: done || on ? '#FFF' : tokens.text3 }}>
                {done ? <Icon name="check" size={16} stroke={3} /> : i + 1}
              </Box>
              <Box component="span" sx={{ fontSize: 14, fontWeight: on ? 700 : 500, color: done || on ? tokens.text : tokens.text3, whiteSpace: 'nowrap' }}>{label}</Box>
              {i < STEPS.length - 1 && <Box component="i" sx={{ flex: 1, height: 2, bgcolor: tokens.line, mx: 1 }} />}
            </Box>
          )
        })}
      </Card>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1.5fr 1fr' }, gap: 2.25, alignItems: 'start' }}>
        <Card sx={{ p: '22px 24px', display: 'flex', flexDirection: 'column', gap: 2, minHeight: 420 }}>
          {step === 0 && (
            <>
              <Head title="Что нужно сделать?" sub="Коротко и понятно ребёнку. Можно начать с шаблона." />
              <TextField label="Название" value={d.title} onChange={(e) => set({ title: e.target.value })} autoFocus inputProps={{ maxLength: 80 }} />
              <Box>
                <Typography sx={{ ...labelCaps, mb: 1 }}>Картинка</Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {ICONS.map((i) => (
                    <Box key={i} component="button" type="button" aria-pressed={d.icon === i} aria-label={`Картинка ${i}`} onClick={() => set({ icon: d.icon === i ? '' : i })}
                      sx={{ width: 44, height: 44, borderRadius: '12px', fontSize: 22, border: `2px solid ${d.icon === i ? tokens.primary : 'transparent'}`, bgcolor: d.icon === i ? tokens.primarySoft : tokens.bg, cursor: 'pointer' }}>
                      {i}
                    </Box>
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1.4fr' }, gap: 1.5 }}>
                <TextField select label="Категория" value={d.category} onChange={(e) => set({ category: e.target.value })}>
                  {Object.entries(CATEGORY_STYLE).filter(([k]) => k !== 'chores').map(([k, v]) => <MenuItem key={k} value={k}>{v.label}</MenuItem>)}
                </TextField>
                <TextField label="Пояснение для ребёнка" value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="Прочитается вслух" />
              </Box>
              {!editing && (
                <Box>
                  <Typography sx={{ ...labelCaps, mb: 1 }}>Шаблоны</Typography>
                  <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', xl: '1fr 1fr 1fr' }, gap: 1 }}>
                    {TASK_TEMPLATES.map((tpl) => {
                      const cat = categoryStyle(tpl.category)
                      const on = d.title === tpl.title
                      return (
                        <Box key={tpl.title} component="button" type="button" aria-pressed={on}
                          onClick={() => set({ title: tpl.title, icon: tpl.icon, category: tpl.category, points: tpl.points, frequency: tpl.frequency, daysOfWeek: tpl.daysOfWeek, requiresProof: tpl.requiresProof, timeOfDay: tpl.timeOfDay ?? d.timeOfDay })}
                          sx={{ display: 'flex', alignItems: 'center', gap: 1, p: 1, borderRadius: '12px', border: `${on ? 2 : 1}px solid ${on ? tokens.primary : tokens.line}`, bgcolor: on ? '#F0F4FF' : tokens.paper, font: 'inherit', textAlign: 'left', cursor: 'pointer', minHeight: 52 }}>
                          <Box component="span" sx={{ flex: '0 0 34px', height: 34, borderRadius: '10px', bgcolor: cat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17 }}>{tpl.icon}</Box>
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 600, lineHeight: 1.25 }}>{tpl.title}</Typography>
                            <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{tpl.points} звёзд</Typography>
                          </Box>
                        </Box>
                      )
                    })}
                  </Box>
                </Box>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Head title={`Кому «${d.title}»?`} sub="Можно выбрать нескольких. Ничего не выбрано — всем детям." />
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 1.5 }}>
                {kids.map((k) => {
                  const on = d.kids.includes(k.userId) || d.kids.length === 0
                  const c = kidColor(k.index)
                  return (
                    <Box key={k.userId} component="button" type="button" aria-pressed={on} onClick={() => toggleKid(k.userId)}
                      sx={{ position: 'relative', borderRadius: '20px', p: 2, border: `2px solid ${on ? c.strong : tokens.line}`, bgcolor: on ? c.bg : tokens.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, font: 'inherit', cursor: 'pointer' }}>
                      {on && <Box component="span" sx={{ position: 'absolute', top: 10, right: 10, width: 24, height: 24, borderRadius: '50%', bgcolor: c.strong, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={14} stroke={3} /></Box>}
                      <KidDot name={k.name} index={k.index} pet={k.pet} size={64} />
                      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{k.name}</Typography>
                      {k.age && <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{k.age} лет</Typography>}
                    </Box>
                  )
                })}
              </Box>
              {d.kids.length > 0 && d.kids.length < kids.length && d.kids.length > 1 && (
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Сохраним по отдельному заданию каждому — так у каждого будет своя отметка.</Typography>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Head title={`Когда делать «${d.title}»?`} sub="Выберите дни и время — ребёнок увидит задание именно тогда." />
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {DAYS.map((day) => {
                  const on = (d.frequency === 'DAILY' || d.frequency === 'CUSTOM') && dayOn(day)
                  return (
                    <Box key={day} component="button" type="button" aria-pressed={on} onClick={() => toggleDay(day)}
                      sx={{ width: 52, height: 52, borderRadius: '16px', border: on ? 0 : `1px solid ${tokens.lineStrong}`, bgcolor: on ? tokens.primary : tokens.paper, color: on ? '#FFF' : tokens.text, font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                      {DAY_LABEL[day]}
                    </Box>
                  )
                })}
                <Box sx={{ flex: 1 }} />
                <Chip2 on={d.frequency === 'CUSTOM' && d.daysOfWeek.length === 5 && [1, 2, 3, 4, 5].every((x) => d.daysOfWeek.includes(x))} onClick={() => set({ frequency: 'CUSTOM', daysOfWeek: [1, 2, 3, 4, 5] })}>Будни</Chip2>
                <Chip2 on={d.frequency === 'DAILY'} onClick={() => set({ frequency: 'DAILY', daysOfWeek: [] })}>Каждый день</Chip2>
                <Chip2 on={d.frequency === 'WEEKLY'} onClick={() => set({ frequency: 'WEEKLY', daysOfWeek: [] })}>Раз в неделю</Chip2>
                <Chip2 on={d.frequency === 'ONCE'} onClick={() => set({ frequency: 'ONCE', daysOfWeek: [] })}>Один раз</Chip2>
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(4, 1fr)' }, gap: 1.25 }}>
                {SLOT_OPTIONS.map((s) => {
                  const on = s.id === 'EXACT' ? !!d.time : !d.time && d.timeOfDay === s.id
                  return (
                    <Box key={s.id} component="button" type="button" aria-pressed={on}
                      onClick={() => (s.id === 'EXACT' ? set({ time: d.time || '15:30', timeOfDay: null }) : set({ timeOfDay: on ? null : s.id, time: '' }))}
                      sx={{ minHeight: 84, borderRadius: '18px', border: on ? `2px solid ${tokens.primary}` : `1px solid ${tokens.lineStrong}`, bgcolor: on ? '#F0F4FF' : tokens.paper, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 0.75, font: 'inherit', fontSize: 14, fontWeight: 600, color: tokens.text, cursor: 'pointer' }}>
                      <Box component="span" sx={{ color: s.color, display: 'flex' }}><Icon name={s.icon} size={18} /></Box>
                      {s.label}
                      <Box component="span" sx={{ fontSize: 12, fontWeight: 500, color: tokens.text3 }}>{s.id === 'EXACT' && d.time ? d.time : s.hint}</Box>
                    </Box>
                  )
                })}
              </Box>
              {!!d.time && (
                <TextField type="time" label="Время" value={d.time} onChange={(e) => set({ time: e.target.value })} sx={{ width: 160 }} inputProps={{ step: 300 }} />
              )}
              <FormControlLabel control={<Checkbox checked={d.remind} onChange={(e) => set({ remind: e.target.checked })} />} label="Напомнить ребёнку за 15 минут" sx={{ minHeight: 44 }} />
            </>
          )}

          {step === 3 && (
            <>
              <Head title="Сколько звёзд?" sub="Ориентир: 5 — мелочь на минуту, 20 — серьёзное дело, 50 — большое достижение." />
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                {STAR_PRESETS.map((n) => (
                  <Box key={n} component="button" type="button" aria-pressed={d.points === n} onClick={() => set({ points: n })}
                    sx={{ minWidth: 72, height: 64, borderRadius: '18px', border: d.points === n ? `2px solid ${tokens.star}` : `1px solid ${tokens.lineStrong}`, bgcolor: d.points === n ? tokens.starSoft : tokens.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.5, font: 'inherit', fontSize: 20, fontWeight: 800, color: tokens.starInk, cursor: 'pointer' }}>
                    {n}<StarIcon size={18} />
                  </Box>
                ))}
                <TextField size="small" type="number" value={STAR_PRESETS.includes(d.points) ? '' : d.points || ''} placeholder="своё" onChange={(e) => set({ points: Number(e.target.value) })} sx={{ width: 96 }} inputProps={{ min: 1, 'aria-label': 'Своё число звёзд' }} />
              </Box>
              <Row title="Нужно фото" sub="Ребёнок прикрепит фото, вы увидите его при проверке">
                <Switch checked={d.requiresProof} onChange={(e) => set({ requiresProof: e.target.checked })} inputProps={{ 'aria-label': 'Нужно фото' }} />
              </Row>
              <Row title="Одобрять сразу" sub="Звёзды засчитываются без проверки">
                <Switch checked={d.autoApprove} onChange={(e) => set({ autoApprove: e.target.checked })} inputProps={{ 'aria-label': 'Одобрять сразу' }} />
              </Row>
            </>
          )}

          {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}

          <Box sx={{ display: 'flex', gap: 1.25, mt: 'auto', alignItems: 'center', flexWrap: 'wrap' }}>
            {step > 0 ? <Button variant="outlined" onClick={() => go(step - 1)}>Назад</Button> : <Button variant="outlined" onClick={onClose}>Отмена</Button>}
            {editing && !d.archived && <Button color="inherit" disabled={busy} onClick={() => archive.mutate(d.id!, { onSuccess: onClose })}>В архив</Button>}
            {editing && d.archived && (
              <>
                <Button color="inherit" disabled={busy} onClick={() => unarchive.mutate(d.id!, { onSuccess: onClose })}>Вернуть</Button>
                <Button color="error" disabled={busy} onClick={() => window.confirm(`Удалить «${d.title}» насовсем? История выполнений останется.`) && remove.mutate(d.id!, { onSuccess: onClose })}>Удалить</Button>
              </>
            )}
            <Box sx={{ flex: 1 }} />
            {editing && step < 3 && <Button variant="outlined" disabled={busy} onClick={save}>Сохранить</Button>}
            {step < 3 ? (
              <Button variant="contained" onClick={() => go(step + 1)} sx={{ minWidth: 200 }}>Дальше: {STEPS[step + 1].toLowerCase()}</Button>
            ) : (
              <Button variant="contained" disabled={busy} onClick={save} sx={{ minWidth: 200 }}>{editing ? 'Сохранить' : 'Создать задание'}</Button>
            )}
          </Box>
        </Card>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Typography sx={labelCaps}>Так увидит {previewKid?.name || 'ребёнок'}</Typography>
          <Box sx={{ borderRadius: '28px', bgcolor: previewKid ? kidColor(previewKid.index).bg : tokens.starSoft, p: 2.75, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
              <Box component="span" sx={{ width: 44, height: 44, borderRadius: '50%', bgcolor: 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><PetArt pet={previewKid?.pet} size={34} /></Box>
              <Typography sx={{ fontSize: 16, fontWeight: 800, fontFamily: fonts.child }}>Сегодня{d.timeOfDay === 'MORNING' ? ' утром' : d.timeOfDay === 'DAY' ? ' после школы' : d.timeOfDay === 'EVENING' ? ' вечером' : d.time ? ` в ${d.time}` : ''}</Typography>
            </Box>
            <Box sx={{ bgcolor: '#FFF', borderRadius: '20px', p: 1.75, display: 'flex', alignItems: 'center', gap: 1.5, boxShadow: '0 2px 0 rgba(0,0,0,.08)' }}>
              <Box component="span" sx={{ flex: '0 0 44px', height: 44, borderRadius: '14px', border: `3px solid ${tokens.muted}` }} />
              <Box component="span" sx={{ flex: '0 0 44px', height: 44, borderRadius: '14px', bgcolor: categoryStyle(d.category).bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{d.icon || '•'}</Box>
              <Typography sx={{ flex: 1, fontSize: 16, fontWeight: 800, fontFamily: fonts.child, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.title || 'Название задания'}</Typography>
              <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: tokens.starInk }}>+{d.points || 0}<StarIcon size={16} /></Box>
            </Box>
            {d.requiresProof && <Typography sx={{ fontSize: 13, fontWeight: 700, fontFamily: fonts.child, color: tokens.text2, display: 'flex', alignItems: 'center', gap: 0.75 }}><Icon name="camera" size={16} />Нужно будет сфотографировать</Typography>}
          </Box>
          <Card sx={{ p: '16px 18px', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Summary ok={!!d.title.trim()} label={`Что: ${d.title.trim() || '—'}`} />
            <Summary ok={step > 1 || editing} label="Кому:" extra={<Box sx={{ display: 'flex' }}>{chosen.map((k) => <Box key={k.userId} sx={{ ml: '-6px', border: '2px solid #FFF', borderRadius: '50%', display: 'flex' }}><KidDot name={k.name} index={k.index} pet={k.pet} size={28} /></Box>)}</Box>} />
            <Summary ok={step > 2 || editing} label={`Когда: ${whenText(d)}`} icon="clock" />
            <Summary ok={step > 3 || editing} label={`Награда: ${d.points || 0} звёзд`} icon="star" />
          </Card>
        </Box>
      </Box>
    </Box>
  )
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <Box>
      <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{title}</Typography>
      <Typography sx={{ mt: 0.5, fontSize: 14, color: tokens.text3 }}>{sub}</Typography>
    </Box>
  )
}

function Row({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, borderTop: `1px solid ${tokens.chip}`, pt: 1.5 }}>
      <Box sx={{ flex: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{sub}</Typography>
      </Box>
      {children}
    </Box>
  )
}

function Summary({ ok, label, extra, icon }: { ok: boolean; label: string; extra?: ReactNode; icon?: IconName }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
      <Box component="span" sx={{ color: ok ? tokens.done : tokens.primary, display: 'flex' }}><Icon name={ok ? 'check' : icon || 'clock'} size={18} stroke={ok ? 2.6 : 2} /></Box>
      <Typography sx={{ fontSize: 14, flex: extra ? 1 : undefined }}>{label}</Typography>
      {extra}
    </Box>
  )
}
