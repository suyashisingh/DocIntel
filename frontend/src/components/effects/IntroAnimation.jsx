import { useEffect, useMemo, useState } from 'react'
import { motion, useAnimation } from 'framer-motion'

const STORAGE_KEY = 'docIntelIntroPlayed'

function makeParticles() {
  return Array.from({ length: 40 }, (_, i) => {
    const angle = Math.random() * Math.PI * 2
    const distance = 200 + Math.random() * 400
    return {
      id: i,
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      delay: Math.random() * 0.1,
      size: Math.random() < 0.5 ? 3 : 2,
      isAccent: Math.random() < 0.6,
    }
  })
}

export default function IntroAnimation() {
  const [show] = useState(() => {
    try { return !sessionStorage.getItem(STORAGE_KEY) } catch { return false }
  })
  const [phase, setPhase] = useState(1)
  const [gone, setGone] = useState(false)
  const logoControls = useAnimation()

  const particles = useMemo(() => makeParticles(), [])

  const lines = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      id: i,
      angle: (i / 14) * Math.PI * 2 + 0.3,
      delay: i * 0.018,
    })), [])

  useEffect(() => {
    if (!show) return
    const t1 = setTimeout(() => setPhase(2), 800)
    const t2 = setTimeout(() => setPhase(3), 1600)
    const t3 = setTimeout(() => setPhase(4), 2400)
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [show])

  useEffect(() => {
    if (phase === 2) {
      logoControls.start({
        scale: [1, 1.15, 1],
        transition: { duration: 0.55, times: [0, 0.5, 1], ease: 'easeInOut' },
      })
    }
  }, [phase, logoControls])

  if (!show || gone) return null

  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxLen = Math.sqrt(vw * vw + vh * vh) / 2 + 120

  return (
    <motion.div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#0D0D0D', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      animate={phase === 4 ? { opacity: 0, scale: 1.03 } : { opacity: 1, scale: 1 }}
      transition={{ duration: 0.8, ease: 'easeInOut' }}
      onAnimationComplete={() => {
        if (phase === 4) {
          try { sessionStorage.setItem(STORAGE_KEY, '1') } catch {}
          setGone(true)
        }
      }}
    >
      {/* Phase 3: ray lines */}
      {phase >= 3 && (
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', zIndex: 0 }}
          aria-hidden="true"
        >
          <g transform={`translate(${vw / 2} ${vh / 2})`}>
            {lines.map(line => (
              <motion.path
                key={line.id}
                d={`M 0 0 L ${Math.cos(line.angle) * maxLen} ${Math.sin(line.angle) * maxLen}`}
                stroke="#E84E2A"
                strokeOpacity={0.2}
                strokeWidth={1}
                fill="none"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, ease: 'easeOut', delay: line.delay }}
              />
            ))}
          </g>
        </svg>
      )}

      {/* Phase 2+: particle burst */}
      {phase >= 2 && particles.map(p => (
        <motion.div
          key={p.id}
          style={{
            position: 'absolute',
            top: '50%', left: '50%',
            width: p.size, height: p.size,
            borderRadius: '50%',
            backgroundColor: p.isAccent ? '#E84E2A' : '#FFFFFF',
            zIndex: 1,
          }}
          initial={{ x: -p.size / 2, y: -p.size / 2, opacity: 0.9 }}
          animate={{ x: p.tx - p.size / 2, y: p.ty - p.size / 2, opacity: 0.65 }}
          transition={{ duration: 0.65, delay: p.delay, ease: [0.1, 0.6, 0.4, 0.95] }}
        />
      ))}

      {/* Logo */}
      <motion.div
        style={{ position: 'relative', zIndex: 2 }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.18 }}
      >
        <motion.div
          animate={logoControls}
          style={{
            width: 64, height: 64,
            borderRadius: 14,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <span style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: 800,
            fontSize: 22,
            color: '#FFFFFF',
            lineHeight: 1,
            letterSpacing: '-0.02em',
            userSelect: 'none',
          }}>
            DI
          </span>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}
