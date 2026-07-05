import { motion } from 'framer-motion'

export default function GradientOrbs({ className = '' }) {
  return (
    <div className={`pointer-events-none fixed inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {/* Primary accent orb — top left */}
      <motion.div
        className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(232,78,42,0.15) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ y: [0, -22, 0], x: [0, 12, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
      />
      {/* Amber orb — bottom right */}
      <motion.div
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(251,146,60,0.10) 0%, transparent 70%)',
          filter: 'blur(80px)',
        }}
        animate={{ y: [0, 18, 0], x: [0, -10, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut', delay: 1.5 }}
      />
      {/* Faint accent orb — center */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full"
        style={{
          background: 'radial-gradient(circle, rgba(232,78,42,0.08) 0%, transparent 70%)',
          filter: 'blur(100px)',
        }}
        animate={{ scale: [1, 1.05, 1], opacity: [0.8, 1, 0.8] }}
        transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut', delay: 3 }}
      />
    </div>
  )
}
