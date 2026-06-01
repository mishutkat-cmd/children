import React from 'react'

/**
 * Drop-in replacement for the tiny subset of framer-motion that the auth
 * pages used (motion.div / AnimatePresence wrapping show-hide alerts).
 *
 * Pulling framer-motion onto the login screen costs ~40KB gz that the
 * auth flow has no need for — the page is two text fields and a button.
 * This shim renders plain DOM elements and silently drops motion-only
 * props, so the JSX in LoginPage/RegisterPage works unchanged.
 *
 * If real animations are ever wanted on auth screens, swap back to the
 * `framer-motion` import or use MUI Fade/Collapse.
 */

type AnyProps = Record<string, any>

const MOTION_ONLY_PROPS = new Set([
  'initial', 'animate', 'exit', 'transition',
  'layout', 'layoutId',
  'whileHover', 'whileTap', 'whileFocus', 'whileDrag', 'whileInView',
  'viewport',
  'drag', 'dragConstraints', 'dragElastic', 'dragMomentum',
  'variants', 'custom',
  'onAnimationStart', 'onAnimationComplete', 'onUpdate',
])

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
    get(_target, prop: string) {
      let c = cache.get(prop)
      if (!c) {
        c = makeMotionTag(prop)
        cache.set(prop, c)
      }
      return c
    },
  },
)

export const AnimatePresence: React.FC<{ children?: React.ReactNode; mode?: string; initial?: boolean }> =
  ({ children }) => <>{children}</>
