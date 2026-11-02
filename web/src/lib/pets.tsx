// Питомцы детей (V_Pets_A): 6 зверьков, окрасы, наряды, настроение и стадии роста.
// Рисунки — прямо из макета, картинки загружать не нужно.
import type { CSSProperties } from 'react'

export type PetKind = 'cat' | 'fox' | 'bunny' | 'panda' | 'dino' | 'owl'
export type PetTint = 'ginger' | 'grey' | 'white' | 'black' | 'pink' | 'blue'
export type PetOutfit = 'none' | 'scarf' | 'hat' | 'glasses' | 'crown'
export type PetMood = 'happy' | 'sleepy' | 'bored'
export type Pet = { kind: PetKind; name?: string | null; tint?: PetTint | null; outfit?: PetOutfit | null; kindChangedAt?: string | null }

export const PET_KINDS: { id: PetKind; label: string; hello: string }[] = [
  { id: 'cat', label: 'Котик', hello: 'Мур! Сделаем дела?' },
  { id: 'fox', label: 'Лисёнок', hello: 'Фыр! Начнём?' },
  { id: 'bunny', label: 'Зайка', hello: 'Прыг! Я готов!' },
  { id: 'panda', label: 'Панда', hello: 'Ням! Что сегодня делаем?' },
  { id: 'dino', label: 'Дино', hello: 'Р-р-р! Вперёд!' },
  { id: 'owl', label: 'Совёнок', hello: 'Ух! Посмотрим дела?' },
]
export const petLabel = (k?: string | null) => PET_KINDS.find((p) => p.id === k)?.label ?? 'Питомец'

export const PET_TINTS: { id: PetTint; label: string; color: string }[] = [
  { id: 'ginger', label: 'Рыжий', color: '#FFC48C' },
  { id: 'grey', label: 'Серый', color: '#D9D4CC' },
  { id: 'white', label: 'Белый', color: '#FFFFFF' },
  { id: 'black', label: 'Чёрный', color: '#4A4A5A' },
  { id: 'pink', label: 'Розовый', color: '#FFD8E4' },
  { id: 'blue', label: 'Голубой', color: '#CFE3FF' },
]

/** Наряды открываются, когда ребёнок всего заработал столько звёзд. Звёзды не списываются. Те же числа — в бэкенде (PET_OUTFIT_PRICE). */
export const PET_OUTFITS: { id: Exclude<PetOutfit, 'none'>; label: string; price: number }[] = [
  { id: 'scarf', label: 'Шарф', price: 0 },
  { id: 'hat', label: 'Шапочка', price: 300 },
  { id: 'glasses', label: 'Очки', price: 1500 },
  { id: 'crown', label: 'Корона', price: 3000 },
]

export const PET_MOODS: Record<PetMood, { label: string; bg: string; ink: string; hint: string }> = {
  happy: { label: 'Весёлый', bg: '#E2F5EA', ink: '#0B5A33', hint: 'дела сделаны' },
  sleepy: { label: 'Сонный', bg: '#E8EEFF', ink: '#1D3A99', hint: 'вечер, пора спать' },
  bored: { label: 'Скучает', bg: '#FFF3D6', ink: '#7A4E00', hint: 'день без дел' },
}

/** Настроение само меняется от того, как идут дела. */
export function petMood(doneToday: number, now = new Date(), sadWhenIdle = true): PetMood {
  const h = now.getHours()
  if (h >= 21 || h < 7) return 'sleepy'
  if (doneToday > 0) return 'happy'
  return sadWhenIdle && h >= 15 ? 'bored' : 'happy'
}

/** Стадии растут от одобренных дел за всё время. */
export const PET_STAGES = [
  { id: 'baby', label: 'Малыш', from: 0, scale: 0.6 },
  { id: 'teen', label: 'Подросток', from: 20, scale: 0.8 },
  { id: 'adult', label: 'Взрослый', from: 60, scale: 1 },
] as const

export function petGrowth(approved: number) {
  const i = PET_STAGES.reduce((acc, s, idx) => (approved >= s.from ? idx : acc), 0)
  const stage = PET_STAGES[i]
  const next = PET_STAGES[i + 1]
  return {
    stage,
    stageIndex: i,
    next,
    level: Math.floor(approved / 10) + 1,
    left: next ? next.from - approved : 0,
    progress: next ? (approved - stage.from) / (next.from - stage.from) : 1,
  }
}

const BODY: Record<PetKind, string> = { cat: '#FFC48C', fox: '#FF9F5A', bunny: '#F2E9FF', panda: '#FFFFFF', dino: '#9FE0A8', owl: '#C9A57E' }
const HEAD = 'M60 22 C96 22 108 50 108 78 C108 108 88 124 60 124 C32 124 12 108 12 78 C12 50 24 22 60 22 Z'
const INK = '#2B2F3F'

function Ears({ kind, body }: { kind: PetKind; body: string }) {
  switch (kind) {
    case 'cat':
      return <><path d="M22 40 L28 12 L46 30 Z" fill={body} /><path d="M98 40 L92 12 L74 30 Z" fill={body} /><path d="M28 34 L31 20 L40 30 Z" fill="#FFB8C4" /><path d="M92 34 L89 20 L80 30 Z" fill="#FFB8C4" /></>
    case 'fox':
      return <><path d="M20 44 L24 6 L50 28 Z" fill={body} /><path d="M100 44 L96 6 L70 28 Z" fill={body} /><path d="M27 34 L28 16 L42 28 Z" fill="#FFFFFF" /><path d="M93 34 L92 16 L78 28 Z" fill="#FFFFFF" /></>
    case 'bunny':
      return <><ellipse cx="42" cy="20" rx="10" ry="26" fill={body} /><ellipse cx="78" cy="20" rx="10" ry="26" fill={body} /><ellipse cx="42" cy="22" rx="5" ry="18" fill="#FFB8C4" /><ellipse cx="78" cy="22" rx="5" ry="18" fill="#FFB8C4" /></>
    case 'panda':
      return <><circle cx="30" cy="32" r="14" fill={INK} /><circle cx="90" cy="32" r="14" fill={INK} /></>
    case 'dino':
      return <path d="M50 22 L56 8 L62 22 Z M62 24 L70 12 L74 28 Z M40 26 L44 12 L52 24 Z" fill="#4FB565" />
    case 'owl':
      return <><path d="M26 40 L30 14 L48 32 Z" fill="#8C6640" /><path d="M94 40 L90 14 L72 32 Z" fill="#8C6640" /></>
  }
}

function Face({ kind, mood }: { kind: PetKind; mood: PetMood }) {
  const pupil = kind === 'panda' ? '#FFFFFF' : INK
  const eyes =
    mood === 'sleepy' ? (
      <><path d="M37 65 q7 6 14 0" stroke={pupil} strokeWidth="3.5" fill="none" strokeLinecap="round" /><path d="M69 65 q7 6 14 0" stroke={pupil} strokeWidth="3.5" fill="none" strokeLinecap="round" /></>
    ) : (
      <><circle cx="44" cy="64" r="8" fill={pupil} /><circle cx="76" cy="64" r="8" fill={pupil} />{kind !== 'panda' && <><circle cx="47" cy="61" r="3" fill="#FFFFFF" /><circle cx="79" cy="61" r="3" fill="#FFFFFF" /></>}</>
    )
  const mouth =
    kind === 'owl' ? <path d="M55 76 L65 76 L60 84 Z" fill="#F5A524" />
      : mood === 'bored' ? <path d="M53 86 h14" stroke={INK} strokeWidth="3.5" strokeLinecap="round" />
        : <path d="M52 82 q4 5 8 0 q4 5 8 0" stroke={INK} strokeWidth="3.5" fill="none" strokeLinecap="round" />
  return (
    <>
      {kind === 'panda' && <><ellipse cx="44" cy="66" rx="12" ry="14" fill={INK} transform="rotate(-20 44 66)" /><ellipse cx="76" cy="66" rx="12" ry="14" fill={INK} transform="rotate(20 76 66)" /></>}
      {kind === 'owl' && <><circle cx="44" cy="64" r="15" fill="#FFF4E2" /><circle cx="76" cy="64" r="15" fill="#FFF4E2" /></>}
      <ellipse cx="34" cy="84" rx="8" ry="5" fill="#FF8FA3" opacity="0.6" />
      <ellipse cx="86" cy="84" rx="8" ry="5" fill="#FF8FA3" opacity="0.6" />
      {eyes}
      {mouth}
    </>
  )
}

function Outfit({ outfit }: { outfit?: PetOutfit | null }) {
  switch (outfit) {
    case 'scarf':
      return <><path d="M28 100 Q60 116 92 100 L92 110 Q60 126 28 110 Z" fill="#E5484D" /><rect x="74" y="106" width="11" height="22" rx="4" fill="#E5484D" /></>
    case 'hat':
      return <g transform="translate(34 -10)"><path d="M6 30 Q26 -10 46 30 Z" fill="#6D3FD1" /><circle cx="26" cy="6" r="5" fill="#F5A524" /><rect x="2" y="28" width="48" height="8" rx="4" fill="#4E2BA6" /></g>
    case 'glasses':
      return <g transform="translate(25.3 37.3) scale(1.333)"><circle cx="14" cy="20" r="10" fill="none" stroke={INK} strokeWidth="3" /><circle cx="38" cy="20" r="10" fill="none" stroke={INK} strokeWidth="3" /><path d="M24 20 h4" stroke={INK} strokeWidth="3" /></g>
    case 'crown':
      return <g transform="translate(34 -12)"><path d="M6 34 L10 8 L20 22 L26 4 L32 22 L42 8 L46 34 Z" fill="#F5A524" stroke="#C47F0A" strokeWidth="2" strokeLinejoin="round" /></g>
    default:
      return null
  }
}

/** Рисунок питомца. Без питомца — котик по умолчанию. */
export function PetArt({ pet, size = 64, mood = 'happy', style }: { pet?: Partial<Pet> | null; size?: number; mood?: PetMood; style?: CSSProperties }) {
  const kind = (pet?.kind as PetKind) || 'cat'
  const tint = PET_TINTS.find((t) => t.id === pet?.tint)
  const body = kind === 'panda' || kind === 'dino' || !tint ? BODY[kind] : tint.color
  return (
    <svg width={size} height={size} viewBox="0 -12 120 142" aria-hidden="true" style={{ overflow: 'visible', ...style }}>
      <Ears kind={kind} body={body} />
      <path d={HEAD} fill={body} stroke={body === '#FFFFFF' ? '#E3E7F0' : 'none'} strokeWidth="2" />
      {kind !== 'bunny' && kind !== 'panda' && <ellipse cx="60" cy="100" rx="26" ry="16" fill="#FFFFFF" opacity="0.55" />}
      <Face kind={kind} mood={mood} />
      <Outfit outfit={pet?.outfit} />
    </svg>
  )
}
