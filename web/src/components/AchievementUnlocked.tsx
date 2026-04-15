import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { motion, AnimatePresence } from 'framer-motion'
import { Box, Typography } from '@mui/material'
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'
import { colors } from '../theme'

export type AchievementType = 'badge' | 'challenge'

export interface AchievementUnlockedProps {
  open: boolean
  onClose: () => void
  type: AchievementType
  title: string
  /** Иконка-эмодзи (например 🏆) или imageUrl для бейджа */
  icon?: string
  imageUrl?: string
  /** Баллы за челлендж */
  points?: number
  duration?: number
}

const STORAGE_KEY_BADGES = 'achievements-badges-celebrated'
const STORAGE_KEY_CHALLENGES = 'achievements-challenges-celebrated'

export function getCelebratedBadgeIds(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_BADGES)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function markBadgeCelebrated(id: string): void {
  const ids = getCelebratedBadgeIds()
  if (!ids.includes(id)) {
    sessionStorage.setItem(STORAGE_KEY_BADGES, JSON.stringify([...ids, id]))
  }
}

export function getCelebratedChallengeIds(): string[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_CHALLENGES)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function markChallengeCelebrated(id: string): void {
  const ids = getCelebratedChallengeIds()
  if (!ids.includes(id)) {
    sessionStorage.setItem(STORAGE_KEY_CHALLENGES, JSON.stringify([...ids, id]))
  }
}

export function AchievementUnlocked({
  open,
  onClose,
  type,
  title,
  icon = '🏆',
  imageUrl,
  points,
  duration = 3500,
}: AchievementUnlockedProps) {
  const { t } = useTranslation()
  const headline = type === 'badge' ? t('achievement.badgeUnlocked') : t('achievement.challengeCompleted')

  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, duration)
    return () => clearTimeout(t)
  }, [open, duration, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0, 0, 0, 0.75)',
              backdropFilter: 'blur(12px)',
              zIndex: 9998,
            }}
          />

          <Box
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ scale: 0, opacity: 0, rotate: -10 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 20,
              }}
            >
              {/* Конфетти */}
              {[...Array(24)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    x: 0,
                    y: 0,
                    rotate: 0,
                    opacity: 1,
                  }}
                  animate={{
                    x: (Math.random() - 0.5) * 500,
                    y: (Math.random() - 0.5) * 500,
                    rotate: Math.random() * 360,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 1.8,
                    delay: Math.random() * 0.4,
                    ease: 'easeOut',
                  }}
                  style={{
                    position: 'absolute',
                    width: 10 + Math.random() * 8,
                    height: 10 + Math.random() * 8,
                    background: [
                      colors.success.main,
                      colors.warning.main,
                      colors.primary.main,
                      '#FFD700',
                      colors.secondary.main,
                    ][Math.floor(Math.random() * 5)],
                    borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                    top: '50%',
                    left: '50%',
                  }}
                />
              ))}

              <Box
                sx={{
                  background:
                    type === 'badge'
                      ? 'linear-gradient(135deg, #667EEA 0%, #764BA2 100%)'
                      : 'linear-gradient(135deg, #11998e 0%, #38ef7d 100%)',
                  borderRadius: '28px',
                  padding: { xs: 3, sm: 4 },
                  boxShadow: '0 24px 64px rgba(0,0,0,0.35)',
                  textAlign: 'center',
                  minWidth: 280,
                  maxWidth: 360,
                  border: '3px solid rgba(255,255,255,0.25)',
                  position: 'relative',
                  overflow: 'hidden',
                }}
              >
                {/* Блик сверху */}
                <Box
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: '40%',
                    background: 'linear-gradient(180deg, rgba(255,255,255,0.2) 0%, transparent 100%)',
                    pointerEvents: 'none',
                  }}
                />

                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 12,
                    delay: 0.1,
                  }}
                >
                  <Box
                    sx={{
                      width: 100,
                      height: 100,
                      borderRadius: '50%',
                      bgcolor: 'rgba(255,255,255,0.25)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 20px',
                      border: '3px solid rgba(255,255,255,0.4)',
                      overflow: 'hidden',
                    }}
                  >
                    {imageUrl ? (
                      <Box
                        component="img"
                        src={imageUrl}
                        alt=""
                        sx={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                      />
                    ) : (
                      <Typography
                        sx={{
                          fontSize: '3.5rem',
                          lineHeight: 1,
                          filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.2))',
                        }}
                      >
                        {type === 'challenge' ? '🎯' : icon}
                      </Typography>
                    )}
                  </Box>
                </motion.div>

                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.25 }}
                >
                  <Typography
                    variant="h5"
                    sx={{
                      color: 'white',
                      fontWeight: 900,
                      textShadow: '0 2px 12px rgba(0,0,0,0.3)',
                      mb: 0.5,
                    }}
                  >
                    {headline}
                  </Typography>
                </motion.div>

                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.35 }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      color: 'rgba(255,255,255,0.95)',
                      fontWeight: 700,
                      mb: points != null ? 2 : 0,
                    }}
                  >
                    {title}
                  </Typography>
                </motion.div>

                {points != null && points > 0 && (
                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.5, type: 'spring', stiffness: 200 }}
                  >
                    <Box
                      sx={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 1,
                        bgcolor: 'rgba(255,255,255,0.25)',
                        borderRadius: 2,
                        px: 2,
                        py: 1,
                        border: '1px solid rgba(255,255,255,0.35)',
                      }}
                    >
                      <EmojiEventsIcon sx={{ color: '#FFD700', fontSize: 28 }} />
                      <Typography
                        variant="h6"
                        sx={{
                          color: 'white',
                          fontWeight: 900,
                          textShadow: '0 1px 8px rgba(0,0,0,0.2)',
                        }}
                      >
                        +{points} {t('achievement.points')}
                      </Typography>
                    </Box>
                  </motion.div>
                )}
              </Box>
            </motion.div>
          </Box>
        </>
      )}
    </AnimatePresence>
  )
}

