import { motion, AnimatePresence } from 'framer-motion'
import { Box, Typography } from '@mui/material'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import CardGiftcardIcon from '@mui/icons-material/CardGiftcard'
import { colors } from '../theme'

interface PurchaseAnimationProps {
  open: boolean
  rewardTitle: string
  onClose: () => void
}

export function PurchaseAnimation({ open, rewardTitle, onClose }: PurchaseAnimationProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
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
              background: 'rgba(0, 0, 0, 0.8)',
              backdropFilter: 'blur(10px)',
              zIndex: 9998,
            }}
          />

          {/* Animation Container */}
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
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={{
                type: 'spring',
                stiffness: 200,
                damping: 15,
              }}
            >
              {/* Confetti Effect */}
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{
                    x: 0,
                    y: 0,
                    rotate: 0,
                    opacity: 1,
                  }}
                  animate={{
                    x: (Math.random() - 0.5) * 400,
                    y: (Math.random() - 0.5) * 400,
                    rotate: Math.random() * 360,
                    opacity: 0,
                  }}
                  transition={{
                    duration: 1.5,
                    delay: Math.random() * 0.5,
                    ease: 'easeOut',
                  }}
                  style={{
                    position: 'absolute',
                    width: 12,
                    height: 12,
                    background: [
                      colors.success.main,
                      colors.warning.main,
                      colors.info.main,
                      colors.primary.main,
                    ][Math.floor(Math.random() * 4)],
                    borderRadius: '50%',
                    top: '50%',
                    left: '50%',
                  }}
                />
              ))}

              {/* Main Card */}
              <Box
                sx={{
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.9) 100%)',
                  backdropFilter: 'blur(30px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(30px) saturate(180%)',
                  borderRadius: '32px',
                  padding: '48px',
                  boxShadow: `0 20px 60px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.2) inset`,
                  border: `2px solid ${colors.success.main}50`,
                  textAlign: 'center',
                  minWidth: 320,
                }}
              >
                {/* Success Icon */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{
                    type: 'spring',
                    stiffness: 200,
                    damping: 15,
                    delay: 0.2,
                  }}
                >
                  <Box
                    sx={{
                      width: 120,
                      height: 120,
                      borderRadius: '50%',
                      background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 24px',
                      boxShadow: `0 8px 32px ${colors.success.main}40`,
                    }}
                  >
                    <CheckCircleIcon
                      sx={{
                        fontSize: 64,
                        color: 'white',
                      }}
                    />
                  </Box>
                </motion.div>

                {/* Title */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                >
                  <Typography
                    variant="h4"
                    sx={{
                      fontWeight: 900,
                      mb: 2,
                      background: `linear-gradient(135deg, ${colors.success.main} 0%, ${colors.success.dark} 100%)`,
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    Поздравляем! 🎉
                  </Typography>
                </motion.div>

                {/* Reward Icon */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: [0, 1.2, 1] }}
                  transition={{
                    delay: 0.6,
                    type: 'spring',
                    stiffness: 200,
                  }}
                >
                  <CardGiftcardIcon
                    sx={{
                      fontSize: 64,
                      color: colors.warning.main,
                      mb: 2,
                    }}
                  />
                </motion.div>

                {/* Reward Title */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.8 }}
                >
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 700,
                      color: colors.text.primary,
                      mb: 3,
                    }}
                  >
                    {rewardTitle}
                  </Typography>
                </motion.div>

                {/* Message */}
                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 1 }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      color: colors.text.secondary,
                      fontWeight: 500,
                    }}
                  >
                    Товар успешно приобретен!
                  </Typography>
                </motion.div>
              </Box>
            </motion.div>
          </Box>
        </>
      )}
    </AnimatePresence>
  )
}
