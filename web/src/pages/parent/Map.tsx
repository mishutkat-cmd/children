import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Alert,
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material'
import RefreshIcon from '@mui/icons-material/Refresh'
import MyLocationIcon from '@mui/icons-material/MyLocation'
import TimelineIcon from '@mui/icons-material/Timeline'
import BatteryChargingFullIcon from '@mui/icons-material/BatteryChargingFull'
import Battery50Icon from '@mui/icons-material/Battery50'
import WarningAmberIcon from '@mui/icons-material/WarningAmber'
import { MapContainer, TileLayer, Marker, Circle, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Layout from '../../components/Layout'
import { colors } from '../../theme'
import {
  useChildLocationHistory,
  useChildrenLocations,
  useRequestLocationRefresh,
} from '../../hooks/useChildrenLocations'
import { formatAccuracy, formatAgo } from '../../utils/locationFormat'
import type { ChildLocationRow } from '../../types/api'

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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      default: return '&#39;'
    }
  })

/**
 * Маркер строим через divIcon, а не через стандартный L.Icon: во-первых, так
 * не надо чинить пути к картинкам Leaflet под сборщиком, во-вторых, внутрь
 * можно положить аватар ребёнка.
 */
const buildChildIcon = (row: ChildLocationRow, selected: boolean): L.DivIcon => {
  const stale = row.location?.isStale !== false
  const border = selected ? colors.primary.dark : '#FFFFFF'
  const background = stale ? '#86868B' : colors.primary.main
  const initial = escapeHtml((row.name || row.login || '?').trim().charAt(0).toUpperCase())

  const inner = row.avatarUrl
    ? `<img src="${escapeHtml(row.avatarUrl)}" alt="" style="width:100%;height:100%;object-fit:cover" />`
    : `<span style="color:#fff;font:700 16px/1 system-ui,sans-serif">${initial}</span>`

  return L.divIcon({
    className: 'child-marker',
    html: `
      <div style="
        width:40px;height:40px;border-radius:50%;
        background:${background};border:3px solid ${border};
        box-shadow:0 2px 8px rgba(0,0,0,.25);
        display:flex;align-items:center;justify-content:center;
        overflow:hidden;opacity:${stale ? 0.75 : 1};
      ">${inner}</div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  })
}

/**
 * Кадрирование живёт отдельным компонентом: доступ к экземпляру карты есть
 * только у потомков MapContainer.
 */
function MapController({
  rows,
  focus,
}: {
  rows: ChildLocationRow[]
  focus: { childId: string; lat: number; lng: number } | null
}) {
  const map = useMap()
  const hasFitted = useRef(false)

  // Первый показ — вписываем всех детей в кадр. Дальше камеру не трогаем:
  // автообновление раз в 20 секунд иначе выдёргивало бы родителя из зума.
  useEffect(() => {
    if (hasFitted.current || rows.length === 0) return
    hasFitted.current = true

    const points = rows
      .filter((r) => r.location)
      .map((r) => [r.location!.lat, r.location!.lng] as [number, number])
    if (points.length === 0) return

    if (points.length === 1) {
      map.setView(points[0], 15)
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [60, 60] })
    }
  }, [rows, map])

  useEffect(() => {
    if (focus) map.flyTo([focus.lat, focus.lng], 16, { duration: 0.6 })
  }, [focus, map])

  return null
}

export default function ParentMap() {
  const { t } = useTranslation()
  const { data: rows = [], isLoading, isFetching, refetch, error } = useChildrenLocations()
  const requestRefresh = useRequestLocationRefresh()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showTrack, setShowTrack] = useState(false)
  const [focus, setFocus] = useState<{ childId: string; lat: number; lng: number } | null>(null)

  const located = useMemo(() => rows.filter((r) => r.location), [rows])
  const { data: history } = useChildLocationHistory(selectedId, showTrack && !!selectedId)

  const trackPositions = useMemo(() => {
    if (!showTrack || !history?.points?.length) return []
    return history.points.map((p) => [p.lat, p.lng] as [number, number])
  }, [showTrack, history])

  const focusChild = (row: ChildLocationRow) => {
    setSelectedId(row.childId)
    setShowTrack(false)
    if (row.location) {
      // Новый объект каждый раз — иначе повторный клик по тому же ребёнку
      // не перезапустит эффект и карта не вернётся к нему.
      setFocus({ childId: row.childId, lat: row.location.lat, lng: row.location.lng })
    }
  }

  return (
    <Layout>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          {t('parent.map.title')}
        </Typography>
        <Tooltip title={t('parent.map.refresh')}>
          <span>
            <IconButton onClick={() => refetch()} disabled={isFetching} color="primary">
              {isFetching ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </span>
        </Tooltip>
      </Box>

      {error ? <Alert severity="error" sx={{ mb: 2 }}>{t('parent.map.loadError')}</Alert> : null}

      {!isLoading && rows.length > 0 && located.length === 0 ? (
        <Alert severity="info" sx={{ mb: 2 }}>{t('parent.map.nobodyReported')}</Alert>
      ) : null}

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2 }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            height: { xs: 360, md: 'calc(100vh - 260px)' },
            minHeight: 360,
            borderRadius: 2,
            overflow: 'hidden',
            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
            // Leaflet рисует свои панели поверх; держим их под MUI-модалками.
            '& .leaflet-container': { height: '100%', width: '100%', zIndex: 0 },
          }}
        >
          <MapContainer center={FALLBACK_CENTER} zoom={FALLBACK_ZOOM} scrollWheelZoom>
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
            <MapController rows={rows} focus={focus} />

            {located.map((row) => {
              const point = row.location!
              return (
                // Fragment, а не div: MapContainer рендерит потомков внутрь
                // своего DOM-контейнера, и лишняя обёртка попала бы на карту.
                <Fragment key={row.childId}>
                  <Circle
                    center={[point.lat, point.lng]}
                    radius={Math.max(point.accuracy, 25)}
                    pathOptions={{
                      color: point.isStale ? '#86868B' : colors.primary.main,
                      fillOpacity: 0.12,
                      weight: 1,
                    }}
                  />
                  <Marker
                    position={[point.lat, point.lng]}
                    icon={buildChildIcon(row, row.childId === selectedId)}
                    eventHandlers={{ click: () => focusChild(row) }}
                  />
                </Fragment>
              )
            })}

            {trackPositions.length > 1 ? (
              <Polyline positions={trackPositions} pathOptions={{ color: colors.primary.main, weight: 4 }} />
            ) : null}
          </MapContainer>
        </Box>

        <Box sx={{ width: { xs: '100%', md: 320 }, flexShrink: 0 }}>
          {isLoading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}>
              <CircularProgress />
            </Box>
          ) : rows.length === 0 ? (
            <Alert severity="info">{t('parent.map.noChildren')}</Alert>
          ) : (
            <Stack spacing={1.5}>
              {rows.map((row) => (
                <ChildLocationCard
                  key={row.childId}
                  row={row}
                  selected={row.childId === selectedId}
                  trackVisible={row.childId === selectedId && showTrack}
                  refreshing={requestRefresh.isPending && requestRefresh.variables === row.childId}
                  onSelect={() => focusChild(row)}
                  onToggleTrack={() => {
                    setSelectedId(row.childId)
                    setShowTrack((prev) => (row.childId === selectedId ? !prev : true))
                  }}
                  onRequestRefresh={() => requestRefresh.mutate(row.childId)}
                />
              ))}
            </Stack>
          )}
        </Box>
      </Box>
    </Layout>
  )
}

interface CardProps {
  row: ChildLocationRow
  selected: boolean
  trackVisible: boolean
  refreshing: boolean
  onSelect: () => void
  onToggleTrack: () => void
  onRequestRefresh: () => void
}

function ChildLocationCard({
  row,
  selected,
  trackVisible,
  refreshing,
  onSelect,
  onToggleTrack,
  onRequestRefresh,
}: CardProps) {
  const { t } = useTranslation()
  const point = row.location

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: selected ? colors.primary.main : undefined,
        borderWidth: selected ? 2 : 1,
      }}
    >
      <CardActionArea onClick={onSelect} disabled={!point}>
        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }} noWrap>
              {row.name}
            </Typography>
            {point?.battery !== null && point?.battery !== undefined ? (
              <Chip
                size="small"
                variant="outlined"
                color={point.battery < 0.15 ? 'error' : 'default'}
                icon={point.isCharging ? <BatteryChargingFullIcon /> : <Battery50Icon />}
                label={`${Math.round(point.battery * 100)}%`}
              />
            ) : null}
          </Box>

          {!row.trackingEnabled ? (
            <Typography variant="body2" color="warning.main" sx={{ mt: 0.5 }}>
              {t('parent.map.trackingDisabled')}
            </Typography>
          ) : !point ? (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('parent.map.neverReported')}
            </Typography>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{ mt: 0.5 }}
                color={point.isStale ? 'text.secondary' : 'text.primary'}
              >
                {formatAgo(point.ageSec, t)} · {formatAccuracy(point.accuracy, t)}
              </Typography>
              {point.permissionState === 'denied' || !point.servicesEnabled ? (
                <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <WarningAmberIcon fontSize="inherit" /> {t('parent.map.permissionOff')}
                </Typography>
              ) : null}
              {point.mocked ? (
                <Typography variant="caption" color="warning.main" sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                  <WarningAmberIcon fontSize="inherit" /> {t('parent.map.mocked')}
                </Typography>
              ) : null}
            </>
          )}
        </CardContent>
      </CardActionArea>

      <Box sx={{ display: 'flex', gap: 1, px: 2, pb: 1.5 }}>
        <Button
          size="small"
          startIcon={refreshing ? <CircularProgress size={14} /> : <MyLocationIcon />}
          onClick={onRequestRefresh}
          disabled={!row.trackingEnabled || refreshing}
        >
          {t('parent.map.updateNow')}
        </Button>
        <Button size="small" startIcon={<TimelineIcon />} onClick={onToggleTrack} disabled={!point}>
          {trackVisible ? t('parent.map.hideTrack') : t('parent.map.showTrack')}
        </Button>
      </Box>
    </Card>
  )
}
