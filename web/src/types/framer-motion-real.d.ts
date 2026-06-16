// TypeScript stub for the Vite alias defined in vite.config.ts.
// `framer-motion-real` is the escape hatch for the 4-5 components that
// genuinely need real framer-motion; Vite resolves it back to the real
// package, and at type-check time we declare it as re-exporting that
// same package so callers get full IntelliSense / typings.
declare module 'framer-motion-real' {
  export * from 'framer-motion'
}
