import { useState } from 'react'
import { useMutation, useQueries, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { ConnectDialog } from '../../components/parent/access'
import { Bar, Icon } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useActivitySummary, useChildActivity, useChildActivityHistory } from '../../hooks/useActivity'
import { formatDateForAPI } from '../../utils/dateUtils'
import type { ActivityHistory, ActivitySummaryRow } from '../../types/api'

const fmt = (ms: number) => {
  const min = Math.round(ms / 60000)
  if (min < 60) return `${min} мин`
  return min % 60 ? `${Math.floor(min / 60)} ч ${String(min % 60).padStart(2, '0')}` : `${min / 60} ч`
}
const fmtMin = (min: number) => fmt(min * 60000)

/** Ориентиры по возрасту — рекомендация, не блокировка. */
const AGE_GUIDE = [
  { from: 0, to: 6, min: 60, label: 'до 6 лет' },
  { from: 6, to: 10, min: 90, label: '6–9 лет' },
  { from: 10, to: 14, min: 150, label: '10–13 лет' },
  { from: 14, to: 99, min: 180, label: '14+ лет' },
]
const guideFor = (age?: number | null) => AGE_GUIDE.find((g) => (age ?? 10) >= g.from && (age ?? 10) < g.to) ?? AGE_GUIDE[2]
const GOALS = [0, 60, 90, 120, 150, 180, 240]
const CAT_COLOR: Record<string, string> = { Игры: '#FF7A3D', Видео: '#E8505B', Соцсети: '#6D3FD1', Мессенджеры: '#2FA36B', Учёба: '#2556E8', Музыка: '#F5A524', Браузер: '#4A90C2', Другое: '#B8C0D4' }

/** Экранное время (V_Activity_B — обзор семьи, V_Activity_A — один ребёнок). */
export default function ParentActivity() {
  const { kids } = useKids()
  const { data: rows = [], isLoading } = useActivitySummary()
  const [selected, setSelected] = useState<string | null>(null)
  const [connect, setConnect] = useState<Kid | null>(null)
  const rowOf = (k: Kid) => rows.find((r) => r.userId === k.userId)
  const sel = kids.find((k) => k.userId === selected)
  const connected = kids.filter((k) => rowOf(k)?.connected)
  // Две недели по каждому подключённому ребёнку — для сравнения «эта неделя / прошлая».
  const to = formatDateForAPI(new Date())
  const weeks = useQueries({
    queries: connected.map((k) => ({
      queryKey: ['activity-history', k.profileId, 14, to],
      queryFn: async () => (await api.get(`/activity/children/${k.profileId}/history?days=14&to=${to}`)).data as ActivityHistory,
      staleTime: 60_000,
    })),
  })
  // Сравниваем средний день, а не сумму: у только что подключённого телефона прошлая неделя неполная.
  const days = (from: number, toIdx: number) => weeks.flatMap((q) => q.data?.series.slice(from, toIdx) ?? []).filter((d) => d.totalMs > 0)
  const avg = (list: { totalMs: number }[]) => (list.length ? list.reduce((a, d) => a + d.totalMs, 0) / list.length : 0)
  const thisDays = days(7, 14)
  const lastDays = days(0, 7)
  const thisWeek = thisDays.reduce((a, d) => a + d.totalMs, 0)
  const lastWeek = lastDays.length >= 3 ? avg(lastDays) : 0
  const delta = lastWeek > 0 && thisDays.length ? Math.round(((avg(thisDays) - lastWeek) / lastWeek) * 100) : null

  return (
    <Layout>
      <PageHeader kicker="Считает Android-телефон ребёнка · цель — ориентир, телефон ничего не блокирует" title="Экранное время" />

      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <KidTab on={!sel} onClick={() => setSelected(null)}><Icon name="users" size={18} />Вся семья</KidTab>
        {kids.map((k) => (
          <KidTab key={k.userId} on={sel?.userId === k.userId} onClick={() => setSelected(k.userId)} color={kidColor(k.index)}>
            <KidDot name={k.name} index={k.index} pet={k.pet} size={30} />{k.name}
          </KidTab>
        ))}
      </Box>

      {sel ? (
        <KidDetail kid={sel} row={rowOf(sel)} onConnect={() => setConnect(sel)} />
      ) : (
        <>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0, 1fr))', xl: 'repeat(3, minmax(0, 1fr))' }, gap: 1.5 }}>
            {kids.map((k) => <KidCard key={k.userId} kid={k} row={rowOf(k)} loading={isLoading} onOpen={() => setSelected(k.userId)} onConnect={() => setConnect(k)} />)}
          </Box>

          {connected.length > 0 && (
            <Card sx={{ p: 2.25, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
              <Box sx={{ width: 52, height: 52, borderRadius: '16px', bgcolor: delta !== null && delta <= 0 ? tokens.doneSoft : tokens.starSoft, color: delta !== null && delta <= 0 ? tokens.done : tokens.starInk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800 }}>
                {delta === null ? '—' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}%`}
              </Box>
              <Box sx={{ flex: 1, minWidth: 220 }}>
                <Typography sx={{ fontSize: 16, fontWeight: 700 }}>Вся семья за неделю — {fmt(thisWeek)}</Typography>
                <Typography sx={{ fontSize: 14, color: tokens.text3 }}>
                  {delta === null ? 'С прошлой неделей сравним, когда накопится две недели данных.' : delta <= 0 ? `В среднем за день на ${Math.abs(delta)} % меньше экрана, чем на прошлой неделе.` : `В среднем за день на ${delta} % больше экрана, чем на прошлой неделе.`}
                </Typography>
              </Box>
            </Card>
          )}

          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2, alignItems: 'start' }}>
            <SetupCard kids={kids} connected={connected} onConnect={setConnect} />
            <GuideCard kids={kids} rows={rows} />
          </Box>
        </>
      )}
      {connect && <ConnectDialog kid={connect} onClose={() => setConnect(null)} />}
    </Layout>
  )
}

function KidTab({ on, onClick, color, children }: { on: boolean; onClick: () => void; color?: { bg: string; strong: string }; children: React.ReactNode }) {
  return (
    <Box component="button" type="button" aria-pressed={on} onClick={onClick}
      sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, height: 44, pl: color ? 0.75 : 1.75, pr: 1.75, borderRadius: '22px', font: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', color: on && !color ? '#FFF' : tokens.text,
        border: on ? `2px solid ${color ? color.strong : tokens.text}` : `1px solid ${tokens.lineStrong}`, bgcolor: on ? (color ? color.bg : tokens.text) : tokens.paper }}>
      {children}
    </Box>
  )
}

function GoalBar({ ms, goal, color }: { ms: number; goal?: number | null; color: string }) {
  const over = !!goal && ms > goal * 60000
  return <Bar value={goal ? Math.min(100, (ms / (goal * 60000)) * 100) : ms > 0 ? 100 : 0} color={over ? tokens.danger : color} height={10} />
}

function KidCard({ kid, row, loading, onOpen, onConnect }: { kid: Kid; row?: ActivitySummaryRow; loading: boolean; onOpen: () => void; onConnect: () => void }) {
  const c = kidColor(kid.index)
  const goal = row?.screenGoalMin || null
  return (
    <Card sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <KidDot name={kid.name} index={kid.index} pet={kid.pet} size={44} />
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>{kid.name}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{row?.connected ? 'Android · сегодня' : 'телефон не подключён'}</Typography>
        </Box>
      </Box>
      {loading ? null : row?.connected ? (
        <>
          <Typography sx={{ fontSize: 22, fontWeight: 700 }}>
            {fmt(row.totalMs)}{goal ? <Box component="span" sx={{ fontSize: 15, fontWeight: 500, color: tokens.text3 }}> из {fmtMin(goal)}</Box> : null}
          </Typography>
          <GoalBar ms={row.totalMs} goal={goal} color={c.strong} />
          <Typography sx={{ fontSize: 13, color: tokens.text2 }}>
            {row.topApps?.length ? row.topApps.slice(0, 2).map((a) => `${a.appLabel} ${fmt(a.totalMs)}`).join(' · ') : 'Сегодня телефоном почти не пользовались'}
          </Typography>
          <Button size="small" onClick={onOpen} sx={{ alignSelf: 'flex-start' }}>Подробнее</Button>
        </>
      ) : (
        <>
          <Typography sx={{ fontSize: 14, color: tokens.text2 }}>Статистика ещё не приходила. Нужен Android-телефон с приложением и доступом к статистике.</Typography>
          <Button size="small" variant="outlined" startIcon={<Icon name="qr" size={16} />} onClick={onConnect} sx={{ alignSelf: 'flex-start' }}>Подключить телефон</Button>
        </>
      )}
    </Card>
  )
}

function SetupCard({ kids, connected, onConnect }: { kids: Kid[]; connected: Kid[]; onConnect: (k: Kid) => void }) {
  const missing = kids.filter((k) => !connected.includes(k))
  const steps = [
    { title: 'Установить приложение на Android', sub: connected.length ? `${connected.map((k) => k.name).join(' и ')} — готово` : 'Подключите телефон по QR-коду', done: connected.length > 0 && missing.length === 0 },
    { title: 'Разрешить доступ к статистике', sub: 'На телефоне ребёнка: Настройки → Специальный доступ → Статистика использования → Звёздочки', done: connected.length > 0 && missing.length === 0 },
    { title: 'Поставить цель на день', sub: 'Возьмите ориентир по возрасту справа или задайте свой в карточке ребёнка', done: false },
  ]
  const current = steps.findIndex((s) => !s.done)
  return (
    <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography component="h2" sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>Подключить телефон ребёнка</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>шаг {current + 1} из 3</Typography>
      </Box>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {steps.map((s, i) => (
          <Box component="li" key={s.title} sx={{ display: 'flex', gap: 1.25 }}>
            <Box sx={{ flex: '0 0 28px', height: 28, borderRadius: '50%', bgcolor: s.done ? tokens.doneBright : i === current ? tokens.primary : tokens.chip, color: s.done || i === current ? '#FFF' : tokens.text3, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>
              {s.done ? <Icon name="check" size={16} /> : i + 1}
            </Box>
            <Box>
              <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{s.title}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{s.sub}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {missing.length > 0 && (
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {missing.map((k) => <Button key={k.userId} size="small" variant="outlined" startIcon={<Icon name="qr" size={16} />} onClick={() => onConnect(k)}>{k.name}: подключить</Button>)}
        </Box>
      )}
      <Typography sx={{ fontSize: 13, color: tokens.text3, bgcolor: tokens.bg, p: 1.25, borderRadius: '12px' }}>
        iPhone пока не поддерживается — Apple не даёт другим приложениям видеть экранное время. Блокировок и времени сна тоже нет: телефон только считает, а цель помогает договориться.
      </Typography>
    </Card>
  )
}

function useSetGoal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ kid, min }: { kid: Kid; min: number }) => api.patch(`/children/${kid.userId}`, { screenGoalMin: min }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['activity-summary'] }),
  })
}

function GuideCard({ kids, rows }: { kids: Kid[]; rows: ActivitySummaryRow[] }) {
  const setGoal = useSetGoal()
  return (
    <Card sx={{ p: 2.25, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>Ориентиры по возрасту</Typography>
      {AGE_GUIDE.map((g) => (
        <Box key={g.label} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75, borderTop: `1px solid ${tokens.line}` }}>
          <Typography sx={{ width: 90, fontSize: 14, fontWeight: 600 }}>{g.label}</Typography>
          <Typography sx={{ flex: 1, fontSize: 14, color: tokens.text2 }}>до {fmtMin(g.min)} в день</Typography>
        </Box>
      ))}
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mt: 0.5 }}>
        {kids.map((k) => {
          const g = guideFor(k.age)
          const cur = rows.find((r) => r.userId === k.userId)?.screenGoalMin
          return cur === g.min ? (
            <Typography key={k.userId} sx={{ fontSize: 13, color: tokens.done, display: 'flex', alignItems: 'center', gap: 0.5 }}><Icon name="check" size={14} />{k.name}: {fmtMin(g.min)}</Typography>
          ) : (
            <Button key={k.userId} size="small" variant="outlined" disabled={setGoal.isPending} onClick={() => setGoal.mutate({ kid: k, min: g.min })}>
              {k.name}: {fmtMin(g.min)}
            </Button>
          )
        })}
      </Box>
    </Card>
  )
}

function KidDetail({ kid, row, onConnect }: { kid: Kid; row?: ActivitySummaryRow; onConnect: () => void }) {
  const { data: detail } = useChildActivity(row?.connected ? kid.profileId : null)
  const { data: hist } = useChildActivityHistory(row?.connected ? kid.profileId : null, 7)
  const setGoal = useSetGoal()
  const c = kidColor(kid.index)
  const goal = row?.screenGoalMin || null
  const total = detail?.totalMs ?? row?.totalMs ?? 0
  const leftMin = goal ? goal - Math.round(total / 60000) : null
  const max = Math.max(1, ...(hist?.series.map((d) => d.totalMs) ?? [1]), goal ? goal * 60000 : 0)
  const dow = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

  if (!row?.connected) {
    return (
      <Card sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 1.5, alignItems: 'flex-start' }}>
        <Typography sx={{ fontSize: 18, fontWeight: 700 }}>Статистика от телефона ещё не приходила</Typography>
        <Typography sx={{ color: tokens.text2 }}>Подключите Android-телефон ребёнка и на нём разрешите «Статистику использования» для приложения «Звёздочки». Данные появятся в течение 15 минут.</Typography>
        <Button variant="contained" startIcon={<Icon name="qr" size={18} />} onClick={onConnect}>Подключить телефон</Button>
      </Card>
    )
  }

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 340px' }, gap: 2, alignItems: 'start' }}>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card sx={{ p: 2.5, bgcolor: c.bg, borderColor: 'transparent', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          <Typography sx={{ ...labelCaps, color: c.ink }}>Сегодня · {fmt(total)}</Typography>
          <Typography sx={{ fontSize: 28, fontWeight: 800, color: c.ink }}>
            {leftMin === null ? 'Цели на день нет' : leftMin >= 0 ? `Осталось ${fmtMin(leftMin)}` : `Больше цели на ${fmtMin(-leftMin)}`}
          </Typography>
          {goal && <GoalBar ms={total} goal={goal} color={c.strong} />}
        </Card>

        <Card sx={{ p: 2.25 }}>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, mb: 1.5 }}>По категориям сегодня</Typography>
          {(detail?.categories ?? []).length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Сегодня пусто.</Typography>}
          {detail?.categories.map((cat) => (
            <Box key={cat.category} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 0.75 }}>
              <Typography sx={{ width: 110, fontSize: 14, fontWeight: 600 }}>{cat.category}</Typography>
              <Box sx={{ flex: 1 }}><Bar value={(cat.totalMs / Math.max(1, detail.totalMs)) * 100} color={CAT_COLOR[cat.category] ?? tokens.muted} height={10} /></Box>
              <Typography sx={{ width: 64, textAlign: 'right', fontSize: 14, color: tokens.text2 }}>{fmt(cat.totalMs)}</Typography>
            </Box>
          ))}
        </Card>

        <Card sx={{ p: 2.25 }}>
          <Box sx={{ display: 'flex', alignItems: 'baseline', mb: 1.5 }}>
            <Typography component="h2" sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>Неделя</Typography>
            {hist && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>в среднем {fmt(hist.avgMs)}</Typography>}
          </Box>
          <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 1, height: 140 }}>
            {hist?.series.map((d) => {
              const over = !!goal && d.totalMs > goal * 60000
              return (
                <Box key={d.date} sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5, height: '100%' }}>
                  <Box sx={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                    <Box title={fmt(d.totalMs)} sx={{ width: '100%', borderRadius: '8px 8px 4px 4px', bgcolor: over ? tokens.danger : c.strong, height: `${(d.totalMs / max) * 100}%`, minHeight: d.totalMs ? 4 : 0 }} />
                  </Box>
                  <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{dow[new Date(d.date + 'T00:00').getDay()]}</Typography>
                </Box>
              )
            })}
          </Box>
          {goal && <Typography sx={{ mt: 1, fontSize: 13, color: tokens.text3 }}>Красным — дни больше цели</Typography>}
        </Card>
      </Box>

      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Card sx={{ p: 2.25 }}>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700, mb: 1 }}>Приложения</Typography>
          {(detail?.apps ?? []).slice(0, 8).map((a) => (
            <Box key={a.packageName} sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 0.75, borderTop: `1px solid ${tokens.line}` }}>
              <Typography sx={{ flex: 1, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.appLabel}</Typography>
              <Typography sx={{ fontSize: 14, color: tokens.text2 }}>{fmt(a.totalMs)}</Typography>
            </Box>
          ))}
          {(detail?.apps ?? []).length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>Сегодня пусто.</Typography>}
        </Card>
        <Card sx={{ p: 2.25 }}>
          <Typography component="h2" sx={{ fontSize: 17, fontWeight: 700 }}>Цель на день</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3, mb: 1.25 }}>Ориентир для {kid.age ? `${kid.age} лет` : 'этого возраста'} — {fmtMin(guideFor(kid.age).min)}. Телефон не блокируется.</Typography>
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
            {GOALS.map((m) => {
              const on = (goal ?? 0) === m
              return (
                <Box key={m} component="button" type="button" aria-pressed={on} disabled={setGoal.isPending} onClick={() => setGoal.mutate({ kid, min: m })}
                  sx={{ height: 36, px: 1.25, borderRadius: '10px', border: `1px solid ${on ? tokens.primary : tokens.lineStrong}`, bgcolor: on ? tokens.primary : tokens.paper, color: on ? '#FFF' : tokens.text, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                  {m ? fmtMin(m) : 'Без цели'}
                </Box>
              )
            })}
          </Box>
        </Card>
      </Box>
    </Box>
  )
}
