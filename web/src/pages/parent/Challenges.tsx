import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, ButtonBase, MenuItem, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { Bar, Icon, StarIcon, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { CATALOG, CATEGORIES, KIND_TEXT, fromRule, matchTask, plural, toRule, type CatalogItem, type ChallengeKind } from './challenge-catalog'

type Task = { id: string; title: string; status?: string; assignedTo?: string | null }
type Stat = { childId: string; childProfileId: string; childName: string; progress: { current: number; target: number }; isCompleted: boolean; pointsEarned: number }
type Challenge = { id: string; title: string; description?: string; startDate: string; endDate: string; ruleJson: any; rewardJson: any; participantsJson: any; childrenStats?: Stat[]; createdAt?: string }

const parse = (v: any, d: any) => (typeof v === 'string' ? (() => { try { return JSON.parse(v) } catch { return d } })() : v ?? d)
const DAY = 86_400_000
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const daysLeft = (end: string) => Math.max(0, Math.ceil((startOfDay(new Date(end)).getTime() - startOfDay(new Date()).getTime()) / DAY))
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

export type Draft = {
  title: string
  description: string
  kind: ChallengeKind
  n: number
  days: number
  /** '' — любое дело, 'new' — создать дело newTask, иначе id задания. */
  taskId: string
  newTask: string
  newTaskTime?: 'MORNING' | 'DAY' | 'EVENING'
  newTaskPoints: number
  participants: string[]
  prize: number
  catId?: string
}

const emptyDraft: Draft = { title: '', description: '', kind: 'STREAK', n: 7, days: 7, taskId: '', newTask: '', newTaskPoints: 10, participants: [], prize: 100 }

function draftFromItem(item: CatalogItem, tasks: Task[]): Draft {
  const found = matchTask(tasks, item)
  return {
    title: item.title, description: item.sub, kind: item.kind, n: item.n, days: item.days, prize: item.prize, participants: [], catId: item.cat,
    taskId: found ? found.id : item.task ? 'new' : '', newTask: item.task?.title || '', newTaskTime: item.task?.timeOfDay, newTaskPoints: item.task?.points || 10,
  }
}

function draftFromChallenge(c: Challenge): Draft {
  const { kind, n, taskId } = fromRule(parse(c.ruleJson, {}))
  const days = Math.max(1, Math.round((startOfDay(new Date(c.endDate)).getTime() - startOfDay(new Date(c.startDate)).getTime()) / DAY) + 1)
  return { ...emptyDraft, title: c.title, description: c.description || '', kind, n, days, taskId: taskId || '', participants: parse(c.participantsJson, []), prize: parse(c.rewardJson, {})?.value || 100 }
}

/** Челленджи: коллекция готовых (V_Chal_A), идущие сейчас и конструктор в 3 шага (V_Chal_B). */
export default function ParentChallenges() {
  const qc = useQueryClient()
  const { kids } = useKids()
  const { data: challenges = [] } = useQuery<Challenge[]>({ queryKey: ['challenges'], queryFn: async () => (await api.get('/motivation/challenges')).data || [] })
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ['tasks', 'ACTIVE'], queryFn: async () => (await api.get('/tasks?status=ACTIVE')).data || [] })
  const [tab, setTab] = useState<'catalog' | 'running'>('catalog')
  const [cat, setCat] = useState('all')
  const [draft, setDraft] = useState<Draft | null>(null)

  const now = Date.now()
  const running = challenges.filter((c) => new Date(c.endDate).getTime() + DAY > now && !finishedByAll(c))
  const finished = challenges.filter((c) => !running.includes(c))
  const items = cat === 'all' ? CATALOG : CATALOG.filter((i) => i.cat === cat)
  const stop = useMutation({ mutationFn: (id: string) => api.delete(`/motivation/challenges/${id}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges'] }) })

  if (draft) return <Layout><Builder initial={draft} kids={kids} tasks={tasks} onClose={(launched) => { setDraft(null); if (launched) setTab('running') }} /></Layout>

  const first = running[0]
  return (
    <Layout>
      <PageHeader kicker="Готовые челленджи запускаются в один клик, детали можно поправить" title="Челленджи">
        <Box role="tablist" sx={{ display: 'inline-flex', p: 0.5, borderRadius: '12px', bgcolor: tokens.chip }}>
          {([['catalog', `Коллекция · ${CATALOG.length}`], ['running', `Идут сейчас · ${running.length}`]] as const).map(([id, label]) => (
            <Box key={id} component="button" type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
              sx={{ height: 36, px: 1.5, border: 0, borderRadius: '9px', bgcolor: tab === id ? tokens.paper : 'transparent', boxShadow: tab === id ? '0 1px 2px rgba(0,0,0,.08)' : 'none', font: 'inherit', fontSize: 14, fontWeight: 600, color: tokens.text, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {label}
            </Box>
          ))}
        </Box>
        <Button variant="contained" startIcon={<Icon name="plus" size={18} />} onClick={() => setDraft(emptyDraft)}>Создать свой</Button>
      </PageHeader>

      {tab === 'catalog' ? (
        <>
          {first && (
            <Card sx={{ p: '14px 18px', display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap', background: 'linear-gradient(90deg,#FFF3D6,#FFFFFF)' }}>
              <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: tokens.star, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={24} /></Box>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
                  Идёт: «{first.title}» · {(first.childrenStats || []).map((s) => `${s.childName} ${s.progress.current}/${s.progress.target}`).join(', ')}
                </Typography>
                <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{leftText(first)} · приз +{formatNumber(parse(first.rewardJson, {})?.value || 0)} звёзд</Typography>
              </Box>
              <Button variant="outlined" onClick={() => setTab('running')}>Открыть</Button>
            </Card>
          )}

          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
            <CatChip on={cat === 'all'} onClick={() => setCat('all')}>Все · {CATALOG.length}</CatChip>
            {CATEGORIES.map((c) => <CatChip key={c.id} on={cat === c.id} onClick={() => setCat(c.id)} icon={c.icon}>{c.label}</CatChip>)}
          </Box>

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 1.75 }}>
            {items.map((item) => {
              const c = CATEGORIES.find((x) => x.id === item.cat)!
              return (
                <Card key={item.id} sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
                  <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
                    <Box sx={{ flex: '0 0 52px', height: 52, borderRadius: '16px', bgcolor: c.bg, color: c.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={c.icon} size={28} /></Box>
                    <Box sx={{ minWidth: 0 }}>
                      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{item.title}</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{item.sub}</Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 'auto' }}>
                    <Box component="span" sx={{ fontSize: 13, fontWeight: 600, color: tokens.text2, bgcolor: tokens.chip, px: 1, py: 0.25, borderRadius: '8px' }}>
                      {item.kind === 'STREAK' ? KIND_TEXT.STREAK.unit(item.n) + ' подряд' : item.kind === 'TOTAL' ? `${KIND_TEXT.TOTAL.unit(item.n)} за ${item.days} ${plural(item.days, 'день', 'дня', 'дней')}` : `${item.n} звёзд за неделю`}
                    </Box>
                    <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: tokens.starInk, fontSize: 14 }}>+{item.prize}<StarIcon size={14} /></Box>
                    <Box sx={{ flex: 1 }} />
                    <Button size="small" variant="contained" onClick={() => setDraft(draftFromItem(item, tasks))}>Запустить</Button>
                  </Box>
                </Card>
              )
            })}
          </Box>
        </>
      ) : (
        <>
          {running.length === 0 && (
            <Card sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ width: 56, height: 56, borderRadius: '18px', bgcolor: tokens.starSoft, color: '#C47F0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={30} /></Box>
              <Typography sx={{ flex: 1, minWidth: 220, color: tokens.text2 }}>Сейчас ничего не идёт. Выберите челлендж из коллекции — детям проще, когда есть понятная цель на неделю.</Typography>
              <Button variant="contained" onClick={() => setTab('catalog')}>К коллекции</Button>
            </Card>
          )}
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' }, gap: 1.75 }}>
            {running.map((c) => <RunningCard key={c.id} c={c} kids={kids} onStop={() => window.confirm(`Остановить «${c.title}»? Прогресс пропадёт.`) && stop.mutate(c.id)} />)}
          </Box>
          {finished.length > 0 && (
            <Card sx={{ p: 2.25 }}>
              <Typography component="h2" sx={{ ...labelCaps, mb: 1 }}>Завершённые</Typography>
              {finished.map((c) => {
                const winners = (c.childrenStats || []).filter((s) => s.isCompleted).map((s) => s.childName)
                return (
                  <Box key={c.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 }, flexWrap: 'wrap' }}>
                    <Icon name={winners.length ? 'medal' : 'flag'} size={22} style={{ color: winners.length ? tokens.star : tokens.muted }} />
                    <Box sx={{ flex: 1, minWidth: 200 }}>
                      <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{c.title}</Typography>
                      <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{winners.length ? `${winners.join(' и ')} — ${winners.length > 1 ? 'справились' : 'справился'}` : 'Никто не дошёл до конца'} · {shortDate(c.endDate)}</Typography>
                    </Box>
                    <Button size="small" variant="outlined" onClick={() => setDraft(draftFromChallenge(c))}>Повторить</Button>
                    <Button size="small" color="inherit" onClick={() => stop.mutate(c.id)}>Убрать</Button>
                  </Box>
                )
              })}
            </Card>
          )}
        </>
      )}
    </Layout>
  )
}

const finishedByAll = (c: Challenge) => (c.childrenStats?.length ?? 0) > 0 && c.childrenStats!.every((s) => s.isCompleted) && new Date(c.endDate).getTime() < Date.now()

function leftText(c: Challenge) {
  if (new Date(c.startDate).getTime() > Date.now()) return `Начнётся ${shortDate(c.startDate)}`
  const d = daysLeft(c.endDate)
  return d === 0 ? 'Последний день' : `До конца ${d} ${plural(d, 'день', 'дня', 'дней')}`
}

function CatChip({ on, onClick, icon, children }: { on: boolean; onClick: () => void; icon?: any; children: React.ReactNode }) {
  return (
    <Box component="button" type="button" aria-pressed={on} onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 38, px: 1.75, borderRadius: '19px', border: `1px solid ${on ? tokens.text : tokens.lineStrong}`, bgcolor: on ? tokens.text : tokens.paper, color: on ? '#FFF' : tokens.text, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
      {icon && <Icon name={icon} size={16} />}{children}
    </Box>
  )
}

function RunningCard({ c, kids, onStop }: { c: Challenge; kids: Kid[]; onStop: () => void }) {
  const prize = parse(c.rewardJson, {})?.value || 0
  const { kind, n } = fromRule(parse(c.ruleJson, {}))
  return (
    <Card sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        <Box sx={{ flex: '0 0 48px', height: 48, borderRadius: '15px', bgcolor: tokens.starSoft, color: '#C47F0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={26} /></Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{c.title}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{KIND_TEXT[kind].label} · {KIND_TEXT[kind].unit(n)} · {leftText(c)}</Typography>
        </Box>
        <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.4, color: tokens.starInk }}>+{formatNumber(prize)}<StarIcon size={15} /></Box>
      </Box>
      {(c.childrenStats || []).map((s) => {
        const kid = kids.find((k) => k.userId === s.childId || k.profileId === s.childProfileId)
        const pct = s.progress.target ? Math.min(100, Math.round((s.progress.current / s.progress.target) * 100)) : 0
        return (
          <Box key={s.childId} sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
            <KidDot name={s.childName} index={kid?.index ?? 0} pet={kid?.pet} size={32} />
            <Typography sx={{ width: 76, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.childName}</Typography>
            <Box sx={{ flex: 1 }}><Bar value={pct} color={s.isCompleted ? tokens.done : kidColor(kid?.index ?? 0).strong} height={10} /></Box>
            <Typography sx={{ width: 64, textAlign: 'right', fontSize: 14, fontWeight: 700 }}>{s.isCompleted ? 'готово' : `${s.progress.current}/${s.progress.target}`}</Typography>
          </Box>
        )
      })}
      {(c.childrenStats || []).length === 0 && <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Пока никто не участвует</Typography>}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}><Button size="small" color="inherit" onClick={onStop}>Остановить</Button></Box>
    </Card>
  )
}

const STEPS = ['Тип', 'Кто', 'Приз']
const PRIZES = [50, 100, 150, 200, 300]
const SLOT_LABEL = { MORNING: 'утром', DAY: 'днём', EVENING: 'вечером' }

/** Конструктор в 3 шага с превью «Так увидит ребёнок». */
function Builder({ initial, kids, tasks, onClose }: { initial: Draft; kids: Kid[]; tasks: Task[]; onClose: (launched: boolean) => void }) {
  const qc = useQueryClient()
  const [d, setD] = useState<Draft>(initial)
  const [step, setStep] = useState(initial.title ? 2 : 0)
  const [error, setError] = useState('')
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }))
  const chosen = d.participants.length ? kids.filter((k) => d.participants.includes(k.profileId) || d.participants.includes(k.userId)) : kids
  const taskTitle = d.taskId === 'new' ? d.newTask : tasks.find((t) => t.id === d.taskId)?.title
  const autoTitle = d.title || (taskTitle ? `${taskTitle} — ${KIND_TEXT[d.kind].unit(d.n)}` : `${KIND_TEXT[d.kind].label}: ${KIND_TEXT[d.kind].unit(d.n)}`)
  const rule = useMemo(() => {
    const what = taskTitle ? taskTitle.toLowerCase() : 'любые дела'
    if (d.kind === 'STREAK') return `${taskTitle || 'Делать дела'} ${KIND_TEXT.STREAK.unit(d.n)} подряд`
    if (d.kind === 'TOTAL') return `${KIND_TEXT.TOTAL.unit(d.n)}: ${what} за ${d.days} ${plural(d.days, 'день', 'дня', 'дней')}`
    return `Набрать ${d.n} звёзд за ${d.days} ${plural(d.days, 'день', 'дня', 'дней')}`
  }, [d, taskTitle])

  const toggleKid = (k: Kid) => {
    const current = d.participants.length ? d.participants : kids.map((x) => x.profileId)
    const has = current.includes(k.profileId)
    const next = has ? current.filter((id) => id !== k.profileId) : [...current, k.profileId]
    set({ participants: next.length === kids.length ? [] : next })
  }

  const launch = useMutation({
    mutationFn: async () => {
      let taskId = d.taskId
      if (taskId === 'new') {
        const only = chosen.length === 1 ? chosen[0].userId : undefined
        const t = (await api.post('/tasks', { title: d.newTask.trim(), points: d.newTaskPoints, frequency: 'DAILY', ...(d.newTaskTime && { timeOfDay: d.newTaskTime }), ...(only && { assignedTo: only }) })).data
        taskId = t.id
      }
      const start = startOfDay(new Date())
      const end = new Date(start.getTime() + (d.kind === 'STREAK' ? d.n : d.days) * DAY - 1000)
      await api.post('/motivation/challenges', {
        title: autoTitle.trim(), description: d.description || rule, startDate: start.toISOString(), endDate: end.toISOString(),
        rule: toRule(d.kind, d.n, d.kind === 'POINTS' ? undefined : taskId || undefined),
        reward: { type: 'POINTS', value: d.prize },
        participants: d.participants,
      })
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['challenges'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); onClose(true) },
    onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось запустить'),
  })

  const next = () => {
    if (step === 0 && d.taskId === 'new' && !d.newTask.trim()) return setError('Как называется дело?')
    if (step === 1 && chosen.length === 0) return setError('Выберите хотя бы одного ребёнка')
    setError('')
    if (step < 2) setStep(step + 1)
    else launch.mutate()
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
        <Button startIcon={<Icon name="chevronLeft" size={18} />} onClick={() => onClose(false)} color="inherit">Челленджи</Button>
        <Typography component="h1" sx={{ flex: 1, fontSize: 26, fontWeight: 700 }}>Новый челлендж</Typography>
        <Box component="ol" sx={{ display: 'flex', gap: 1, m: 0, p: 0, listStyle: 'none' }}>
          {STEPS.map((s, i) => (
            <Box component="li" key={s}>
              <Box component="button" type="button" onClick={() => i < step && setStep(i)} aria-current={i === step ? 'step' : undefined}
                sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 34, px: 1.25, borderRadius: '17px', border: 0, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: i < step ? 'pointer' : 'default', bgcolor: i === step ? tokens.primary : i < step ? tokens.primarySoft : tokens.chip, color: i === step ? '#FFF' : i < step ? tokens.primaryInk : tokens.text3 }}>
                <Box component="span" sx={{ fontWeight: 800 }}>{i + 1}</Box>{s}
              </Box>
            </Box>
          ))}
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 1fr) 320px' }, gap: 2, alignItems: 'start' }}>
        <Card sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', gap: 2.25 }}>
          {step === 0 && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
                {(['STREAK', 'TOTAL', 'POINTS'] as const).map((k) => (
                  <ButtonBase key={k} onClick={() => set({ kind: k, n: k === 'POINTS' ? 300 : k === 'TOTAL' ? 10 : 7, days: k === 'TOTAL' ? 14 : 7 })} aria-pressed={d.kind === k}
                    sx={{ p: 2, borderRadius: '16px', border: `2px solid ${d.kind === k ? tokens.primary : tokens.line}`, bgcolor: d.kind === k ? tokens.primarySoft : tokens.paper, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 0.5, textAlign: 'left' }}>
                    <Icon name={k === 'STREAK' ? 'flame' : k === 'TOTAL' ? 'check' : 'star'} size={24} style={{ color: d.kind === k ? tokens.primary : tokens.text3 }} />
                    <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{KIND_TEXT[k].label}</Typography>
                    <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{KIND_TEXT[k].hint}</Typography>
                  </ButtonBase>
                ))}
              </Box>
              {d.kind !== 'POINTS' && (
                <TextField select label="Какое дело" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={d.taskId} onChange={(e) => set({ taskId: e.target.value })}>
                  <MenuItem value="">Любые дела</MenuItem>
                  {tasks.map((t) => <MenuItem key={t.id} value={t.id}>{t.title}</MenuItem>)}
                  <MenuItem value="new">+ Новое дело…</MenuItem>
                </TextField>
              )}
              {d.kind !== 'POINTS' && d.taskId === 'new' && (
                <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
                  <TextField label="Новое дело" value={d.newTask} onChange={(e) => set({ newTask: e.target.value })} sx={{ flex: 1, minWidth: 220 }} placeholder="Почитать 20 минут" />
                  <TextField select label="Когда" SelectProps={{ displayEmpty: true }} InputLabelProps={{ shrink: true }} value={d.newTaskTime || ''} onChange={(e) => set({ newTaskTime: (e.target.value || undefined) as Draft['newTaskTime'] })} sx={{ width: 140 }}>
                    <MenuItem value="">В любое время</MenuItem>
                    {(['MORNING', 'DAY', 'EVENING'] as const).map((s) => <MenuItem key={s} value={s}>{SLOT_LABEL[s][0].toUpperCase() + SLOT_LABEL[s].slice(1)}</MenuItem>)}
                  </TextField>
                </Box>
              )}
              <Box>
                <Typography sx={{ ...labelCaps, mb: 1 }}>{d.kind === 'STREAK' ? 'Сколько дней подряд' : d.kind === 'TOTAL' ? 'Сколько раз' : 'Сколько звёзд'}</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  {(d.kind === 'STREAK' ? [5, 7, 10, 14] : d.kind === 'TOTAL' ? [5, 10, 15, 20] : [150, 300, 500]).map((v) => (
                    <Pill key={v} on={d.n === v} onClick={() => set({ n: v })}>{v}</Pill>
                  ))}
                  <TextField size="small" type="number" value={d.n} onChange={(e) => set({ n: Math.max(1, Number(e.target.value) || 1) })} inputProps={{ min: 1, 'aria-label': 'Своё число' }} sx={{ width: 90 }} />
                </Box>
              </Box>
              {d.kind !== 'STREAK' && (
                <Box>
                  <Typography sx={{ ...labelCaps, mb: 1 }}>За сколько дней</Typography>
                  <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    {[7, 10, 14, 30].map((v) => <Pill key={v} on={d.days === v} onClick={() => set({ days: v })}>{v}</Pill>)}
                  </Box>
                </Box>
              )}
            </>
          )}

          {step === 1 && (
            <>
              <Typography sx={{ fontSize: 15, color: tokens.text2 }}>Кто участвует? Каждый идёт к цели сам и получает приз, когда дойдёт.</Typography>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1.25 }}>
                {kids.map((k) => {
                  const on = chosen.some((x) => x.userId === k.userId)
                  return (
                    <ButtonBase key={k.userId} onClick={() => toggleKid(k)} aria-pressed={on}
                      sx={{ p: 2, borderRadius: '18px', border: `2px solid ${on ? kidColor(k.index).strong : tokens.line}`, bgcolor: on ? kidColor(k.index).bg : tokens.paper, display: 'flex', flexDirection: 'column', gap: 1 }}>
                      <KidDot name={k.name} index={k.index} pet={k.pet} size={56} />
                      <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{k.name}</Typography>
                      <Typography sx={{ fontSize: 12, color: on ? tokens.text2 : tokens.text3 }}>{on ? 'участвует' : 'не участвует'}</Typography>
                    </ButtonBase>
                  )
                })}
              </Box>
            </>
          )}

          {step === 2 && (
            <>
              <TextField label="Название" value={d.title} onChange={(e) => set({ title: e.target.value })} placeholder={autoTitle} inputProps={{ maxLength: 60 }} />
              <Box>
                <Typography sx={{ ...labelCaps, mb: 1 }}>Приз за выполнение</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                  {PRIZES.map((v) => <Pill key={v} on={d.prize === v} onClick={() => set({ prize: v })}>+{v}</Pill>)}
                  <TextField size="small" type="number" value={d.prize} onChange={(e) => set({ prize: Math.max(1, Number(e.target.value) || 1) })} inputProps={{ min: 1, 'aria-label': 'Свой приз' }} sx={{ width: 100 }} />
                </Box>
              </Box>
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>
                Начнётся сегодня, закончится {shortDate(new Date(startOfDay(new Date()).getTime() + ((d.kind === 'STREAK' ? d.n : d.days) - 1) * DAY).toISOString())}
                {d.taskId === 'new' && `. Заодно появится ежедневное дело «${d.newTask}»`}
              </Typography>
            </>
          )}

          {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
          <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
            <Button onClick={() => (step ? setStep(step - 1) : onClose(false))}>{step ? 'Назад' : 'Отмена'}</Button>
            <Button variant="contained" disabled={launch.isPending} onClick={next}>{step === 0 ? 'Дальше: кто участвует' : step === 1 ? 'Дальше: приз' : 'Запустить'}</Button>
          </Box>
        </Card>

        <Box sx={{ position: { md: 'sticky' }, top: 16 }}>
          <Typography sx={{ ...labelCaps, mb: 1 }}>Так увидит ребёнок</Typography>
          <Box sx={{ borderRadius: '24px', p: 2.25, background: 'linear-gradient(160deg,#FFE6A8 0%,#FFF6DF 60%,#FFFFFF 100%)', border: `1px solid #F5D48A`, display: 'flex', flexDirection: 'column', gap: 1.25, fontFamily: '"Nunito", system-ui, sans-serif' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ width: 40, height: 40, borderRadius: '13px', bgcolor: tokens.star, color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trophy" size={22} /></Box>
              <Typography sx={{ flex: 1, fontFamily: 'inherit', fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>{autoTitle}</Typography>
            </Box>
            <Typography sx={{ fontFamily: 'inherit', fontSize: 15, color: tokens.text2 }}>{rule}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              {Array.from({ length: Math.min(d.kind === 'POINTS' ? 7 : d.n, 14) }, (_, i) => (
                <Box key={i} sx={{ flex: 1, height: 10, borderRadius: 5, bgcolor: i < 2 ? tokens.star : 'rgba(122,78,0,.15)' }} />
              ))}
            </Box>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Box sx={{ display: 'flex' }}>
                {chosen.slice(0, 4).map((k, i) => <Box key={k.userId} sx={{ ml: i ? -1 : 0 }}><KidDot name={k.name} index={k.index} pet={k.pet} size={30} /></Box>)}
              </Box>
              <Box sx={{ flex: 1 }} />
              <Box component="b" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, fontSize: 20, color: tokens.starInk }}>+{d.prize}<StarIcon size={20} /></Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  )
}

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Box component="button" type="button" aria-pressed={on} onClick={onClick}
      sx={{ minWidth: 52, height: 40, px: 1.5, borderRadius: '12px', border: `1px solid ${on ? tokens.primary : tokens.lineStrong}`, bgcolor: on ? tokens.primary : tokens.paper, color: on ? '#FFF' : tokens.text, font: 'inherit', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
      {children}
    </Box>
  )
}
