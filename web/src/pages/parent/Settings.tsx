import { useEffect, useState } from 'react'
import { Link as RouterLink } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, TextField, Typography } from '@mui/material'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, useKids } from '../../components/parent/kit'
import { FamilyPcCard } from '../../components/parent/access'
import PetSettings from '../../components/parent/PetSettings'
import NotifPrefs from '../../components/parent/NotifPrefs'
import { Icon, formatNumber, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'

const SECTIONS = [
  ['family', 'Семья', 'users'],
  ['money', 'Звёзды и деньги', 'star'],
  ['kids-app', 'Детское приложение', 'sparkle'],
  ['notifications', 'Уведомления', 'bell'],
  ['data', 'Данные', 'shield'],
] as const

/** Какой раздел сейчас на экране — для подсветки в меню. */
function useActiveSection() {
  const [active, setActive] = useState<string>(SECTIONS[0][0])
  useEffect(() => {
    const els = SECTIONS.map(([id]) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]
        if (visible) setActive(visible.target.id)
      },
      { rootMargin: '-10% 0px -60% 0px' },
    )
    els.forEach((el) => io.observe(el))
    // Последний раздел короткий и не доезжает до верха — внизу страницы подсвечиваем его.
    const onScroll = () => {
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) setActive(SECTIONS[SECTIONS.length - 1][0])
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => { io.disconnect(); window.removeEventListener('scroll', onScroll) }
  }, [])
  return [active, setActive] as const
}

function Group({ id, title, sub, children }: { id: string; title: string; sub: string; children: React.ReactNode }) {
  return (
    <Box component="section" id={id} aria-labelledby={`${id}-title`} sx={{ scrollMarginTop: 24, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
      <Box>
        <Typography id={`${id}-title`} component="h2" sx={{ fontSize: 20, fontWeight: 700 }}>{title}</Typography>
        <Typography sx={{ fontSize: 14, color: tokens.text3 }}>{sub}</Typography>
      </Box>
      {children}
    </Box>
  )
}

function LinkRow({ icon, title, sub, to, action }: { icon: IconName | React.ReactNode; title: string; sub: React.ReactNode; to: string; action?: string }) {
  return (
    <Box component={RouterLink} to={to} sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5, px: 0.5, color: 'inherit', textDecoration: 'none', borderTop: `1px solid ${tokens.line}`, '&:first-of-type': { borderTop: 0 }, '&:hover .go': { color: tokens.primary } }}>
      {typeof icon === 'string' ? <Box sx={{ flex: '0 0 40px', height: 40, borderRadius: '12px', bgcolor: tokens.chip, color: tokens.text2, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon as IconName} size={20} /></Box> : icon}
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{title}</Typography>
        <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{sub}</Typography>
      </Box>
      <Box className="go" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: tokens.text3, fontSize: 14, fontWeight: 600 }}>{action}<Icon name="chevron" size={18} /></Box>
    </Box>
  )
}

/** Настройки (V_Settings_B): группы с меню-якорями, опасное — отдельной карточкой. */
export default function ParentSettings() {
  const { kids } = useKids()
  const [active, setActive] = useActiveSection()
  const { data: adults = [] } = useQuery<any[]>({ queryKey: ['family-adults'], queryFn: async () => (await api.get('/auth/family')).data || [] })

  return (
    <Layout>
      <PageHeader kicker="Всё в одном месте" title="Настройки" />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '220px minmax(0, 1fr)' }, gap: 3, alignItems: 'start' }}>
        <Box component="nav" aria-label="Разделы настроек" sx={{ display: { xs: 'flex', md: 'flex' }, flexDirection: { xs: 'row', md: 'column' }, flexWrap: 'wrap', gap: 0.5, position: { md: 'sticky' }, top: 28 }}>
          {SECTIONS.map(([id, label, icon]) => (
            <Box key={id} component="a" href={`#${id}`} aria-current={active === id ? 'true' : undefined}
              onClick={(e: React.MouseEvent) => { e.preventDefault(); setActive(id); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); history.replaceState(null, '', `#${id}`) }}
              sx={{ display: 'flex', alignItems: 'center', gap: 1, px: 1.5, py: 1.1, borderRadius: '10px', fontSize: 14, fontWeight: 600, textDecoration: 'none',
                color: active === id ? tokens.primaryInk : tokens.text2, bgcolor: active === id ? tokens.primarySoft : 'transparent', '&:hover': { bgcolor: active === id ? tokens.primarySoft : tokens.chip } }}>
              <Icon name={icon} size={18} />{label}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <Group id="family" title="Семья" sub="Кто в семье и что может">
            <Card sx={{ px: 2, py: 0.5 }}>
              <LinkRow icon={<Box sx={{ display: 'flex' }}>{kids.slice(0, 3).map((k, i) => <Box key={k.userId} sx={{ ml: i ? -1.5 : 0 }}><KidDot name={k.name} index={k.index} pet={k.pet} size={40} /></Box>)}</Box>}
                title="Дети" sub={kids.length ? `${kids.map((k) => k.name).join(', ')} · имя, возраст, вход, питомец` : 'Добавьте первого ребёнка'} to="/parent/children" />
              <LinkRow icon="users" title="Взрослые" sub={adults.length ? adults.map((a) => `${a.login}${a.isOwner ? ' (владелец)' : ''}`).join(', ') : '—'} to="/parent/account" action="Пригласить" />
              <LinkRow icon="user" title="Мой аккаунт" sub="Фото, логин, почта, пароль, устройства" to="/parent/account" />
            </Card>
          </Group>

          <Group id="money" title="Звёзды и деньги" sub="Курс, по которому звёзды меняются на деньги">
            <RateCard />
          </Group>

          <Group id="kids-app" title="Детское приложение" sub="Питомцы и что видит ребёнок">
            <Card sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography component="h3" sx={{ fontSize: 17, fontWeight: 700, mb: 1.5 }}>Питомцы</Typography>
              <PetSettings />
            </Card>
            <Card sx={{ p: { xs: 2, md: 2.5 } }}>
              <Typography component="h3" sx={{ fontSize: 17, fontWeight: 700, mb: 1 }}>Семейный компьютер</Typography>
              <FamilyPcCard />
            </Card>
          </Group>

          <Group id="notifications" title="Уведомления" sub="О чём сообщать в колокольчике">
            <Card sx={{ p: { xs: 2, md: 2.5 } }}><NotifPrefs /></Card>
          </Group>

          <Group id="data" title="Данные" sub="Очистка архива — действие необратимое">
            <CleanupCard />
          </Group>
        </Box>
      </Box>
    </Layout>
  )
}

function RateCard() {
  const qc = useQueryClient()
  const { kids } = useKids()
  const { data: settings } = useQuery<any>({ queryKey: ['motivation-settings'], queryFn: async () => (await api.get('/motivation/settings')).data })
  const rate: number = settings?.conversionRate || 10
  const [value, setValue] = useState('')
  const [editing, setEditing] = useState(false)
  const save = useMutation({
    mutationFn: (conversionRate: number) => api.patch('/motivation/conversion-rate', { conversionRate }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['motivation-settings'] }); setEditing(false) },
  })
  const richest = [...kids].sort((a, b) => b.balance - a.balance)[0]
  return (
    <Card sx={{ p: { xs: 2, md: 2.5 }, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
      <Box sx={{ flex: 1, minWidth: 240 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Курс для выплат деньгами</Typography>
        <Typography sx={{ fontSize: 22, fontWeight: 700, my: 0.5 }}>{rate} звёзд = 1 ₴</Typography>
        {richest && richest.balance > 0 && (
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{richest.name} сейчас может обменять {formatNumber(richest.balance)} звёзд на {formatNumber(Math.floor(richest.balance / rate))} ₴</Typography>
        )}
      </Box>
      {editing ? (
        <Box component="form" onSubmit={(e) => { e.preventDefault(); const n = Number(value); if (n > 0) save.mutate(n) }} sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          <TextField size="small" type="number" label="Звёзд за 1 ₴" value={value} onChange={(e) => setValue(e.target.value)} inputProps={{ min: 1 }} sx={{ width: 140 }} autoFocus />
          <Button type="submit" variant="contained" disabled={!(Number(value) > 0) || save.isPending}>Сохранить</Button>
          <Button onClick={() => setEditing(false)}>Отмена</Button>
        </Box>
      ) : (
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button variant="outlined" component={RouterLink} to="/parent/conversion">Выплаты</Button>
          <Button variant="outlined" onClick={() => { setValue(String(rate)); setEditing(true) }}>Изменить курс</Button>
        </Box>
      )}
    </Card>
  )
}

const CLEANUP_ROWS: [string, string][] = [
  ['archivedTasks', 'Архивные задания'],
  ['archivedRewards', 'Архивные награды'],
  ['orphanedTaskAssignments', 'Назначения удалённых заданий'],
  ['orphanedCompletions', 'Выполнения удалённых заданий'],
  ['orphanedWishlistItems', 'Желания без награды'],
  ['orphanedExchanges', 'Обмены без награды'],
  ['orphanedLedgerEntries', 'Записи звёзд без источника'],
  ['orphanedNotifications', 'Уведомления без источника'],
  ['orphanedChildBadges', 'Бейджи удалённых наград'],
]

/** Опасное действие отдельно: сначала показываем, что удалится, потом спрашиваем. */
function CleanupCard() {
  const qc = useQueryClient()
  const [preview, setPreview] = useState<any>(null)
  const [result, setResult] = useState<any>(null)
  const check = useMutation({ mutationFn: async () => (await api.get('/ledger/parent/cleanup-preview')).data, onSuccess: (d) => { setResult(null); setPreview(d) } })
  const run = useMutation({
    mutationFn: async () => {
      const res = await api.post('/ledger/parent/cleanup')
      if (res.data?.success === false) throw new Error(res.data.error || 'Очистка не удалась')
      return res.data
    },
    onSuccess: (d) => {
      setResult(d)
      setPreview(null)
      for (const key of ['tasks', 'rewards', 'wishlist', 'parent-wishlist', 'children', 'notifications']) qc.invalidateQueries({ queryKey: [key] })
    },
  })
  const data = result || preview
  const rows = data ? CLEANUP_ROWS.map(([k, label]) => [label, Number(data[k]) || 0] as const).filter(([, v]) => v > 0) : []
  const total = rows.reduce((s, [, v]) => s + v, 0)
  return (
    <Card sx={{ p: { xs: 2, md: 2.5 }, borderColor: '#F3C2BE', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start' }}>
        <Box sx={{ flex: '0 0 40px', height: 40, borderRadius: '12px', bgcolor: tokens.dangerSoft, color: tokens.danger, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="trash" size={20} /></Box>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>Очистить архив</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text3 }}>Удалит архивные задания и награды и всё, что от них осталось. Балансы детей пересчитаются. Отменить нельзя.</Typography>
        </Box>
      </Box>
      {data && (
        <Box sx={{ p: 1.5, borderRadius: '12px', bgcolor: result ? tokens.doneSoft : tokens.bg }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, mb: rows.length ? 0.75 : 0 }}>{total === 0 ? 'Удалять нечего — архив пуст' : result ? `Удалено записей: ${total}` : `Будет удалено записей: ${total}`}</Typography>
          {rows.map(([label, v]) => (
            <Box key={label} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: tokens.text2 }}><span>{label}</span><b>{v}</b></Box>
          ))}
        </Box>
      )}
      {(check.isError || run.isError) && <Typography role="alert" sx={{ fontSize: 14, color: tokens.danger }}>{(run.error as Error)?.message || 'Не получилось посчитать'}</Typography>}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" disabled={check.isPending || run.isPending} onClick={() => check.mutate()}>{check.isPending ? 'Считаем…' : 'Что удалится?'}</Button>
        {preview && total > 0 && (
          <Button variant="contained" color="error" disabled={run.isPending} onClick={() => window.confirm(`Удалить ${total} записей? Это необратимо.`) && run.mutate()}>{run.isPending ? 'Удаляем…' : 'Удалить'}</Button>
        )}
      </Box>
    </Card>
  )
}
