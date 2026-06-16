import React, { useEffect, useRef } from 'react'

/**
 * Drop-in replacement for the framer-motion surface area we actually
 * use across the SPA: `motion.<tag>`, `AnimatePresence`, `useAnimation`,
 * `useInView`. Renders plain DOM elements and silently drops every
 * motion-only prop (`initial`, `animate`, `whileHover`, etc.) so JSX
 * doesn't need to be rewritten anywhere.
 *
 * Wired in via vite.config.ts:
 *   resolve.alias['framer-motion'] = this file
 *   resolve.alias['framer-motion-real'] = 'framer-motion'
 *
 * Components that genuinely need real animation (Celebration,
 * PointsAnimation, PurchaseAnimation, AchievementUnlocked, etc.) import
 * from `framer-motion-real` directly.
 *
 * Effect on bundle: framer-motion was being pulled into every lazy page
 * chunk via shared components (AnimatedCard, ParentTaskCard,
 * ChildStatsCard, MetricCard, …). At ~30 KB gz per chunk this was the
 * biggest single bundle waste in the audit. With the alias, only the
 * handful of files that explicitly import 'framer-motion-real' carry it.
 */

type AnyProps = Record<string, any>

const MOTION_ONLY_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition',
  'layout', 'layoutId', 'layoutScroll', 'layoutRoot',
  'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
  'viewport',
  'drag', 'dragConstraints', 'dragElastic', 'dragMomentum', 'dragSnapToOrigin',
  'dragTransition', 'dragListener', 'dragPropagation', 'dragControls',
  'variants', 'custom',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate',
  'onHoverStart', 'onHoverEnd', 'onTap', 'onTapStart', 'onTapCancel',
  'onDrag', 'onDragStart', 'onDragEnd', 'onDirectionLock',
  'onViewportEnter', 'onViewportLeave', 'onViewportBoxUpdate',
  'inherit', 'style',  // (style intentionally NOT in this set — see below)
])
// Some style overlap: framer-motion allows `style` with motion values.
// We want to keep `style` for the DOM, so undo that:
MOTION_ONLY_PROPS.delete('style')

function stripMotionProps(props: AnyProps): AnyProps {
  const out: AnyProps = {}
  for (const k in props) if (!MOTION_ONLY_PROPS.has(k)) out[k] = props[k]
  return out
}

function makeMotionTag(tag: string) {
  return React.forwardRef<any, AnyProps>(function MotionShim(props, ref) {
    return React.createElement(tag, { ...stripMotionProps(props), ref })
  })
}

const cache = new Map<string, ReturnType<typeof makeMotionTag>>()

export const motion: any = new Proxy(
  {},
  {
    get(_target, prop: string | symbol) {
      const tag = typeof prop === 'string' ? prop : String(prop)
      let c = cache.get(tag)
      if (!c) {
        c = makeMotionTag(tag)
        cache.set(tag, c)
      }
      return c
    },
  },
)

export const AnimatePresence: React.FC<{
  children?: React.ReactNode
  mode?: string
  initial?: boolean
  onExitComplete?: () => void
}> = ({ children }) => <>{children}</>

/**
 * Stub: returns a controls object with no-op start/stop/set/mount.
 * Components that gate their render on animation completion via
 * `useAnimation` will silently never animate but won't crash.
 */
export function useAnimation() {
  const controls = useRef({
    start: () => Promise.resolve(),
    stop: () => {},
    set: () => {},
    mount: () => () => {},
  }).current
  return controls
}

/**
 * Stub: useInView replacement. Reports the element as in-view exactly
 * once on mount (matching framer-motion's `once: true` default). Useful
 * for "trigger on scroll into view" patterns — the trigger fires
 * immediately. Better than never firing at all.
 */
export function useInView(_ref: React.RefObject<any>, _options?: any) {
  const [inView, setInView] = React.useState(false)
  useEffect(() => {
    setInView(true)
  }, [])
  return inView
}

/** Re-exports of types/constants that callers occasionally import. */
export const LayoutGroup: React.FC<{ children?: React.ReactNode; id?: string }> = ({ children }) => <>{children}</>
export const LazyMotion: React.FC<{ children?: React.ReactNode; features?: any }> = ({ children }) => <>{children}</>
export const MotionConfig: React.FC<{ children?: React.ReactNode; transition?: any }> = ({ children }) => <>{children}</>
export const domAnimation = {}
export const domMax = {}
