import { useMemo } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { Box, ButtonBase, CircularProgress, Typography } from '@mui/material'
import ChildLayout, { plural } from '../../components/ChildLayout'
import { TaskRow, useTaskCompletion } from '../../components/child/TaskRow'
import { Bar, Icon, IconTile, KidAvatar, formatNumber } from '../../components/ui'
import { tokens } from '../../theme'
import {
  taskState,
  useChildChallenges,
  useChildName,
  useChildSummary,
  useChildTasks,
  useChildWishlist,
} from '../../hooks/useChildData'
import { mainGoal } from './goals-model'

const card = { bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}` }

/** CW_Home: «Сегодня» — дела дня, главная цель, питомец, челлендж. */
export default function ChildDashboard() {
  const today = useMemo(() => new Date(), [])
  const name = useChildName()
  const { data: summary } = useChildSummary()
  const { data: tasks = [], isLoading } = useChildTasks(today)
  const { data: wishlist = [] } = useChildWishlist()
  const { data: challenges = [] } = useChildChallenges()
  const { onDone, dialog, error, busy } = useTaskCompletion(today)

  const balance = summary?.pointsBalance ?? 0
  const doneCount = tasks.filter((t) => taskState(t) !== 'todo').length
  const left = tasks.length - doneCount
  // Невыполненные — сверху, чтобы следующее дело всегда было под рукой.
  const sorted = [...tasks].sort((a, b) => Number(taskState(a) !== 'todo') - Number(taskState(b) !== 'todo'))
  // Сытость питомца = доля сделанных сегодня дел (отправленные на проверку тоже кормят).
  const satiety = tasks.length ? Math.round((doneCount / tasks.length) * 100) : null
  const goal = mainGoal(wishlist, balance)
  const challenge = challenges.find((c: any) => c.progress && c.progress.current < c.progress.target) || challenges[0]
  const dateLabel = today.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <ChildLayout>
      <Box sx={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        <Box sx={{ flex: 1 }}>
          <Typography sx={{ fontSize: 17, fontWeight: 700, color: tokens.text3, '&::first-letter': { textTransform: 'uppercase' } }}>{dateLabel}</Typography>
          <Typography component="h1" sx={{ mt: 0.5, fontSize: { xs: 30, md: 38 }, fontWeight: 900, lineHeight: 1.15 }}>
            Привет{name ? `, ${name}` : ''}!
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(5, minmax(0, 1fr))' }, gap: 2.5, alignItems: 'start' }}>
        <Box sx={{ gridColumn: { lg: 'span 3' }, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <Typography component="h2" sx={{ flex: 1, fontSize: 22, fontWeight: 900 }}>
              {tasks.length === 0
                ? 'Сегодня заданий нет'
                : left === 0
                  ? 'Все дела сделаны!'
                  : `Ещё ${left} ${plural(left, 'дело', 'дела', 'дел')} — и всё!`}
            </Typography>
            {tasks.length > 0 && <Box component="span" sx={{ fontSize: 16, fontWeight: 800, color: tokens.text3 }}>{doneCount} из {tasks.length}</Box>}
          </Box>
          {tasks.length > 0 && <Bar value={(doneCount / tasks.length) * 100} />}
          {isLoading && <CircularProgress sx={{ alignSelf: 'center', my: 4 }} />}
          {error && <Typography sx={{ color: tokens.danger, fontWeight: 800 }}>{error}</Typography>}
          {sorted.map((t) => <TaskRow key={t.id} task={t} onDone={onDone} disabled={busy} />)}
          {!isLoading && tasks.length === 0 && (
            <Box sx={{ ...card, p: 3, textAlign: 'center', color: tokens.text2, fontSize: 18, fontWeight: 700 }}>Можно отдыхать или помочь кому-нибудь просто так.</Box>
          )}
        </Box>

        <Box sx={{ gridColumn: { lg: 'span 2' }, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {goal && (
            <ButtonBase component={RouterLink} to="/child/goals" sx={{ ...card, p: 2.5, display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 1.25, textAlign: 'left' }}>
              <Typography sx={{ fontSize: 15, fontWeight: 800, color: tokens.text3 }}>Главная цель</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.75 }}>
                <IconTile bg={tokens.starSoft} color="#9A5B00" size={64} radius={20}>
                  {goal.imageUrl ? <img src={goal.imageUrl} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 20 }} /> : <Icon name="gift" size={34} />}
                </IconTile>
                <Box sx={{ minWidth: 0 }}>
                  <Box component="b" sx={{ fontSize: 22, display: 'block', overflowWrap: 'anywhere' }}>{goal.title}</Box>
                  <Typography sx={{ mt: 0.25, fontSize: 16, fontWeight: 700, color: tokens.text2 }}>
                    {goal.needsPrice ? 'ждёт цену' : goal.left > 0 ? `ещё ${formatNumber(goal.left)} звёзд` : 'хватает звёзд!'}
                  </Typography>
                </Box>
              </Box>
              <Bar value={goal.percent} color={tokens.star} height={16} track={tokens.chip} />
            </ButtonBase>
          )}

          <Box sx={{ ...card, p: 2.5, display: 'flex', alignItems: 'center', gap: 2 }}>
            <KidAvatar size={84} />
            <Box sx={{ flex: 1 }}>
              <Box component="b" sx={{ fontSize: 20 }}>
                {satiety === null ? 'Рыжик отдыхает' : satiety >= 100 ? 'Рыжик сыт!' : satiety === 0 ? 'Рыжик проголодался' : `Рыжик сыт на ${satiety} %`}
              </Box>
              <Typography sx={{ mt: 0.5, fontSize: 16, fontWeight: 700, color: tokens.text2 }}>Каждое дело его кормит</Typography>
            </Box>
          </Box>

          {challenge && (
            <ButtonBase component={RouterLink} to="/child/rewards" sx={{ ...card, p: '18px 20px', bgcolor: tokens.reviewSoft, boxShadow: 'none', display: 'block', textAlign: 'left' }}>
              <Box component="b" sx={{ fontSize: 18, color: tokens.reviewInk }}>Челлендж: {challenge.title}</Box>
              <Typography sx={{ mt: 0.5, fontSize: 16, fontWeight: 700, color: '#4F3A8C' }}>
                {challenge.progress ? `${challenge.progress.current} из ${challenge.progress.target}` : ''}
                {challenge.rewardPoints ? ` · приз +${challenge.rewardPoints} звёзд` : ''}
              </Typography>
            </ButtonBase>
          )}
        </Box>
      </Box>
      {dialog}
    </ChildLayout>
  )
}
