import { Box, CircularProgress, Typography } from '@mui/material'
import ChildLayout from '../../components/ChildLayout'
import { Bar, Icon } from '../../components/ui'
import { tokens } from '../../theme'
import { useChildBadgesProgress, useChildChallenges } from '../../hooks/useChildData'

const card = { bgcolor: tokens.paper, borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}` }

function ChallengeCard({ c }: { c: any }) {
  const target = c.progress?.target ?? c.target ?? 0
  const current = Math.min(c.progress?.current ?? 0, target)
  const finished = target > 0 && current >= target
  return (
    <Box sx={{ ...card, bgcolor: tokens.reviewSoft, boxShadow: 'none', p: 2.75, display: 'flex', flexDirection: 'column', gap: 1.75 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Box sx={{ flex: 1, minWidth: 200 }}>
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: tokens.review }}>{finished ? 'Челлендж выполнен!' : 'Челлендж'}</Typography>
          <Typography component="h2" sx={{ mt: 0.5, fontSize: 26, fontWeight: 900 }}>{c.title}</Typography>
        </Box>
        {c.rewardPoints > 0 && <Box component="b" sx={{ fontSize: 20, color: tokens.reviewInk }}>Приз +{c.rewardPoints}</Box>}
      </Box>
      {/* Короткий челлендж — клетками по шагам, длинный — полосой. */}
      {target > 0 && target <= 14 ? (
        <Box sx={{ display: 'flex', gap: 1 }}>
          {Array.from({ length: target }, (_, i) => {
            const done = i < current
            const next = i === current
            return (
              <Box
                key={i}
                sx={{
                  flex: 1, height: 52, borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  bgcolor: done ? tokens.doneBright : tokens.paper, color: done ? '#FFFFFF' : next ? tokens.primary : tokens.muted,
                  boxShadow: next ? `inset 0 0 0 3px ${tokens.primary}` : 'none', fontWeight: 900,
                }}
              >
                {done ? <Icon name="check" size={24} stroke={3} /> : i + 1}
              </Box>
            )
          })}
        </Box>
      ) : (
        <Bar value={target ? (current / target) * 100 : 0} color={tokens.review} track={tokens.paper} />
      )}
      <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#4F3A8C' }}>{current} из {target}</Typography>
    </Box>
  )
}

/** CW_Rewards: челленджи и бейджи. */
export default function ChildRewards() {
  const { data: challenges = [], isLoading: lc } = useChildChallenges()
  const { data: badges = [], isLoading: lb } = useChildBadgesProgress()
  const earned = badges.filter((b) => b.earned)
  const open = badges.filter((b) => !b.earned).sort((a, b) => (b.progress?.percentage ?? 0) - (a.progress?.percentage ?? 0))
  const almost = open[0]

  return (
    <ChildLayout>
      <Typography component="h1" sx={{ fontSize: { xs: 30, md: 36 }, fontWeight: 900 }}>Награды</Typography>
      {(lc || lb) && <CircularProgress sx={{ alignSelf: 'center' }} />}

      {challenges.map((c: any) => <ChallengeCard key={c.id} c={c} />)}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
        <Typography component="h2" sx={{ flex: 1, fontSize: 22, fontWeight: 900 }}>
          Мои бейджи{badges.length ? ` · ${earned.length} из ${badges.length}` : ''}
        </Typography>
        {almost && almost.progress?.target > 0 && (
          <Typography sx={{ fontSize: 16, fontWeight: 800, color: tokens.text3 }}>
            Почти: «{almost.badge?.title}» — {almost.progress.current} из {almost.progress.target}
          </Typography>
        )}
      </Box>

      {!lb && badges.length === 0 && (
        <Box sx={{ ...card, p: 3, textAlign: 'center', fontSize: 18, fontWeight: 700, color: tokens.text2 }}>Бейджей пока нет — родители скоро их придумают.</Box>
      )}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(3, minmax(0, 1fr))', lg: 'repeat(6, minmax(0, 1fr))' }, gap: 1.75 }}>
        {[...earned, ...open].map((b: any) => {
          const got = !!b.earned
          const when = b.awardedAt || b.createdAt
          return (
            <Box key={b.badge?.id || b.id} sx={{ ...card, p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, textAlign: 'center' }}>
              <Box
                sx={{
                  width: 84, height: 84, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40,
                  background: got ? `radial-gradient(circle, ${tokens.starSoft} 55%, #F5C25A 56%, ${tokens.star} 100%)` : tokens.chip,
                  color: got ? '#9A5B00' : tokens.muted, filter: got ? 'none' : 'grayscale(1)', opacity: got ? 1 : 0.7,
                }}
              >
                {b.badge?.icon ? <span aria-hidden>{b.badge.icon}</span> : <Icon name="trophy" size={40} />}
              </Box>
              <Box component="b" sx={{ fontSize: 17, color: got ? tokens.text : tokens.text3, overflowWrap: 'anywhere' }}>{b.badge?.title || b.badge?.name}</Box>
              <Typography sx={{ fontSize: 14, fontWeight: 700, color: tokens.text3 }}>
                {got
                  ? when ? new Date(when).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : 'получен'
                  : b.progress?.target ? `${b.progress.current} из ${b.progress.target}` : 'ещё впереди'}
              </Typography>
            </Box>
          )
        })}
      </Box>
    </ChildLayout>
  )
}
