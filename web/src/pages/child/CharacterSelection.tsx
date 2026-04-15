import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Typography,
  Card,
  CardContent,
  Box,
  Grid,
  CircularProgress,
  Chip,
  Button,
} from '@mui/material'
import { motion } from 'framer-motion'
import { useAuthStore } from '../../store/authStore'
import { api } from '../../lib/api'
import AnimatedCard from '../../components/AnimatedCard'
import { colors } from '../../theme'
import { useCharacters } from '../../hooks/useCharacters'
import { getCharacterImageUrl, getCharacterState } from '../../utils/satiety'
import type { Character } from '../../types/api'

export default function CharacterSelection() {
  const user = useAuthStore((state) => state.user)
  const queryClient = useQueryClient()
  const { data: characters, isLoading } = useCharacters()
  const { data: summary } = useQuery({
    queryKey: ['child-summary', user?.id],
    queryFn: async () => {
      const response = await api.get('/children/child/summary')
      return response.data
    },
    enabled: !!user?.id,
  })

  const selectedCharacterId = summary?.character?.id || summary?.profile?.selectedCharacterId

  const selectCharacterMutation = useMutation({
    mutationFn: async (characterId: string) => {
      const response = await api.patch('/children/child/profile', { selectedCharacterId: characterId })
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['child-summary'] })
      queryClient.invalidateQueries({ queryKey: ['child-profile'] })
    },
  })

  const handleSelectCharacter = (characterId: string) => {
    selectCharacterMutation.mutate(characterId)
  }

  if (isLoading) {
    return (
      <Grid item xs={12}>
        <Box display="flex" justifyContent="center" p={3}>
          <CircularProgress />
        </Box>
      </Grid>
    )
  }

  return (
    <Grid item xs={12}>
      <AnimatedCard delay={0.12}>
        <Card
          sx={{
            background: 'linear-gradient(135deg, #FFFFFF 0%, #F5F5F7 100%)',
            border: `2px solid ${colors.background.light}`,
          }}
        >
          <CardContent>
            <Typography variant="h6" gutterBottom sx={{ fontWeight: 700, mb: 2 }}>
              🎭 Выбери своего персонажа
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Нажми на персонажа, чтобы выбрать его. После выбора персонаж будет меняться в зависимости от твоей сытости (0, 1-99, 100+ баллов)!
            </Typography>

            <Grid container spacing={2}>
              {characters?.slice(0, 3).map((character: Character) => {
                const isSelected = selectedCharacterId === character.id
                const pointsBalance = summary?.pointsBalance || 0
                
                // Если персонаж выбран, показываем изображение в зависимости от сытости
                // Если не выбран, показываем первое доступное изображение для предпросмотра
                let previewImage: string | null = null
                
                if (isSelected) {
                  // Показываем изображение в зависимости от текущей сытости используя утилиту
                  previewImage = getCharacterImageUrl(character, pointsBalance)
                } else {
                  // Для невыбранных персонажей показываем первое доступное изображение
                  previewImage = character.imageUrlZero || character.imageUrlLow || character.imageUrlHigh || null
                }

                return (
                  <Grid item xs={12} sm={4} key={character.id}>
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <Card
                        sx={{
                          cursor: isSelected ? 'default' : 'pointer',
                          border: isSelected ? `3px solid ${colors.primary.main}` : '2px solid #e0e0e0',
                          background: isSelected 
                            ? `linear-gradient(135deg, ${colors.primary.light}15 0%, ${colors.primary.main}15 100%)`
                            : 'white',
                          transition: 'all 0.3s ease',
                          '&:hover': {
                            border: `3px solid ${colors.primary.main}`,
                            boxShadow: isSelected ? 'none' : `0 8px 24px rgba(0, 122, 255, 0.2)`,
                          },
                        }}
                      >
                        <CardContent sx={{ textAlign: 'center', p: 2 }}>
                          {previewImage ? (
                            <Box
                              component="img"
                              src={previewImage}
                              alt={character.name}
                              sx={{
                                width: '100%',
                                height: '150px',
                                objectFit: 'contain',
                                mb: 1,
                                borderRadius: 1,
                              }}
                            />
                          ) : (
                            <Typography variant="h1" sx={{ mb: 1, fontSize: '4rem' }}>
                              🎭
                            </Typography>
                          )}
                          <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                            {character.name}
                          </Typography>
                          {isSelected ? (
                            <>
                              <Chip
                                label="Выбран"
                                size="small"
                                sx={{
                                  backgroundColor: colors.primary.main,
                                  color: 'white',
                                  fontWeight: 600,
                                  mb: 1,
                                }}
                              />
                                  <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                                    {(() => {
                                      const state = getCharacterState(pointsBalance)
                                      return state === 'zero' ? '0 баллов' : state === 'low' ? '1-99 баллов' : '100+ баллов'
                                    })()}
                                  </Typography>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="contained"
                                size="small"
                                onClick={() => handleSelectCharacter(character.id)}
                                disabled={selectCharacterMutation.isPending}
                                sx={{
                                  mt: 1,
                                  backgroundColor: colors.primary.main,
                                  '&:hover': { backgroundColor: colors.primary.dark },
                                }}
                              >
                                {selectCharacterMutation.isPending ? (
                                  <CircularProgress size={16} sx={{ color: 'white' }} />
                                ) : (
                                  'Выбрать'
                                )}
                              </Button>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  </Grid>
                )
              })}
            </Grid>
          </CardContent>
        </Card>
      </AnimatedCard>
    </Grid>
  )
}
