import { useState } from 'react'
import { Box, Button, ButtonBase, CircularProgress, Dialog, DialogContent, TextField, Typography } from '@mui/material'
import { tokens } from '../../theme'
import { api } from '../../lib/api'
import { categoryStyle, Icon, IconTile, StarAmount } from '../ui'
import { speak, taskState, useCompleteTask } from '../../hooks/useChildData'

/**
 * Строка задания ребёнка. Галочка слева — «сделал»; нажатие на название
 * читает задание вслух. Сделанное ждёт проверки («на проверке») или уже засчитано.
 */
export function TaskRow({ task, onDone, disabled }: { task: any; onDone: (task: any) => void; disabled?: boolean }) {
  const state = taskState(task)
  const cat = categoryStyle(task.category)
  const done = state !== 'todo'
  return (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', gap: { xs: 1.25, md: 2 }, p: { xs: '12px', md: '16px 18px' }, bgcolor: tokens.paper,
        borderRadius: '22px', boxShadow: `0 2px 0 ${tokens.kidShadow}`, minWidth: 0,
      }}
    >
      <ButtonBase
        onClick={() => !done && !disabled && onDone(task)}
        disabled={done || disabled}
        aria-label={done ? `${task.title}: сделано` : `Отметить «${task.title}» сделанным`}
        sx={{
          flex: { xs: '0 0 48px', md: '0 0 52px' }, width: { xs: 48, md: 52 }, height: { xs: 48, md: 52 }, borderRadius: '16px',
          border: done ? 0 : `3px solid #C9CFDC`, bgcolor: done ? tokens.done : tokens.paper, color: '#FFFFFF',
          '&:hover': { borderColor: done ? undefined : tokens.primary },
        }}
      >
        {done && <Icon name="check" size={28} stroke={3.2} />}
      </ButtonBase>
      <ButtonBase
        onClick={() => speak(task.description ? `${task.title}. ${task.description}` : task.title)}
        sx={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', gap: { xs: 1.25, md: 2 }, borderRadius: '14px', textAlign: 'left', py: 0.5 }}
      >
        {/* Картинка задания помогает тем, кто ещё не читает: на телефоне она просто меньше. */}
        {[40, 48].map((size) => (
          <Box key={size} sx={{ display: size === 40 ? { xs: 'flex', sm: 'none' } : { xs: 'none', sm: 'flex' } }}>
            <IconTile bg={cat.bg} color={cat.color} size={size}>
              {task.icon ? <span aria-hidden>{task.icon}</span> : <Icon name="check" size={Math.round(size * 0.54)} />}
            </IconTile>
          </Box>
        ))}
        <Box component="b" sx={{ flex: 1, minWidth: 0, fontSize: { xs: 17, md: 19 }, color: done ? tokens.text3 : tokens.text, overflowWrap: 'break-word' }}>
          {task.title}
        </Box>
      </ButtonBase>
      {state === 'todo' && <StarAmount value={task.points} sign size={19} />}
      {state === 'review' && <Box component="span" sx={{ fontSize: { xs: 13, md: 15 }, fontWeight: 800, color: tokens.review, whiteSpace: 'nowrap' }}>на проверке</Box>}
      {state === 'done' && <StarAmount value={task.points} sign size={16} sx={{ color: tokens.done }} />}
    </Box>
  )
}

/** Выполнение: без доказательства — сразу; с доказательством — фото или пара слов. */
export function useTaskCompletion(date: Date) {
  const complete = useCompleteTask(date)
  const [proofTask, setProofTask] = useState<any>(null)
  const [error, setError] = useState('')

  const onDone = (task: any) => {
    setError('')
    if (task.requiresProof) setProofTask(task)
    else complete.mutate({ taskId: task.id }, { onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось отправить, попробуй ещё раз') })
  }

  const dialog = (
    <ProofDialog
      task={proofTask}
      busy={complete.isPending}
      onClose={() => setProofTask(null)}
      onSubmit={(v) =>
        complete.mutate(
          { taskId: proofTask.id, ...v },
          { onSuccess: () => setProofTask(null), onError: (e: any) => setError(e?.response?.data?.message || 'Не получилось отправить') },
        )
      }
    />
  )
  return { onDone, dialog, error, busy: complete.isPending }
}

function ProofDialog({ task, busy, onClose, onSubmit }: { task: any; busy: boolean; onClose: () => void; onSubmit: (v: { note?: string; proofUrl?: string }) => void }) {
  const [note, setNote] = useState('')
  const [proofUrl, setProofUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) return setErr('Нужна фотография')
    if (file.size > 5 * 1024 * 1024) return setErr('Фото больше 5 МБ')
    setErr('')
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post('/upload/proof', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setProofUrl(r.data.url)
    } catch (e: any) {
      setErr(e?.response?.data?.message || 'Фото не загрузилось')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={!!task} onClose={onClose} fullWidth maxWidth="xs" TransitionProps={{ onExited: () => { setNote(''); setProofUrl(''); setErr('') } }}>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, p: 3 }}>
        <Typography variant="h4" component="h2">{task?.title}</Typography>
        <Typography sx={{ color: tokens.text2 }}>Покажи, что сделано: сфотографируй или напиши пару слов.</Typography>
        <Button component="label" variant="outlined" size="large" disabled={uploading} startIcon={uploading ? <CircularProgress size={20} /> : <Icon name="camera" />}>
          {proofUrl ? 'Фото добавлено ✓' : 'Сфотографировать'}
          <input hidden type="file" accept="image/*" capture="environment" onChange={(e) => upload(e.target.files?.[0])} />
        </Button>
        <TextField value={note} onChange={(e) => setNote(e.target.value)} placeholder="Например: убрал всё в шкаф" multiline minRows={2} />
        {err && <Typography sx={{ color: tokens.danger, fontWeight: 800 }}>{err}</Typography>}
        <Button
          variant="contained" size="large" disabled={busy || uploading || (!note.trim() && !proofUrl)}
          onClick={() => onSubmit({ note: note.trim() || undefined, proofUrl: proofUrl || undefined })}
        >
          Отправить на проверку
        </Button>
        <Button onClick={onClose}>Отмена</Button>
      </DialogContent>
    </Dialog>
  )
}
