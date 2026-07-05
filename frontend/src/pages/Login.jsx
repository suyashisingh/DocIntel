import { useRef, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, FileText, Zap, Sparkles } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import GradientOrbs from '../components/effects/GradientOrbs'

const STATS = [
  { Icon: FileText, label: '18k+ Docs processed' },
  { Icon: Zap,      label: '99.9% Uptime' },
  { Icon: Sparkles, label: 'AI Powered Extraction' },
]

function ParticleCanvas() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    let w = canvas.offsetWidth, h = canvas.offsetHeight
    canvas.width = w; canvas.height = h
    const pts = Array.from({ length: 20 }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.25, vy: (Math.random() - 0.5) * 0.25,
      r: 1 + Math.random() * 1.5,
      accent: Math.random() < 0.5,
    }))
    let raf
    function draw() {
      ctx.clearRect(0, 0, w, h)
      pts.forEach(p => {
        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx.fillStyle = p.accent ? 'rgba(232,78,42,0.35)' : 'rgba(255,255,255,0.22)'
        ctx.fill()
      })
      raf = requestAnimationFrame(draw)
    }
    draw()
    const onResize = () => { w = canvas.offsetWidth; h = canvas.offsetHeight; canvas.width = w; canvas.height = h }
    window.addEventListener('resize', onResize)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize) }
  }, [])
  return <canvas ref={ref} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden="true" />
}

const containerVariants = {
  hidden: { opacity: 0, x: -24 },
  visible: {
    opacity: 1, x: 0,
    transition: { duration: 0.5, ease: 'easeOut', staggerChildren: 0.12, delayChildren: 0.25 },
  },
}
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}
const cardVariants = {
  hidden: { opacity: 0, x: 24, y: 16 },
  visible: {
    opacity: 1, x: 0, y: 0,
    transition: { duration: 0.5, ease: 'easeOut', delay: 0.1, staggerChildren: 0.07, delayChildren: 0.3 },
  },
}
const cardChildVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' } },
}


export default function Login() {
  const { login, loading } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [emailFocused, setEmailFocused] = useState(false)
  const [passwordFocused, setPasswordFocused] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    try {
      await login(email, password)
      navigate('/dashboard')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please try again.')
    }
  }

  const emailStyle = {
    width: '100%', height: 52, padding: '0 16px',
    background: emailFocused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${emailFocused ? 'rgba(232,78,42,0.70)' : 'rgba(255,255,255,0.10)'}`,
    boxShadow: emailFocused ? '0 0 0 3px rgba(232,78,42,0.15)' : 'none',
    borderRadius: 10, color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif", fontSize: 15,
    outline: 'none', boxSizing: 'border-box',
    transition: 'all 0.25s ease',
  }

  const passwordStyle = {
    width: '100%', height: 52, padding: '0 48px 0 16px',
    background: passwordFocused ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.06)',
    border: `1px solid ${passwordFocused ? 'rgba(232,78,42,0.70)' : 'rgba(255,255,255,0.10)'}`,
    boxShadow: passwordFocused ? '0 0 0 3px rgba(232,78,42,0.15)' : 'none',
    borderRadius: 10, color: '#FFFFFF',
    fontFamily: "'DM Sans', sans-serif", fontSize: 15,
    outline: 'none', boxSizing: 'border-box',
    transition: 'all 0.25s ease',
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div style={{ minHeight: '100vh', position: 'relative', overflow: 'hidden', background: 'radial-gradient(ellipse at 60% 35%, #1C1410 0%, #0D0D0D 70%)' }}>
        <GradientOrbs />
        <ParticleCanvas />
        <div style={{ position: 'fixed', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.03) 1px, transparent 1px)', backgroundSize: '24px 24px', pointerEvents: 'none', zIndex: 0 }} aria-hidden="true" />

        {/* Logo */}
        <div
          style={{ position: 'fixed', top: '24px', left: '24px', zIndex: 50, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: '#E84E2A', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '13px', color: 'white', letterSpacing: '-0.5px' }}>DI</span>
          </div>
          <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '18px', color: 'white', letterSpacing: '-0.3px' }}>DocIntel</span>
        </div>

        {/* Main content */}
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '80px 48px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 80, maxWidth: 1100, width: '100%', position: 'relative' }}>

            {/* Left column */}
            <motion.div
              className="hidden lg:flex flex-col"
              style={{ position: 'relative', overflow: 'visible', display: 'flex', flexDirection: 'column', justifyContent: 'center', minWidth: '320px', maxWidth: '380px', gap: 24 }}
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <motion.h1
                variants={itemVariants}
                style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 52, color: '#FFFFFF', lineHeight: 1.0, margin: 0, position: 'relative', zIndex: 2 }}
              >
                Welcome back.
              </motion.h1>
              <motion.p
                variants={itemVariants}
                style={{ fontFamily: "'DM Sans', sans-serif", color: 'rgba(255,255,255,0.55)', fontSize: 16, lineHeight: 1.6, maxWidth: 320, margin: 0, position: 'relative', zIndex: 2 }}
              >
                Sign in to continue extracting intelligence from your documents.
              </motion.p>
              <motion.div variants={itemVariants} style={{ display: 'flex', flexDirection: 'row', flexWrap: 'nowrap', gap: 8, position: 'relative', zIndex: 2 }}>
                {STATS.map(({ Icon, label }) => (
                  <motion.span
                    key={label}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '6px 12px', borderRadius: 100,
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.15)',
                      fontFamily: "'DM Sans', sans-serif", fontSize: 13,
                      color: 'rgba(255,255,255,0.70)',
                      cursor: 'default',
                    }}
                    whileHover={{ scale: 1.04, background: 'rgba(255,255,255,0.12)', borderColor: 'rgba(232,78,42,0.30)', transition: { duration: 0.15 } }}
                  >
                    <Icon size={13} color="rgba(255,255,255,0.50)" />
                    {label}
                  </motion.span>
                ))}
              </motion.div>
            </motion.div>

            {/* Glass auth card */}
            <motion.div
              variants={cardVariants}
              initial="hidden"
              animate="visible"
              style={{
                width: '100%', maxWidth: 420,
                padding: 48,
                background: 'rgba(255,253,249,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 24,
                backdropFilter: 'blur(24px)',
                boxShadow: '0 0 60px rgba(232,78,42,0.08), 0 24px 80px rgba(0,0,0,0.4)',
                flexShrink: 0,
              }}
            >
              <motion.div variants={cardChildVariants} style={{ marginBottom: 24 }}>
                <h2 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 28, color: '#FFFFFF', margin: '0 0 8px 0' }}>Sign in</h2>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Enter your credentials to access your workspace</p>
              </motion.div>

              <motion.div variants={cardChildVariants}>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 28 }} />
              </motion.div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {/* Email */}
                <motion.div variants={cardChildVariants}>
                  <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Email address</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="you@company.com"
                    autoComplete="email"
                    style={emailStyle}
                    onFocus={() => setEmailFocused(true)}
                    onBlur={() => setEmailFocused(false)}
                  />
                </motion.div>

                {/* Password */}
                <motion.div variants={cardChildVariants}>
                  <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 6 }}>Password</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      style={passwordStyle}
                      onFocus={() => setPasswordFocused(true)}
                      onBlur={() => setPasswordFocused(false)}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(prev => !prev)}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.70)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div style={{ textAlign: 'right', marginTop: '8px', marginBottom: '4px' }}>
                    <a
                      href="#"
                      style={{ color: 'rgba(255,255,255,0.40)', fontSize: '13px', fontFamily: 'DM Sans, sans-serif', cursor: 'pointer', textDecoration: 'none', transition: 'color 0.15s ease' }}
                      onMouseEnter={e => e.target.style.color = 'rgba(232,78,42,0.90)'}
                      onMouseLeave={e => e.target.style.color = 'rgba(255,255,255,0.40)'}
                    >
                      Forgot password?
                    </a>
                  </div>
                </motion.div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 14px', background: 'rgba(232,78,42,0.1)', border: '1px solid rgba(232,78,42,0.25)', borderRadius: 10 }}
                  >
                    <span style={{ color: '#E84E2A', flexShrink: 0, marginTop: 1 }}>⚠</span>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#FFFFFF' }}>{error}</span>
                  </motion.div>
                )}

                <motion.button
                  variants={cardChildVariants}
                  type="submit"
                  disabled={loading}
                  whileHover={{ y: -2, boxShadow: '0 12px 35px rgba(232,78,42,0.35)', filter: 'brightness(1.08)', transition: { duration: 0.15 } }}
                  whileTap={{ scale: 0.97, y: 0 }}
                  style={{
                    width: '100%', height: 52,
                    background: '#E84E2A',
                    border: 'none', borderRadius: 12,
                    fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 16, color: '#FFFFFF',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.85 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s ease',
                    marginTop: 4,
                  }}
                >
                  {loading ? (
                    <>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.8s linear infinite' }}>
                        <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
                        <path d="M12 2a10 10 0 0 1 10 10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
                      </svg>
                      Signing in…
                    </>
                  ) : 'Sign in'}
                </motion.button>
              </form>

              <motion.p
                variants={cardChildVariants}
                style={{ marginTop: 24, textAlign: 'center', fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.4)' }}
              >
                Don&apos;t have an account?{' '}
                <Link to="/signup" style={{ color: '#E84E2A', textDecoration: 'none', fontWeight: 500 }} onMouseEnter={e => e.target.style.textDecoration = 'underline'} onMouseLeave={e => e.target.style.textDecoration = 'none'}>
                  Create one
                </Link>
              </motion.p>
            </motion.div>

          </div>
        </div>

        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } } input::placeholder { color: rgba(255,255,255,0.25) !important; }`}</style>
      </div>
    </motion.div>
  )
}
