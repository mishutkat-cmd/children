import { useMemo, useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Typography } from '@mui/material'
import ChildLayout from '../../components/ChildLayout'
import { TaskRow, useTaskCompletion } from '../../components/child/TaskRow'
import { Icon } from '../../components/ui'
import { tokens } from '../../theme'
import { dateKeyOf, speak, taskState, useChildTasks } from '../../hooks/useChildData'

/** CW_Tasks: неделя вперёд, задания дня сеткой, озвучка. */
export default function ChildTasks() {
  const week = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return d
    })
  }, [])
  const [selected, setSelected] = useState(week[0])
  const isToday = dateKeyOf(selected) === dateKeyOf(week[0])
  const { data: tasks = [], isLoading } = useChildTasks(selected)
  const { onDone, dialog, error, busy } = useTaskCompletion(selected)
  const todo = tasks.filter((t) => taskState(t) === 'todo')
  const sorted = [...todo, ...tasks.filter((t) => taskState(t) !== 'todo')]

  return (
    <ChildLayout>
      <Typography component="h1" sx={{ fontSize: { xs: 30, md: 36 }, fontWeight: 900 }}>Задания</Typography>

      <Box role="tablist" aria-label="День" sx={{ display: 'flex', gap: { xs: 0.75, md: 1.25 } }}>
        {week.map((d) => {
          const on = dateKeyOf(d) === dateKeyOf(selected)
          return (
            <ButtonBase
              key={d.toISOString()}
              role="tab"
              aria-selected={on}
              onClick={() => setSelected(d)}
              sx={{
                flex: 1, minWidth: 0, height: 64, borderRadius: '22px', flexDirection: 'column', gap: '2px', fontSize: 15, fontWeight: 800,
                bgcolor: on ? tokens.text : tokens.paper, color: on ? '#FFFFFF' : tokens.text, boxShadow: on ? 'none' : `0 2px 0 ${tokens.kidShadow}`,
              }}
            >
              {d.toLocaleDateString('ru-RU', { weekday: 'short' }).replace(/^./, (c) => c.toUpperCase())}
              <Box component="b" sx={{ fontSize: 20 }}>{d.getDate()}</Box>
            </ButtonBase>
          )
        })}
      </Box>

      {!isToday && (
        <Typography sx={{ fontSize: 16, fontWeight: 700, color: tokens.text3 }}>
          Это задания на {selected.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}. Отметить их можно в тот день.
        </Typography>
      )}
      {error && <Typography sx={{ color: tokens.danger, fontWeight: 800 }}>{error}</Typography>}
      {isLoading ? (
        <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />
      ) : tasks.length === 0 ? (
        <Box sx={{ bgcolor: tokens.paper, borderRadius: '22px', p: 3, textAlign: 'center', fontSize: 18, fontWeight: 700, color: tokens.text2 }}>В этот день заданий нет</Box>
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 1.5 }}>
          {sorted.map((t) => <TaskRow key={t.id} task={t} onDone={onDone} disabled={busy || !isToday} />)}
        </Box>
      )}

      {todo.length > 0 && (
        <Box sx={{ mt: 'auto', p: '18px 20px', borderRadius: '22px', bgcolor: tokens.primarySoft, display: 'flex', alignItems: 'center', gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
          <Box component="span" sx={{ color: tokens.primary, display: 'flex' }}><Icon name="eye" size={28} stroke={2.4} /></Box>
          <Typography sx={{ flex: 1, fontSize: 17, fontWeight: 700, color: '#1D3A99' }}>Нажми на задание, чтобы послушать, что нужно сделать</Typography>
          <Button variant="outlined" onClick={() => speak(todo.map((t) => t.title).join('. '))} startIcon={<Icon name="speaker" size={20} />}>
            Слушать все
          </Button>
        </Box>
      )}
      {dialog}
    </ChildLayout>
  )
}
