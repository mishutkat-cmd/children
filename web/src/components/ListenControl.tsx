import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Button, CircularProgress, Typography } from '@mui/material'
import MicIcon from '@mui/icons-material/Mic'
import PlayCircleIcon from '@mui/icons-material/PlayCircle'
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty'
import { API_BASE_URL } from '../lib/api'
import { useAudioRequest, useRequestAudio } from '../hooks/useAudio'

/**
 * «Послушать, что вокруг» для родителя на вебе.
 *
 * Родитель отправляет запрос, но запись начнётся только после того, как ребёнок
 * на своём телефоне нажмёт «Разрешить». Здесь — стадия ожидания и плеер готовой
 * записи. Веб сам микрофоном не управляет: запись всегда идёт с телефона ребёнка.
 */
export default function ListenControl({ childId, childName }: { childId: string; childName: string }) {
  const { t } = useTranslation()
  const requestAudio = useRequestAudio()
  const [requestId, setRequestId] = useState<string | null>(null)
  const { data: request } = useAudioRequest(requestId)
  const notifiedRef = useRef<string | null>(null)

  const audioUrl =
    request?.status === 'READY' && request.audioUrl ? `${API_BASE_URL}${request.audioUrl}` : null

  useEffect(() => {
    if (!request || notifiedRef.current === request.id) return
    if (request.status === 'DENIED' || request.status === 'EXPIRED') {
      notifiedRef.current = request.id
      setRequestId(null)
    }
  }, [request])

  const start = async () => {
    const created = await requestAudio.mutateAsync({ childId })
    notifiedRef.current = null
    setRequestId(created.id)
  }

  const waiting = !!requestId && (request?.status === 'PENDING' || requestAudio.isPending)

  if (request?.status === 'READY' && audioUrl) {
    return (
      <Box sx={{ mt: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
          <PlayCircleIcon fontSize="small" color="primary" />
          <Typography variant="body2" color="text.secondary">
            {t('parent.audio.recordingFrom', { name: childName })}
          </Typography>
        </Box>
        {/* Ссылка приватная и подписанная сервером; браузер играет её сам. */}
        <audio controls src={audioUrl} style={{ width: '100%', height: 36 }} />
      </Box>
    )
  }

  if (waiting) {
    return (
      <Button size="small" disabled startIcon={<HourglassEmptyIcon />} sx={{ mt: 1 }}>
        {t('parent.audio.waiting')}
      </Button>
    )
  }

  return (
    <Button
      size="small"
      startIcon={requestAudio.isPending ? <CircularProgress size={14} /> : <MicIcon />}
      onClick={start}
      disabled={requestAudio.isPending}
      sx={{ mt: 1 }}
    >
      {t('parent.audio.listen')}
    </Button>
  )
}
