import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, Button, Dialog, DialogContent, IconButton, Slider, TextField, Typography } from '@mui/material'
import { MapContainer, TileLayer, Marker, Circle, Polyline, Tooltip as MapTooltip, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Layout, { PageHeader } from '../../components/Layout'
import { Card, KidDot, kidColor, labelCaps, useKids, type Kid } from '../../components/parent/kit'
import { ConnectDialog } from '../../components/parent/access'
import { Icon, type IconName } from '../../components/ui'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { useFamilyLocations, useRequestLocationRefresh } from '../../hooks/useChildrenLocations'
import { formatAgo, hasCoordinates } from '../../utils/locationFormat'
import type { ChildLocation, FamilyLocationRow } from '../../types/api'

/**
 * Тайлы OpenStreetMap: без ключа и без биллинга, в отличие от Google Maps.
 * У публичного сервера OSM есть usage policy — он рассчитан на небольшой
 * трафик и запрещает тяжёлые коммерческие нагрузки. Если пользователей станет
 * много, меняется ровно эта пара констант на MapTiler / Stadia / свой прокси.
 * https://operations.osmfoundation.org/policies/tiles/
 */
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'

/** Куда смотрим, пока не пришли первые координаты. */
const FALLBACK_CENTER: [number, number] = [50.4501, 30.5234]
const FALLBACK_ZOOM = 10

type PlaceKind = 'home' | 'school' | 'sport' | 'other'
type Place = { id: string; name: string; lat: number; lng: number; radius: number; kids: string[]; note?: string; kind?: PlaceKind }
type PlaceEvent = { at: string; place: Place; dir: 'in' | 'out'; first?: boolean }

const KINDS: { id: PlaceKind; label: string; icon: IconName; color: string }[] = [
  { id: 'home', label: 'Дом', icon: 'home', color: '#2FA36B' },
  { id: 'school', label: 'Школа', icon: 'edit', color: '#2556E8' },
  { id: 'sport', label: 'Секция', icon: 'flag', color: '#6D3FD1' },
  { id: 'other', label: 'Другое', icon: 'map', color: '#F5A524' },
]
const kindOf = (k?: string) => KINDS.find((x) => x.id === k) ?? KINDS[3]

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch] ?? '&#39;')

const time = (iso: string) => new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })

function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = (d: number) => (d * Math.PI) / 180
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h))
}

/** То же правило, что на сервере (location-rules placeOf): ближайшее место, в радиус которого попала точка. */
function placeOf(p: { lat?: number; lng?: number } | null | undefined, places: Place[]): Place | null {
  if (!hasCoordinates(p)) return null
  let best: Place | null = null
  let bestD = Infinity
  for (const place of places) {
    const d = distanceM(p, place)
    if (d <= (place.radius ?? 150) && d < bestD) { best = place; bestD = d }
  }
  return best
}

/** Приходы и уходы по треку за день. */
function placeEvents(points: ChildLocation[], places: Place[]): PlaceEvent[] {
  const sorted = points.filter(hasCoordinates).sort((a, b) => +new Date(a.capturedAt) - +new Date(b.capturedAt))
  const out: PlaceEvent[] = []
  let cur: Place | null = null
  sorted.forEach((p, i) => {
    const now = placeOf(p, places)
    if (i === 0) {
      if (now) out.push({ at: p.capturedAt, place: now, dir: 'in', first: true })
    } else if (now?.id !== cur?.id) {
      if (cur) out.push({ at: p.capturedAt, place: cur, dir: 'out' })
      if (now) out.push({ at: p.capturedAt, place: now, dir: 'in' })
    }
    cur = now
  })
  return out
}

/** Метка ребёнка: кружок в его цвете с первой буквой, серый — если точка устарела. */
const kidIcon = (kid: Kid | undefined, row: FamilyLocationRow, selected: boolean): L.DivIcon => {
  const stale = row.location?.isStale !== false
  const c = kidColor(kid?.index ?? 0)
  const letter = escapeHtml((row.name || '?').trim().charAt(0).toUpperCase())
  return L.divIcon({
    className: 'kid-pin',
    html: `<div style="display:flex;flex-direction:column;align-items:center">
      <div style="width:${selected ? 52 : 44}px;height:${selected ? 52 : 44}px;border-radius:50%;background:${stale ? '#B8C0D4' : c.strong};border:4px solid #fff;box-shadow:0 3px 10px rgba(21,24,39,.3);display:flex;align-items:center;justify-content:center;color:#fff;font:800 18px/1 Inter,system-ui,sans-serif">${letter}</div>
      <div style="margin-top:-3px;width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid #fff"></div>
    </div>`,
    iconSize: [52, 60],
    iconAnchor: [26, 58],
  })
}

/**
 * Кадрирование живёт отдельным компонентом: доступ к экземпляру карты есть
 * только у потомков MapContainer. Первый показ вписывает всех, дальше камеру
 * трогаем только по клику — автообновление раз в 20 секунд не выдёргивает из зума.
 */
function MapController({ points, focus, onPick }: { points: [number, number][]; focus: { lat: number; lng: number; n: number } | null; onPick: ((ll: L.LatLng) => void) | null }) {
  const map = useMap()
  const fitted = useRef(false)
  useEffect(() => {
    if (fitted.current || points.length === 0) return
    fitted.current = true
    if (points.length === 1) map.setView(points[0], 15)
    else map.fitBounds(L.latLngBounds(points), { padding: [60, 60] })
  }, [points, map])
  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 16, { duration: 0.6 })
  }, [focus, map])
  useMapEvents({ click: (e) => onPick?.(e.latlng) })
  return null
}

function useDayHistory(childId: string | null, dayOffset: number) {
  return useQuery<ChildLocation[]>({
    queryKey: ['child-location-history', childId, dayOffset],
    queryFn: async () => {
      const from = new Date()
      from.setHours(0, 0, 0, 0)
      from.setDate(from.getDate() - dayOffset)
      const to = new Date(from.getTime() + 86_400_000)
      const res = await api.get(`/locations/children/${childId}/history?from=${from.toISOString()}&to=${to.toISOString()}&limit=1000`)
      return Array.isArray(res.data?.points) ? res.data.points : []
    },
    enabled: !!childId,
    staleTime: 60_000,
  })
}

/** Где дети (V_Map_A + V_Map_B): карта с метками, безопасные места, лента приходов и уходов. */
export default function ParentMap() {
  const { t } = useTranslation()
  const { kids } = useKids()
  const { data: rows = [], isFetching, refetch } = useFamilyLocations()
  const { data: places = [] } = useQuery<Place[]>({ queryKey: ['safe-places'], queryFn: async () => { const r = await api.get('/locations/places'); return Array.isArray(r.data) ? r.data : [] } })
  const refresh = useRequestLocationRefresh()
  // Родителя в списке не показываем: страница про детей.
  const kidRows = rows.filter((r) => r.role !== 'PARENT')
  const rowOf = (k: Kid) => kidRows.find((r) => r.userId === k.userId || r.childId === k.profileId)
  const located = kids.filter((k) => hasCoordinates(rowOf(k)?.location))
  const [selected, setSelected] = useState<string | null>(null)
  const sel = kids.find((k) => k.userId === selected) || located[0] || kids[0]
  const selRow = sel ? rowOf(sel) : undefined
  const [day, setDay] = useState(0)
  const [track, setTrack] = useState(false)
  const [focus, setFocus] = useState<{ lat: number; lng: number; n: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const [editing, setEditing] = useState<Partial<Place> | null>(null)
  const [connect, setConnect] = useState<Kid | null>(null)
  const { data: points = [] } = useDayHistory(selRow?.childId ?? null, day)
  const events = useMemo(() => placeEvents(points, places.filter((p) => !p.kids?.length || (sel && p.kids.includes(sel.userId)))), [points, places, sel])

  const placeNow = (k: Kid) => placeOf(rowOf(k)?.location, places.filter((p) => !p.kids?.length || p.kids.includes(k.userId)))
  const statusOf = (k: Kid) => {
    const loc = rowOf(k)?.location
    if (!hasCoordinates(loc)) return 'нет данных'
    const p = placeNow(k)
    return p ? `${p.name.toLowerCase() === 'дом' ? 'дома' : `в месте «${p.name}»`}` : loc.isMoving ? 'в пути' : 'вне безопасных мест'
  }
  const freshest = kidRows.map((r) => r.location?.ageSec).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b)[0]
  const mapPoints = located.map((k) => [rowOf(k)!.location!.lat, rowOf(k)!.location!.lng] as [number, number])
  const focusKid = (k: Kid) => {
    setSelected(k.userId)
    setTrack(false)
    const loc = rowOf(k)?.location
    if (hasCoordinates(loc)) setFocus({ lat: loc.lat, lng: loc.lng, n: Date.now() })
  }

  return (
    <Layout>
      <PageHeader
        kicker={located.length ? `${located.map((k) => `${k.name} · ${statusOf(k)}`).join(', ')}${freshest !== undefined ? ` · обновлено ${formatAgo(freshest, t)}` : ''}` : 'Пока ни один телефон не передавал место'}
        title="Где дети"
      >
        <Button variant="outlined" startIcon={<Icon name="plus" size={18} />} onClick={() => setPicking(true)}>Новое место</Button>
        <Button variant="contained" disabled={isFetching} startIcon={<Icon name="clock" size={18} />} onClick={() => refetch()}>Обновить</Button>
      </PageHeader>

      <Box sx={{ display: 'flex', gap: 1.25, flexWrap: 'wrap' }}>
        {kids.map((k) => {
          const row = rowOf(k)
          const on = sel?.userId === k.userId
          const has = hasCoordinates(row?.location)
          return (
            <Box key={k.userId} component="button" type="button" aria-pressed={on} onClick={() => (has ? focusKid(k) : setSelected(k.userId))}
              sx={{ display: 'flex', alignItems: 'center', gap: 1.25, p: '8px 16px 8px 8px', borderRadius: '18px', border: on ? `2px solid ${kidColor(k.index).strong}` : `1px solid ${tokens.line}`, bgcolor: on ? kidColor(k.index).bg : tokens.paper, font: 'inherit', textAlign: 'left', cursor: 'pointer' }}>
              <KidDot name={k.name} index={k.index} pet={k.pet} size={44} />
              <Box>
                <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{k.name}</Typography>
                <Typography sx={{ fontSize: 13, color: has ? tokens.text2 : tokens.text3 }}>
                  {statusOf(k)}{row?.location?.battery != null ? ` · ${Math.round(row.location.battery * (row.location.battery <= 1 ? 100 : 1))} %` : ''}
                </Typography>
              </Box>
            </Box>
          )
        })}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 360px' }, gap: 2, alignItems: 'start' }}>
        <Box sx={{ position: 'relative', height: { xs: 380, md: 'calc(100vh - 300px)' }, minHeight: 380, borderRadius: '18px', overflow: 'hidden', border: `1px solid ${tokens.line}`,
          '& .leaflet-container': { height: '100%', width: '100%', zIndex: 0, cursor: picking ? 'crosshair' : undefined }, '& .kid-pin': { background: 'none', border: 0 } }}>
          <MapContainer center={FALLBACK_CENTER} zoom={FALLBACK_ZOOM} scrollWheelZoom>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            <MapController points={mapPoints} focus={focus} onPick={picking ? (ll) => { setPicking(false); setEditing({ lat: ll.lat, lng: ll.lng, radius: 150, kids: [], kind: 'other' }) } : null} />
            {places.map((p) => (
              <Circle key={p.id} center={[p.lat, p.lng]} radius={p.radius} pathOptions={{ color: kindOf(p.kind).color, weight: 2, fillOpacity: 0.12 }} eventHandlers={{ click: () => setEditing(p) }}>
                <MapTooltip permanent direction="center" className="">{p.name}</MapTooltip>
              </Circle>
            ))}
            {track && points.length > 1 && <Polyline positions={points.filter(hasCoordinates).map((p) => [p.lat, p.lng] as [number, number])} pathOptions={{ color: kidColor(sel?.index ?? 0).strong, weight: 4, opacity: 0.8 }} />}
            {located.map((k) => {
              const row = rowOf(k)!
              return (
                <Fragment key={k.userId}>
                  {row.location!.accuracy > 60 && <Circle center={[row.location!.lat, row.location!.lng]} radius={row.location!.accuracy} pathOptions={{ color: kidColor(k.index).strong, weight: 1, fillOpacity: 0.06 }} />}
                  <Marker position={[row.location!.lat, row.location!.lng]} icon={kidIcon(k, row, sel?.userId === k.userId)} eventHandlers={{ click: () => focusKid(k) }} />
                </Fragment>
              )
            })}
          </MapContainer>
          {picking && (
            <Box sx={{ position: 'absolute', top: 12, left: 12, right: 12, zIndex: 500, p: '10px 14px', borderRadius: '14px', bgcolor: tokens.text, color: '#FFF', display: 'flex', alignItems: 'center', gap: 1.5 }}>
              <Typography sx={{ flex: 1, fontSize: 14, fontWeight: 600 }}>Нажмите на карту там, где находится место</Typography>
              {sel && hasCoordinates(selRow?.location) && <Button size="small" variant="contained" onClick={() => { setPicking(false); setEditing({ lat: selRow!.location!.lat, lng: selRow!.location!.lng, radius: 150, kids: [], kind: 'other' }) }}>Где сейчас {sel.name}</Button>}
              <Button size="small" sx={{ color: '#FFF' }} onClick={() => setPicking(false)}>Отмена</Button>
            </Box>
          )}
          {located.length === 0 && !picking && (
            <Box sx={{ position: 'absolute', inset: 0, zIndex: 400, bgcolor: 'rgba(243,245,250,.82)', display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
              <SetupSteps kid={sel} onConnect={sel ? () => setConnect(sel) : undefined} />
            </Box>
          )}
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sel && (hasCoordinates(selRow?.location) ? (
            <KidPanel kid={sel} row={selRow!} place={placeNow(sel)} events={events} day={day} setDay={setDay} track={track} setTrack={setTrack}
              onRefresh={() => refresh.mutate(selRow!.childId)} refreshing={refresh.isPending} ago={formatAgo(selRow!.location!.ageSec, t)} />
          ) : located.length > 0 ? (
            <Card sx={{ p: 2 }}><SetupSteps kid={sel} onConnect={() => setConnect(sel)} compact /></Card>
          ) : null)}

          <Card sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, mb: 1 }}>
              <Typography component="h2" sx={{ flex: 1, fontSize: 17, fontWeight: 700 }}>Безопасные места</Typography>
              <Typography sx={{ fontSize: 12, color: tokens.text3 }}>сообщим о приходе и уходе</Typography>
            </Box>
            {places.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3, py: 1 }}>Добавьте дом, школу и секцию — будем присылать уведомление, когда ребёнок пришёл или ушёл.</Typography>}
            {places.map((p) => {
              const k = kindOf(p.kind)
              const who = p.kids?.length ? kids.filter((x) => p.kids.includes(x.userId)).map((x) => x.name).join(', ') : 'все'
              return (
                <Box key={p.id} sx={{ display: 'flex', alignItems: 'center', gap: 1.25, py: 1, borderTop: `1px solid ${tokens.line}` }}>
                  <Box sx={{ flex: '0 0 36px', height: 36, borderRadius: '12px', bgcolor: `${k.color}1F`, color: k.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={k.icon} size={18} /></Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 15, fontWeight: 600 }}>{p.name}</Typography>
                    <Typography sx={{ fontSize: 12, color: tokens.text3 }}>{[p.note, `${p.radius} м`, who].filter(Boolean).join(' · ')}</Typography>
                  </Box>
                  <IconButton size="small" aria-label={`Изменить «${p.name}»`} onClick={() => setEditing(p)}><Icon name="edit" size={16} /></IconButton>
                </Box>
              )
            })}
            <Button fullWidth sx={{ mt: 1, border: `1px dashed ${tokens.lineStrong}`, color: tokens.text2 }} onClick={() => setPicking(true)}>+ Добавить место</Button>
          </Card>
        </Box>
      </Box>

      {editing && <PlaceDialog place={editing} kids={kids} onClose={() => setEditing(null)} />}
      {connect && <ConnectDialog kid={connect} onClose={() => setConnect(null)} />}
    </Layout>
  )
}

function KidPanel({ kid, row, place, events, day, setDay, track, setTrack, onRefresh, refreshing, ago }: {
  kid: Kid; row: FamilyLocationRow; place: Place | null; events: PlaceEvent[]; day: number; setDay: (d: number) => void
  track: boolean; setTrack: (v: boolean) => void; onRefresh: () => void; refreshing: boolean; ago: string
}) {
  const loc = row.location!
  const c = kidColor(kid.index)
  const since = day === 0 && place ? [...events].reverse().find((e) => e.dir === 'in' && e.place.id === place.id) : undefined
  const battery = loc.battery != null ? Math.round(loc.battery <= 1 ? loc.battery * 100 : loc.battery) : null
  const warn = loc.permissionState && loc.permissionState !== 'always' ? 'Доступ к месту только при открытом приложении — включите «Разрешить всегда»' : !loc.servicesEnabled ? 'На телефоне выключена геолокация' : loc.mocked ? 'Координаты подменены приложением-эмулятором' : null
  return (
    <Card sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, borderRadius: '16px', bgcolor: c.bg }}>
        <KidDot name={kid.name} index={kid.index} pet={kid.pet} size={52} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 18, fontWeight: 700 }}>{place ? `${kid.name} · ${place.name}` : `${kid.name} · ${loc.isMoving ? 'в пути' : 'вне мест'}`}</Typography>
          <Typography sx={{ fontSize: 13, color: tokens.text2 }}>{since ? `с ${time(since.at)}` : `точность ~${Math.round(loc.accuracy)} м`}</Typography>
        </Box>
      </Box>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {battery !== null && <Pill icon="phone" danger={battery < 20}>{battery} %{loc.isCharging ? ' · заряжается' : ''}</Pill>}
        <Pill icon="clock" danger={loc.isStale}>{ago}</Pill>
      </Box>
      {warn && <Typography sx={{ fontSize: 13, color: tokens.danger, bgcolor: tokens.dangerSoft, p: 1, borderRadius: '10px' }}>{warn}</Typography>}
      <Box sx={{ display: 'flex', gap: 1 }}>
        <Button variant="outlined" fullWidth disabled={refreshing} onClick={onRefresh}>Уточнить сейчас</Button>
        <Button variant={track ? 'contained' : 'outlined'} fullWidth onClick={() => setTrack(!track)}>Маршрут</Button>
      </Box>

      <Box role="tablist" sx={{ display: 'inline-flex', alignSelf: 'flex-start', p: 0.5, borderRadius: '12px', bgcolor: tokens.chip }}>
        {['Сегодня', 'Вчера'].map((l, i) => (
          <Box key={l} component="button" type="button" role="tab" aria-selected={day === i} onClick={() => setDay(i)}
            sx={{ height: 32, px: 1.5, border: 0, borderRadius: '9px', bgcolor: day === i ? tokens.paper : 'transparent', font: 'inherit', fontSize: 13, fontWeight: 600, color: tokens.text, cursor: 'pointer' }}>{l}</Box>
        ))}
      </Box>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none' }}>
        {events.length === 0 && <Typography sx={{ fontSize: 14, color: tokens.text3 }}>{day === 0 ? 'Сегодня приходов и уходов не было' : 'Вчера приходов и уходов не было'}{' '}— или места ещё не добавлены.</Typography>}
        {[...events].reverse().map((e, i) => {
          const k = kindOf(e.place.kind)
          return (
            <Box component="li" key={i} sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start', py: 0.75 }}>
              <Box sx={{ mt: 0.5, width: 12, height: 12, borderRadius: '50%', bgcolor: e.dir === 'in' ? k.color : tokens.muted, flexShrink: 0 }} />
              <Typography sx={{ flex: 1, fontSize: 14 }}>{e.first ? `${e.place.name}: с начала дня` : e.dir === 'in' ? `Приход: ${e.place.name}` : `Уход: ${e.place.name}`}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.text3, fontVariantNumeric: 'tabular-nums' }}>{time(e.at)}</Typography>
            </Box>
          )
        })}
      </Box>
    </Card>
  )
}

function Pill({ icon, danger, children }: { icon: IconName; danger?: boolean; children: React.ReactNode }) {
  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, height: 28, px: 1.25, borderRadius: '14px', bgcolor: danger ? tokens.dangerSoft : tokens.chip, color: danger ? tokens.danger : tokens.text2, fontSize: 13, fontWeight: 600 }}>
      <Icon name={icon} size={14} />{children}
    </Box>
  )
}

/** Честный пустой экран: что сделать на телефоне ребёнка, чтобы появилось место. */
function SetupSteps({ kid, onConnect, compact }: { kid?: Kid; onConnect?: () => void; compact?: boolean }) {
  const steps = [
    ['Откройте приложение на телефоне ребёнка', 'Если его ещё нет — подключите телефон по QR-коду'],
    ['Я → Где я → «Разрешить всегда»', 'Без этого место видно, только пока приложение открыто'],
    ['Отключите экономию батареи для приложения', 'Иначе Android усыпит его через пару часов'],
  ]
  return (
    <Box sx={{ maxWidth: 440, width: '100%', bgcolor: compact ? 'transparent' : tokens.paper, borderRadius: '20px', p: compact ? 0 : 3, boxShadow: compact ? 'none' : '0 8px 30px rgba(21,24,39,.12)', display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: '14px', bgcolor: tokens.primarySoft, color: tokens.primary, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="map" size={24} /></Box>
        <Typography sx={{ fontSize: 17, fontWeight: 700 }}>{kid ? `Телефон: ${kid.name} — место ещё не приходило` : 'Место ещё не приходило'}</Typography>
      </Box>
      <Box component="ol" sx={{ m: 0, p: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
        {steps.map(([title, sub], i) => (
          <Box component="li" key={title} sx={{ display: 'flex', gap: 1.25 }}>
            <Box sx={{ flex: '0 0 26px', height: 26, borderRadius: '50%', bgcolor: tokens.primary, color: '#FFF', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</Box>
            <Box>
              <Typography sx={{ fontSize: 14, fontWeight: 600 }}>{title}</Typography>
              <Typography sx={{ fontSize: 13, color: tokens.text3 }}>{sub}</Typography>
            </Box>
          </Box>
        ))}
      </Box>
      {onConnect && <Button variant="contained" startIcon={<Icon name="qr" size={18} />} onClick={onConnect} sx={{ alignSelf: 'flex-start' }}>Подключить телефон</Button>}
    </Box>
  )
}

function PlaceDialog({ place, kids, onClose }: { place: Partial<Place>; kids: Kid[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [p, setP] = useState<Partial<Place>>({ radius: 150, kids: [], kind: 'other', note: '', ...place })
  const [error, setError] = useState('')
  const set = (patch: Partial<Place>) => setP((x) => ({ ...x, ...patch }))
  const body = () => ({ name: (p.name || '').trim(), lat: p.lat, lng: p.lng, radius: p.radius, kids: p.kids, note: p.note || '', kind: p.kind })
  const done = () => { qc.invalidateQueries({ queryKey: ['safe-places'] }); onClose() }
  const save = useMutation({
    mutationFn: () => (p.id ? api.patch(`/locations/places/${p.id}`, body()) : api.post('/locations/places', body())),
    onSuccess: done,
    onError: (e: any) => setError(e?.response?.data?.message?.toString() || 'Не получилось сохранить'),
  })
  const remove = useMutation({ mutationFn: () => api.delete(`/locations/places/${p.id}`), onSuccess: done })
  const toggleKid = (k: Kid) => {
    const cur = p.kids?.length ? p.kids : kids.map((x) => x.userId)
    const next = cur.includes(k.userId) ? cur.filter((id) => id !== k.userId) : [...cur, k.userId]
    set({ kids: next.length === kids.length ? [] : next })
  }
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogContent sx={{ p: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <Typography component="h2" sx={{ fontSize: 22, fontWeight: 700 }}>{p.id ? p.name : 'Новое место'}</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {KINDS.map((k) => (
            <Box key={k.id} component="button" type="button" aria-pressed={p.kind === k.id} onClick={() => set({ kind: k.id, name: p.name || (k.id === 'other' ? '' : k.label) })}
              sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 36, px: 1.5, borderRadius: '18px', border: `1px solid ${p.kind === k.id ? k.color : tokens.lineStrong}`, bgcolor: p.kind === k.id ? `${k.color}1F` : tokens.paper, color: tokens.text, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name={k.icon} size={16} />{k.label}
            </Box>
          ))}
        </Box>
        <TextField label="Название" value={p.name || ''} onChange={(e) => set({ name: e.target.value })} inputProps={{ maxLength: 40 }} placeholder="Школа № 57" autoFocus />
        <TextField label="Подпись" value={p.note || ''} onChange={(e) => set({ note: e.target.value })} inputProps={{ maxLength: 60 }} placeholder="8:00–15:00 по будням" />
        <Box>
          <Typography sx={{ ...labelCaps, mb: 0.5 }}>Радиус · {p.radius} м</Typography>
          <Slider value={p.radius} min={50} max={500} step={25} onChange={(_, v) => set({ radius: v as number })} aria-label="Радиус места" />
        </Box>
        {kids.length > 1 && (
          <Box>
            <Typography sx={{ ...labelCaps, mb: 1 }}>Для кого</Typography>
            <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
              {kids.map((k) => {
                const on = !p.kids?.length || p.kids.includes(k.userId)
                return (
                  <Box key={k.userId} component="button" type="button" aria-pressed={on} onClick={() => toggleKid(k)}
                    sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.75, height: 38, pl: 0.5, pr: 1.5, borderRadius: '19px', border: on ? `2px solid ${kidColor(k.index).strong}` : `1px solid ${tokens.lineStrong}`, bgcolor: on ? kidColor(k.index).bg : tokens.paper, font: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                    <KidDot name={k.name} index={k.index} pet={k.pet} size={28} />{k.name}
                  </Box>
                )
              })}
            </Box>
          </Box>
        )}
        {error && <Typography role="alert" sx={{ color: tokens.danger, fontSize: 14 }}>{error}</Typography>}
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
          {p.id && <Button color="error" disabled={remove.isPending} onClick={() => window.confirm(`Удалить место «${p.name}»?`) && remove.mutate()}>Удалить</Button>}
          <Box sx={{ flex: 1 }} />
          <Button onClick={onClose}>Отмена</Button>
          <Button variant="contained" disabled={!p.name?.trim() || save.isPending} onClick={() => save.mutate()}>Сохранить</Button>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
