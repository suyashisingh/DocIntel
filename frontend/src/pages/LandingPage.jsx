import { Fragment, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Zap, Shield, Search, BarChart2, Users,
  ChevronDown, ChevronRight, ArrowRight, Check,
  X as XIcon, Globe, Code2,
} from 'lucide-react'

// ── Injected styles ────────────────────────────────────────────────────
const STYLES = `
  @keyframes marqueeScroll {
    0%   { transform: translateX(0) }
    100% { transform: translateX(-50%) }
  }
  @keyframes dashMove {
    0%   { stroke-dashoffset: 8 }
    100% { stroke-dashoffset: 0 }
  }
  @keyframes shimmerSweep {
    0%   { background-position: -300% center }
    100% { background-position: 300% center }
  }
  @keyframes connectorDot {
    0%   { transform: translateY(-50%) translateX(-6px); opacity: 0; }
    15%  { opacity: 1; }
    85%  { opacity: 1; }
    100% { transform: translateY(-50%) translateX(64px); opacity: 0; }
  }
  .marquee-track {
    display: flex;
    width: max-content;
    animation: marqueeScroll 35s linear infinite;
  }
  .cta-btn {
    background: linear-gradient(90deg, #E84E2A 0%, #ff7050 30%, #E84E2A 60%, #ff7050 100%);
    background-size: 300% auto;
    transition: background-position 0.6s ease, box-shadow 0.2s ease, transform 0.1s ease;
  }
  .cta-btn:hover {
    background-position: right center;
    box-shadow: 0 0 30px rgba(232,78,42,0.45);
  }
  .dash-line { animation: dashMove 0.7s linear infinite; }
  .connector-dot {
    position: absolute;
    top: 50%;
    left: 0;
    width: 6px; height: 6px;
    border-radius: 50%;
    background: #E84E2A;
    animation: connectorDot 2s linear infinite;
  }
  @media (max-width: 767px) {
    .stat-no-right-mobile { border-right: none !important; }
    .stat-top-mobile { border-top: 1px solid rgba(255,255,255,0.07) !important; }
  }
`

// ── Constants ──────────────────────────────────────────────────────────
const ROTATING_WORDS = ['intelligence.', 'insight.', 'answers.', 'clarity.', 'action.']

const FEATURE_CHIPS = [
  '⚡ AI Extraction', '🔍 Semantic Search', '💬 RAG Chat', '📊 Analytics',
  '🔒 PII Detection', '📁 Smart Folders', '🏷 Auto-Classification', '📋 Table Extraction',
  '⚖️ Document Comparison', '🔔 Notifications',
]

const CAPABILITIES = [
  { Icon: MessageSquare, title: 'RAG-Powered Chat',     desc: 'Ask questions across your entire document library and get cited, grounded answers.' },
  { Icon: Zap,           title: 'Smart Extraction',     desc: 'OCR + AI extracts text, tables, and named entities from any document format.' },
  { Icon: Shield,        title: 'PII Detection',        desc: 'Automatically scan and redact sensitive personal information across all documents.' },
  { Icon: Search,        title: 'Semantic Search',      desc: 'Find exactly what you need with vector-powered contextual search across your library.' },
  { Icon: BarChart2,     title: 'Document Analytics',   desc: 'Track processing stats, confidence trends, and team activity in real time.' },
  { Icon: Users,         title: 'Role-Based Access',    desc: 'Granular permissions for Admins, Analysts, and Viewers across your organization.' },
]

const STEPS = [
  { n: '01', emoji: '📤', title: 'Upload',         desc: 'Drag-and-drop PDFs, images, or ZIP archives. Supports up to 50 MB per file.' },
  { n: '02', emoji: '⚙️', title: 'Process',        desc: 'Our AI pipeline runs OCR, classification, entity extraction, and embedding in seconds.' },
  { n: '03', emoji: '💬', title: 'Extract & Chat', desc: 'Query documents conversationally, compare results, and export structured data.' },
]

const STATS_DATA = [
  { target: 50000, label: 'Documents Processed',      format: v => Math.floor(v / 1000) + 'k+', static: false },
  { target: 99.2,  label: 'Extraction Accuracy',       format: v => v.toFixed(1) + '%',           static: false },
  { target: 3,     label: 'Faster Than Manual Review', format: v => Math.floor(v) + 'x',          static: false },
  { target: 30,    label: 'Average Processing Time',   format: () => '< 30s',                     static: true  },
]

const TESTIMONIALS_DATA = [
  {
    quote: 'DocIntel cut our contract review time by 70%. The RAG chat is genuinely impressive — it cites exactly where in the document it found the answer.',
    name: 'Sarah Chen', role: 'Legal Operations Lead', company: 'TechCorp', initials: 'SC', color: '#E84E2A',
  },
  {
    quote: 'We process 500+ invoices a week. The table extraction and PII redaction features alone justified the switch. Setup was under 30 minutes.',
    name: 'Marcus Williams', role: 'Finance Director', company: 'BuildScale', initials: 'MW', color: '#3b82f6',
  },
  {
    quote: 'The semantic search is what got us. Finding relevant clauses across 200 contracts used to take days. Now it\'s seconds.',
    name: 'Priya Sharma', role: 'Head of Compliance', company: 'DataFlow', initials: 'PS', color: '#10b981',
  },
]

const FREE_FEATURES     = ['Up to 20 documents', 'OCR + text extraction', 'Basic search', '1 team member', 'Email support']
const PRO_FEATURES      = ['Unlimited documents', 'AI chat (RAG)', 'PII detection & redaction', 'Table extraction', 'Semantic search', 'Up to 10 team members', 'Analytics dashboard', 'Priority support']
const ENTERPRISE_FEATURES = ['Everything in Pro', 'Unlimited team members', 'Custom integrations', 'SSO / SAML', 'SLA guarantee', 'Dedicated support']
const TRUSTED_LOGOS     = ['Stripe', 'Notion', 'Vercel', 'Linear', 'Figma', 'Loom']

// ── Particle Canvas ────────────────────────────────────────────────────
function ParticleCanvas() {
  const canvasRef = useRef(null)
  const mouseRef  = useRef({ x: -9999, y: -9999 })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let w = canvas.offsetWidth
    let h = canvas.offsetHeight
    canvas.width  = w
    canvas.height = h

    const particles = Array.from({ length: 50 }, () => ({
      x:    Math.random() * w,
      y:    Math.random() * h,
      vx:   (Math.random() - 0.5) * 0.6,
      vy:   (Math.random() - 0.5) * 0.6,
      r:    1.5 + Math.random() * 1.5,
      kind: Math.random() > 0.6 ? 'accent' : 'white',
    }))

    const anchor = { x: w * 0.5, y: h * 0.45, vx: 0.08, vy: 0.04, r: 6, kind: 'anchor', pulse: 0 }
    const all = [...particles, anchor]

    let raf

    function tick() {
      ctx.clearRect(0, 0, w, h)
      const { x: mx, y: my } = mouseRef.current

      for (const p of all) {
        const mdx = p.x - mx, mdy = p.y - my
        const md  = Math.sqrt(mdx * mdx + mdy * mdy)
        if (md < 160 && md > 0) {
          const f = ((160 - md) / 160) * 0.25
          p.vx += (mdx / md) * f
          p.vy += (mdy / md) * f
        }

        p.vx *= 0.99
        p.vy *= 0.99
        const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (spd > 1.4) { p.vx *= 1.4 / spd; p.vy *= 1.4 / spd }

        p.x += p.vx; p.y += p.vy
        if (p.x < 0 || p.x > w) p.vx *= -1
        if (p.y < 0 || p.y > h) p.vy *= -1

        for (const q of all) {
          if (q === p) continue
          const dx = p.x - q.x, dy = p.y - q.y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 120) {
            ctx.beginPath()
            ctx.moveTo(p.x, p.y)
            ctx.lineTo(q.x, q.y)
            ctx.strokeStyle = `rgba(232,78,42,${(1 - dist / 120) * 0.2})`
            ctx.lineWidth = 0.6
            ctx.stroke()
          }
        }

        if (p.kind === 'anchor') {
          p.pulse = (p.pulse || 0) + 0.025
          const pr = p.r + Math.sin(p.pulse) * 2
          ctx.beginPath()
          ctx.arc(p.x, p.y, pr, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(232,78,42,0.85)'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(p.x, p.y, pr + 5, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(232,78,42,${0.2 + Math.sin(p.pulse) * 0.08})`
          ctx.lineWidth = 1
          ctx.stroke()
        } else {
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2)
          ctx.fillStyle = p.kind === 'accent' ? 'rgba(232,78,42,0.5)' : 'rgba(255,255,255,0.3)'
          ctx.fill()
        }
      }

      raf = requestAnimationFrame(tick)
    }

    tick()

    function onResize() { w = canvas.offsetWidth; h = canvas.offsetHeight; canvas.width = w; canvas.height = h }
    function onMouse(e) { const r = canvas.getBoundingClientRect(); mouseRef.current = { x: e.clientX - r.left, y: e.clientY - r.top } }

    window.addEventListener('resize', onResize)
    document.addEventListener('mousemove', onMouse)

    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); document.removeEventListener('mousemove', onMouse) }
  }, [])

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true" />
}

// ── Hero Gradient Orbs ─────────────────────────────────────────────────
function HeroOrbs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <motion.div
        className="absolute rounded-full"
        style={{ width: 600, height: 600, background: 'radial-gradient(circle, rgba(232,78,42,0.18) 0%, transparent 70%)', filter: 'blur(120px)', top: -100, left: -100 }}
        animate={{ y: [0, 60, 0], x: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ width: 500, height: 500, background: 'radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)', filter: 'blur(100px)', bottom: -80, right: -80 }}
        animate={{ y: [0, -50, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: 'easeInOut', delay: 3, repeatType: 'mirror' }}
      />
      <motion.div
        className="absolute rounded-full"
        style={{ width: 350, height: 350, background: 'radial-gradient(circle, rgba(255,51,102,0.10) 0%, transparent 70%)', filter: 'blur(90px)', top: '40%', right: '15%' }}
        animate={{ x: [0, 30, 0], y: [0, -40, 0] }}
        transition={{ duration: 28, repeat: Infinity, ease: 'easeInOut', delay: 6, repeatType: 'mirror' }}
      />
    </div>
  )
}

// ── Dot Grid ───────────────────────────────────────────────────────────
function DotGrid() {
  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" aria-hidden="true">
      <defs>
        <pattern id="lp-dots" width="40" height="40" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="white" opacity="0.03" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#lp-dots)" />
    </svg>
  )
}

// ── Nav ────────────────────────────────────────────────────────────────
function Nav() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  function scrollTo(id) {
    const el = document.getElementById(id)
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 64
      window.scrollTo({ top, behavior: 'smooth' })
    }
  }

  return (
    <motion.nav
      className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 md:px-10 h-16"
      style={{
        background:           scrolled ? 'rgba(13,13,13,0.65)' : 'transparent',
        backdropFilter:       scrolled ? 'blur(16px) saturate(180%)' : 'none',
        WebkitBackdropFilter: scrolled ? 'blur(16px) saturate(180%)' : 'none',
        borderBottom:         scrolled ? '1px solid rgba(255,255,255,0.07)' : 'none',
        transition: 'background 0.35s ease, backdrop-filter 0.35s ease, border-color 0.35s ease',
      }}
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.4, ease: 'easeOut' }}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center gap-2.5 shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#E84E2A' }}>
          <span className="font-display text-[10px] font-bold text-white leading-none">DI</span>
        </div>
        <span className="font-display text-lg font-bold text-white tracking-tight hidden sm:block">DocIntel</span>
      </Link>

      {/* Nav links — hidden on mobile */}
      <div className="hidden md:flex items-center gap-8">
        {[['Features', 'features'], ['How it works', 'how-it-works'], ['Pricing', 'pricing']].map(([label, id]) => (
          <button
            key={label}
            onClick={() => scrollTo(id)}
            style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.60)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.15s', padding: 0 }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.95)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.60)' }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* CTAs */}
      <div className="flex items-center gap-2.5">
        <Link
          to="/login"
          className="hidden sm:block px-4 py-2 rounded-xl border border-white/25 text-white text-sm font-body font-medium hover:bg-white/8 transition-all duration-200"
        >
          Sign in
        </Link>
        <motion.div whileTap={{ scale: 0.96 }}>
          <Link
            to="/signup"
            className="px-4 py-2 rounded-xl bg-[#E84E2A] text-white text-sm font-display font-bold hover:bg-[#d44424] hover:shadow-[0_0_20px_rgba(232,78,42,0.4)] transition-all duration-200"
          >
            Get started
          </Link>
        </motion.div>
      </div>
    </motion.nav>
  )
}

// ── Rotating word ──────────────────────────────────────────────────────
function RotatingWord() {
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setIdx(i => (i + 1) % ROTATING_WORDS.length), 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <span className="relative inline-block" style={{ minWidth: '3ch', verticalAlign: 'bottom' }}>
      <AnimatePresence mode="wait">
        <motion.span
          key={ROTATING_WORDS[idx]}
          className="block italic text-[#E84E2A]"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0,  opacity: 1 }}
          exit={{ y: -24, opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
        >
          {ROTATING_WORDS[idx]}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

// ── Scroll indicator ───────────────────────────────────────────────────
function ScrollIndicator() {
  const [show, setShow] = useState(true)

  useEffect(() => {
    const fn = () => setShow(window.scrollY < 100)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  return (
    <motion.div
      className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 select-none pointer-events-none"
      animate={{ opacity: show ? 1 : 0, y: show ? 0 : 8 }}
      transition={{ duration: 0.3 }}
    >
      <div style={{ width: 2, height: 40, background: 'rgba(255,255,255,0.20)', borderRadius: 999 }} />
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      >
        <ChevronDown size={16} style={{ color: 'rgba(255,255,255,0.40)' }} strokeWidth={1.5} />
      </motion.div>
    </motion.div>
  )
}

// ── Browser Mockup ─────────────────────────────────────────────────────
const MOCKUP_NAV = [
  { label: 'Dashboard', active: true },
  { label: 'Upload',    active: false },
  { label: 'Search',    active: false },
  { label: 'Chat',      active: false },
  { label: 'Analytics', active: false },
]
const MOCKUP_STATS = [
  { value: '10', label: 'TOTAL' },
  { value: '10', label: 'PROCESSED' },
  { value: '0',  label: 'PENDING' },
  { value: '0',  label: 'FAILED' },
]
const MOCKUP_ROWS = [
  { name: 'Q4_Invoice_2024.pdf',   type: 'Invoice',  status: 'completed',  date: 'May 24' },
  { name: 'Contract_TechCorp.pdf', type: 'Contract', status: 'completed',  date: 'May 23' },
  { name: 'Report_Annual.pdf',     type: 'Report',   status: 'processing', date: 'May 23' },
  { name: 'NDA_Vendor_v2.pdf',     type: 'Legal',    status: 'completed',  date: 'May 22' },
  { name: 'Proposal_Q1.pdf',       type: 'Proposal', status: 'completed',  date: 'May 21' },
]

function BrowserMockup() {
  return (
    <div style={{ position: 'relative', padding: '20px 20px 0' }}>
      {/* Accent glow behind the window */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 400, height: 400, borderRadius: '50%',
          background: '#E84E2A', filter: 'blur(80px)', opacity: 0.15, zIndex: 0, pointerEvents: 'none',
        }}
      />

      {/* Float animation wrapper */}
      <motion.div
        style={{ position: 'relative', zIndex: 1 }}
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', repeatType: 'mirror' }}
      >
        {/* Browser shell with perspective */}
        <div style={{
          transform: 'perspective(1200px) rotateY(-8deg) rotateX(4deg)',
          borderRadius: 12,
          background: '#1a1a1a',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6), 0 0 60px rgba(232,78,42,0.12)',
          overflow: 'hidden',
          width: '100%',
          maxWidth: 520,
        }}>
          {/* Browser chrome bar */}
          <div style={{ height: 36, background: '#252525', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', padding: '0 12px', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff5f56' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ffbd2e' }} />
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#27c93f' }} />
            </div>
            <div style={{ flex: 1, height: 22, background: 'rgba(255,255,255,0.07)', borderRadius: 5, display: 'flex', alignItems: 'center', padding: '0 10px', marginLeft: 6 }}>
              <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>localhost:5173/dashboard</span>
            </div>
          </div>

          {/* Dashboard interior */}
          <div style={{ display: 'flex', height: 340 }}>
            {/* Left sidebar */}
            <div style={{ width: '19%', background: '#0F0D0B', borderRight: '1px solid rgba(255,255,255,0.07)', padding: '10px 0', display: 'flex', flexDirection: 'column' }}>
              {/* Logo row */}
              <div style={{ padding: '0 8px 8px', borderBottom: '1px solid rgba(255,255,255,0.07)', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 14, height: 14, borderRadius: 3, background: '#E84E2A', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 7, color: '#FFFFFF', lineHeight: 1 }}>DI</span>
                  </div>
                  <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 8, color: '#FFFFFF', lineHeight: 1 }}>DocIntel</span>
                </div>
              </div>
              {/* Nav items */}
              {MOCKUP_NAV.map(({ label, active }) => (
                <div key={label} style={{ margin: '1px 4px', height: 20, borderRadius: 4, background: active ? 'rgba(232,78,42,0.12)' : 'transparent', boxShadow: active ? 'inset 2px 0 0 #E84E2A' : 'none', display: 'flex', alignItems: 'center', gap: 4, padding: '0 6px' }}>
                  <div style={{ width: 7, height: 7, borderRadius: 2, background: active ? '#E84E2A' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8, color: active ? '#FFFFFF' : 'rgba(255,255,255,0.45)', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>{label}</span>
                </div>
              ))}
            </div>

            {/* Main content */}
            <div style={{ flex: 1, background: '#12100E', padding: '12px', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 10, color: 'rgba(255,255,255,0.90)', lineHeight: 1 }}>Dashboard</span>
                <div style={{ height: 18, padding: '0 8px', background: '#E84E2A', borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 8, color: '#FFFFFF', fontWeight: 600, whiteSpace: 'nowrap' }}>+ Upload</span>
                </div>
              </div>
              {/* Stat cards row */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                {MOCKUP_STATS.map(({ value, label }) => (
                  <div key={label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '5px 7px' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 6.5, color: 'rgba(255,255,255,0.35)', display: 'block', marginBottom: 3, letterSpacing: '0.04em' }}>{label}</span>
                    <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 13, color: '#FFFFFF', display: 'block', lineHeight: 1 }}>{value}</span>
                  </div>
                ))}
              </div>
              {/* Table */}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6, overflow: 'hidden' }}>
                {/* Table header */}
                <div style={{ display: 'flex', gap: 6, padding: '4px 8px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                  {['Name', 'Type', 'Status', 'Date'].map((h, i) => (
                    <span key={h} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 7, color: 'rgba(255,255,255,0.30)', flex: i === 0 ? 2 : 1 }}>{h}</span>
                  ))}
                </div>
                {/* Rows */}
                {MOCKUP_ROWS.map((row, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, padding: '4px 8px', borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.04)' : 'none', background: i % 2 ? 'rgba(255,255,255,0.01)' : 'transparent', alignItems: 'center' }}>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 7, color: 'rgba(255,255,255,0.70)', flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.name}</span>
                    <div style={{ flex: 1, height: 11, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 6.5, color: 'rgba(255,255,255,0.55)' }}>{row.type}</span>
                    </div>
                    <div style={{ flex: 1, height: 11, background: row.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)', border: `1px solid ${row.status === 'completed' ? 'rgba(74,222,128,0.2)' : 'rgba(245,158,11,0.2)'}`, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 6.5, color: row.status === 'completed' ? '#4ade80' : '#fbbf24' }}>{row.status}</span>
                    </div>
                    <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 7, color: 'rgba(255,255,255,0.35)', flex: 1 }}>{row.date}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

// ── Hero Section ───────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section
      id="hero"
      className="relative min-h-screen flex items-center overflow-hidden"
      style={{ background: 'radial-gradient(ellipse 80% 80% at 50% 50%, #1C1410 0%, #0D0D0D 65%)' }}
    >
      <ParticleCanvas />
      <HeroOrbs />
      <DotGrid />

      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 md:px-10 pt-20 pb-16 flex flex-col lg:flex-row items-center gap-12 lg:gap-16">

        {/* ── Left column ── */}
        <div className="flex-1 text-center lg:text-left max-w-2xl mx-auto lg:mx-0">

          {/* Eyebrow */}
          <motion.div
            className="inline-flex items-center gap-3 mb-7"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div className="w-4 h-[2px] bg-[#E84E2A] rounded-full" />
            <span className="font-mono text-[11px] text-[#E84E2A] tracking-[0.22em] uppercase">
              AI-Powered Document Intelligence
            </span>
            <div className="w-4 h-[2px] bg-[#E84E2A] rounded-full" />
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="font-display font-extrabold text-white leading-[1.05] tracking-[-0.02em] mb-7"
            style={{ fontSize: 'clamp(36px, 5vw, 64px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.4 }}
          >
            Turn documents into{' '}
            <RotatingWord />
          </motion.h1>

          {/* Subtext */}
          <motion.p
            className="text-white/60 font-body leading-relaxed max-w-[520px] mx-auto lg:mx-0 mb-10"
            style={{ fontSize: 'clamp(15px, 1.4vw, 18px)' }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.65 }}
          >
            AI-powered extraction, classification, and analysis
            <br className="hidden sm:block" />
            built for teams who work with documents at scale.
          </motion.p>

          {/* CTA row */}
          <motion.div
            className="flex flex-col sm:flex-row gap-3 items-center justify-center lg:justify-start mb-8"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.85 }}
          >
            <motion.div whileTap={{ scale: 0.97 }}>
              <Link
                to="/signup"
                className="cta-btn inline-flex items-center gap-2 text-white font-display font-bold text-sm rounded-2xl px-8 transition-all duration-200"
                style={{ height: 52 }}
              >
                Get started free
                <ArrowRight size={14} strokeWidth={2.5} />
              </Link>
            </motion.div>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-white font-body text-sm rounded-2xl border border-white/25 hover:bg-white/8 hover:border-white/40 transition-all duration-200 px-8"
              style={{ height: 52 }}
            >
              Sign in
            </Link>
          </motion.div>

          {/* Social proof row */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 1.0 }}
            style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'nowrap', marginTop: 24 }}
          >
            <span style={{ color: '#E84E2A', fontSize: 14, letterSpacing: 1 }}>★★★★★</span>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>4.9/5 rating</span>
            <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 14 }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>500+ teams</span>
            <span style={{ color: 'rgba(255,255,255,0.20)', fontSize: 14 }}>·</span>
            <span style={{ color: 'rgba(255,255,255,0.65)', fontFamily: "'DM Sans', sans-serif", fontSize: 14 }}>50k+ docs processed</span>
          </motion.div>
        </div>

        {/* ── Right column: browser mockup ── */}
        <motion.div
          className="hidden lg:block flex-1"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <BrowserMockup />
        </motion.div>
      </div>

      {/* Gradient fade into next section */}
      <div
        aria-hidden="true"
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 120, background: 'linear-gradient(to bottom, transparent, #0D0D0D)', pointerEvents: 'none' }}
      />

      <ScrollIndicator />
    </section>
  )
}

// ── Feature Band ───────────────────────────────────────────────────────
function FeatureBand() {
  const items = [...FEATURE_CHIPS, ...FEATURE_CHIPS]
  return (
    <section
      className="overflow-hidden py-[60px]"
      style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="marquee-track" aria-hidden="true">
        {items.map((chip, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-2 mx-3 shrink-0 px-5 py-2.5 rounded-full text-white/70 font-body text-sm whitespace-nowrap"
            style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}
          >
            {chip}
          </span>
        ))}
      </div>
    </section>
  )
}

// ── Stat Cell ──────────────────────────────────────────────────────────
function StatCell({ stat, index, total }) {
  const [count, setCount] = useState(0)
  const [inView, setInView] = useState(false)
  const ran = useRef(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setInView(true) },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (!inView || stat.static || ran.current) return
    ran.current = true
    const steps = 40
    const duration = 1500
    const increment = stat.target / steps
    const iv = setInterval(() => {
      setCount(prev => {
        const next = prev + increment
        if (next >= stat.target) { clearInterval(iv); return stat.target }
        return next
      })
    }, duration / steps)
    return () => clearInterval(iv)
  }, [inView, stat])

  const isLast = index === total - 1
  const cn = [
    index === 1 || index === 3 ? 'stat-no-right-mobile' : '',
    index === 2 || index === 3 ? 'stat-top-mobile' : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      ref={ref}
      className={cn}
      style={{
        background: '#0D0D0D',
        padding: '40px 24px',
        textAlign: 'center',
        borderRight: isLast ? 'none' : '1px solid rgba(255,255,255,0.07)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 140,
        overflow: 'hidden',
      }}
    >
      <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 48, color: '#FFFFFF', lineHeight: 1, display: 'block' }}>
        {stat.static ? stat.format() : stat.format(count)}
      </span>
      <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.45)', marginTop: 8, display: 'block' }}>
        {stat.label}
      </span>
    </div>
  )
}

// ── Stats Section ──────────────────────────────────────────────────────
function StatsSection() {
  return (
    <section id="stats" style={{ background: '#0D0D0D', padding: '80px 20px' }}>
      <div
        className="grid grid-cols-2 lg:grid-cols-4"
        style={{
          width: '100%',
          maxWidth: 960,
          margin: '0 auto',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 20,
          overflow: 'hidden',
        }}
      >
        {STATS_DATA.map((s, i) => (
          <StatCell key={s.label} stat={s} index={i} total={STATS_DATA.length} />
        ))}
      </div>
    </section>
  )
}

// ── Trusted By Section ─────────────────────────────────────────────────
function TrustedBySection() {
  return (
    /* Demo logos for portfolio */
    <section style={{ background: '#0A0A0A', padding: '48px 20px', borderTop: '1px solid rgba(255,255,255,0.06)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
      <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: 'rgba(255,255,255,0.30)', textTransform: 'uppercase', letterSpacing: '0.15em', textAlign: 'center', marginBottom: 32 }}>
        Trusted by teams at
      </p>
      <div className="flex items-center justify-center gap-10 md:gap-14 flex-wrap max-w-4xl mx-auto">
        {TRUSTED_LOGOS.map(name => (
          <span
            key={name}
            style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 18, color: 'rgba(255,255,255,0.25)', cursor: 'default', transition: 'color 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.55)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)' }}
          >
            {name}
          </span>
        ))}
      </div>
    </section>
  )
}

// ── Capabilities Section ───────────────────────────────────────────────
function CapabilitiesSection() {
  return (
    <section id="features" className="bg-[#F5F2EC] py-[120px] px-5">
      <div className="text-center max-w-2xl mx-auto mb-16">
        <motion.p
          className="font-mono text-[11px] text-[#E84E2A] tracking-[0.2em] uppercase mb-4"
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          What DocIntel does
        </motion.p>
        <motion.h2
          className="font-display font-extrabold text-[#0D0D0D] leading-tight tracking-[-0.02em] mb-4"
          style={{ fontSize: 'clamp(32px, 4vw, 52px)' }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Everything your team needs
        </motion.h2>
        <motion.p
          className="text-[#8C8A85] font-body"
          style={{ fontSize: 18 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.18 }}
        >
          One platform to extract, search, compare, and chat with all your documents.
        </motion.p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {CAPABILITIES.map(({ Icon, title, desc }, i) => (
          <motion.div
            key={title}
            style={{
              background: 'rgba(255,255,255,0.60)',
              border: '1px solid rgba(0,0,0,0.08)',
              borderRadius: 20,
              padding: 36,
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
              cursor: 'default',
              transition: 'all 0.25s ease',
            }}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{
              y: -6,
              boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 0 0 1px rgba(232,78,42,0.15)',
              background: 'rgba(255,255,255,0.85)',
              transition: { duration: 0.25 },
            }}
          >
            <div
              style={{
                width: 52, height: 52, borderRadius: 14,
                background: 'linear-gradient(135deg, rgba(232,78,42,0.15), rgba(232,78,42,0.05))',
                border: '1px solid rgba(232,78,42,0.20)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: 20,
              }}
            >
              <Icon size={22} strokeWidth={1.75} style={{ color: '#E84E2A' }} />
            </div>
            <h3 style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 18, color: '#0D0D0D', marginBottom: 8, lineHeight: 1.3 }}>{title}</h3>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#8C8A85', lineHeight: 1.65, margin: 0 }}>{desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ── How It Works ───────────────────────────────────────────────────────
function HowItWorksSection() {
  return (
    <section
      id="how-it-works"
      className="relative py-[120px] px-5 overflow-hidden"
      style={{ background: '#0D0D0D' }}
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <div className="absolute rounded-full" style={{ width: 400, height: 400, background: 'radial-gradient(circle, rgba(232,78,42,0.08) 0%, transparent 70%)', filter: 'blur(80px)', top: '15%', left: '5%' }} />
        <div className="absolute rounded-full" style={{ width: 320, height: 320, background: 'radial-gradient(circle, rgba(245,158,11,0.06) 0%, transparent 70%)', filter: 'blur(80px)', bottom: '10%', right: '5%' }} />
      </div>
      <DotGrid />

      <div className="relative z-10 max-w-5xl mx-auto">
        <div className="text-center mb-20">
          <motion.p
            className="font-mono text-[11px] text-[#E84E2A] tracking-[0.2em] uppercase mb-4"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
          >
            The Process
          </motion.p>
          <motion.h2
            className="font-display font-extrabold text-white tracking-[-0.02em]"
            style={{ fontSize: 'clamp(30px, 4vw, 52px)' }}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.1 }}
          >
            From upload to insight in seconds
          </motion.h2>
        </div>

        <div className="flex flex-col lg:flex-row items-center lg:items-stretch gap-4 lg:gap-0">
          {STEPS.map((step, i) => (
            <Fragment key={step.n}>
              {/* Step card */}
              <motion.div
                className="relative flex-1 flex flex-col items-center text-center w-full"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 16, padding: 28,
                  transition: 'border-color 0.2s',
                }}
                initial={{ opacity: 0, y: 28 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.14, ease: [0.16, 1, 0.3, 1] }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(232,78,42,0.30)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
              >
                {/* Ghost step number */}
                <span
                  className="absolute -top-1 left-1/2 -translate-x-1/2 pointer-events-none select-none"
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 80, color: 'rgba(255,255,255,0.04)', lineHeight: 1 }}
                >
                  {step.n}
                </span>
                {/* Icon */}
                <div
                  className="relative z-10 w-16 h-16 rounded-2xl flex items-center justify-center mb-5 text-2xl"
                  style={{ background: 'rgba(232,78,42,0.12)', border: '1px solid rgba(232,78,42,0.35)', boxShadow: '0 0 24px rgba(232,78,42,0.15)' }}
                >
                  {step.emoji}
                </div>
                <h3 className="font-display font-bold text-white text-xl mb-2 relative z-10">{step.title}</h3>
                <p className="text-white/55 font-body leading-relaxed max-w-[220px] relative z-10" style={{ fontSize: 14 }}>{step.desc}</p>
              </motion.div>

              {/* Desktop animated connector */}
              {i < STEPS.length - 1 && (
                <motion.div
                  className="hidden lg:flex items-center justify-center shrink-0"
                  style={{ width: 64, position: 'relative' }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.14 + 0.35 }}
                >
                  {/* Track */}
                  <div style={{ width: '100%', height: 2, background: 'rgba(255,255,255,0.10)', borderRadius: 999, position: 'relative', overflow: 'visible' }}>
                    {/* Moving dot */}
                    <div className="connector-dot" />
                  </div>
                  {/* Arrowhead */}
                  <ChevronRight size={14} style={{ color: '#E84E2A', position: 'absolute', right: -8, flexShrink: 0 }} strokeWidth={2} />
                </motion.div>
              )}

              {/* Mobile vertical connector */}
              {i < STEPS.length - 1 && (
                <div
                  className="lg:hidden my-4 w-[1.5px] h-10 rounded-full"
                  style={{ background: 'linear-gradient(to bottom, rgba(232,78,42,0.5), transparent)' }}
                />
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── Testimonials Section ───────────────────────────────────────────────
function TestimonialsSection() {
  return (
    <section id="testimonials" style={{ background: '#F5F2EC', padding: '100px 20px' }}>
      <div className="text-center max-w-2xl mx-auto mb-16">
        <motion.p
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#E84E2A', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          What teams say
        </motion.p>
        <motion.h2
          style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', color: '#0D0D0D', lineHeight: 1.1, letterSpacing: '-0.02em' }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Loved by document teams
        </motion.h2>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
        {TESTIMONIALS_DATA.map((t, i) => (
          <motion.div
            key={t.name}
            style={{
              background: '#FFFFFF', border: '1px solid #E2DDD6', borderRadius: 20,
              padding: 36, boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
              transition: 'transform 0.25s ease, box-shadow 0.25s ease',
              cursor: 'default',
            }}
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -4, boxShadow: '0 16px 48px rgba(0,0,0,0.12)', transition: { duration: 0.25 } }}
          >
            {/* Quote mark */}
            <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 64, color: '#E84E2A', opacity: 0.3, lineHeight: 0, marginBottom: 20, userSelect: 'none' }}>"</p>
            {/* Quote text */}
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: '#0D0D0D', lineHeight: 1.7, fontStyle: 'italic', marginBottom: 24 }}>{t.quote}</p>
            {/* Avatar + name */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: t.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 11, color: '#FFFFFF' }}>{t.initials}</span>
              </div>
              <div>
                <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 14, color: '#0D0D0D', margin: 0 }}>{t.name}</p>
                <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: '#8C8A85', margin: 0 }}>{t.role}, {t.company}</p>
              </div>
            </div>
            {/* Stars */}
            <p style={{ color: '#E84E2A', fontSize: 14, margin: 0 }}>★★★★★</p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}

// ── Pricing Section ────────────────────────────────────────────────────
function PricingSection() {
  return (
    <section id="pricing" style={{ background: '#FFFFFF', padding: '100px 20px' }}>
      <div className="text-center max-w-2xl mx-auto mb-16">
        <motion.p
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#E84E2A', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          Pricing
        </motion.p>
        <motion.h2
          style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 'clamp(32px, 4vw, 48px)', color: '#0D0D0D', lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 12 }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          Simple, transparent pricing
        </motion.h2>
        <motion.p
          style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: '#8C8A85' }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.18 }}
        >
          Start free, scale as you grow
        </motion.p>
      </div>

      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 items-center">

        {/* Free */}
        <motion.div
          style={{ background: '#F5F2EC', border: '1px solid #E2DDD6', borderRadius: 24, padding: 40 }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: '#0D0D0D', marginBottom: 8 }}>Free</p>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 48, color: '#0D0D0D', lineHeight: 1 }}>$0</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: '#8C8A85' }}>/month</span>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#8C8A85', marginBottom: 28, lineHeight: 1.6 }}>
            Perfect for individuals and small projects.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {FREE_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#0D0D0D' }}>
                <Check size={14} style={{ color: '#E84E2A', flexShrink: 0 }} strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
          <Link
            to="/signup"
            style={{ display: 'block', textAlign: 'center', padding: '12px 0', border: '1px solid #0D0D0D', borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: '#0D0D0D', textDecoration: 'none', transition: 'background 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            Get started free
          </Link>
        </motion.div>

        {/* Pro (featured) */}
        <motion.div
          style={{ position: 'relative', paddingTop: 24 }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Most popular badge */}
          <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', background: '#E84E2A', borderRadius: 999, padding: '4px 16px', whiteSpace: 'nowrap', zIndex: 1 }}>
            <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 600, fontSize: 12, color: '#FFFFFF' }}>Most Popular</span>
          </div>
          <div style={{
            background: '#0D0D0D', border: '1px solid rgba(232,78,42,0.40)', borderRadius: 24, padding: 40,
            boxShadow: '0 0 60px rgba(232,78,42,0.15), 0 24px 80px rgba(0,0,0,0.20)',
            transform: 'scale(1.04)',
          }}>
            <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: '#FFFFFF', marginBottom: 8 }}>Pro</p>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 48, color: '#FFFFFF', lineHeight: 1 }}>$49</span>
              <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: 'rgba(255,255,255,0.50)' }}>/month</span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.50)', marginBottom: 28, lineHeight: 1.6 }}>
              For teams that need the full power of DocIntel.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {PRO_FEATURES.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#FFFFFF' }}>
                  <Check size={14} style={{ color: '#E84E2A', flexShrink: 0 }} strokeWidth={2.5} />
                  {f}
                </li>
              ))}
            </ul>
            <Link
              to="/signup"
              className="cta-btn"
              style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 12, fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 14, color: '#FFFFFF', textDecoration: 'none' }}
            >
              Get started
            </Link>
          </div>
        </motion.div>

        {/* Enterprise */}
        <motion.div
          style={{ background: '#F5F2EC', border: '1px solid #E2DDD6', borderRadius: 24, padding: 40 }}
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <p style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 20, color: '#0D0D0D', marginBottom: 8 }}>Enterprise</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10, fontSize: 'inherit', transform: 'none', zoom: 'unset' }}>
            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: '48px', lineHeight: 1, color: '#0D0D0D', display: 'block' }}>Custom</span>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: '#8C8A85' }}>per month</span>
          </div>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#8C8A85', marginBottom: 28, lineHeight: 1.6 }}>
            Tailored for large organizations with custom needs.
          </p>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {ENTERPRISE_FEATURES.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: '#0D0D0D' }}>
                <Check size={14} style={{ color: '#E84E2A', flexShrink: 0 }} strokeWidth={2.5} />
                {f}
              </li>
            ))}
          </ul>
          <a
            href="#"
            style={{ display: 'block', textAlign: 'center', padding: '12px 0', border: '1px solid #0D0D0D', borderRadius: 12, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 14, color: '#0D0D0D', textDecoration: 'none', transition: 'background 0.2s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.05)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
          >
            Contact sales
          </a>
        </motion.div>
      </div>
    </section>
  )
}

// ── CTA Section ────────────────────────────────────────────────────────
function CtaSection() {
  return (
    <section
      id="cta"
      className="relative px-5 overflow-hidden text-center"
      style={{ background: 'radial-gradient(ellipse 90% 90% at 50% 60%, #1C1410 0%, #0D0D0D 65%)', padding: '100px 20px' }}
    >
      <div
        className="pointer-events-none absolute rounded-full"
        style={{ width: 700, height: 300, background: 'radial-gradient(ellipse, rgba(232,78,42,0.12) 0%, transparent 70%)', filter: 'blur(100px)', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}
        aria-hidden="true"
      />
      <DotGrid />

      <div className="relative z-10 max-w-3xl mx-auto">
        <motion.div
          className="inline-flex items-center px-5 py-2 rounded-full mb-8"
          style={{ background: 'rgba(232,78,42,0.08)', border: '1px solid rgba(232,78,42,0.28)' }}
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
        >
          <span className="text-white font-body" style={{ fontSize: 13 }}>Start for free today</span>
        </motion.div>

        <motion.h2
          className="font-display font-extrabold text-white tracking-[-0.02em] mb-6"
          style={{ fontSize: 'clamp(30px, 4.5vw, 56px)', lineHeight: 1.1 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          Ready to make your documents intelligent?
        </motion.h2>

        <motion.p
          className="text-white/55 font-body mb-10 max-w-lg mx-auto leading-relaxed"
          style={{ fontSize: 18 }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.18 }}
        >
          Join hundreds of teams already using DocIntel to extract intelligence from their document libraries.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.28 }}
        >
          <motion.div className="inline-block" whileTap={{ scale: 0.97 }}>
            <Link
              to="/signup"
              className="cta-btn inline-flex items-center gap-2.5 text-white font-display font-bold text-base rounded-2xl px-10 transition-all duration-200"
              style={{ height: 56 }}
            >
              Get started free
              <ArrowRight size={16} strokeWidth={2.5} />
            </Link>
          </motion.div>

          {/* Reassurance row */}
          <div className="flex items-center justify-center gap-6 flex-wrap mt-6">
            {['No credit card required', 'Free 14-day trial', 'Cancel anytime'].map(item => (
              <span key={item} style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.45)' }}>
                ✓ {item}
              </span>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  )
}

// ── Footer ─────────────────────────────────────────────────────────────
function Footer() {
  const FOOTER_PRODUCT   = ['Features', 'How it works', 'Pricing', 'Changelog', 'Roadmap']
  const FOOTER_COMPANY   = ['About', 'Blog', 'Careers', 'Press', 'Contact']
  const FOOTER_LEGAL     = ['Privacy Policy', 'Terms of Service', 'Cookie Policy', 'Security']

  const linkStyle = { fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.45)', textDecoration: 'none', display: 'block', padding: '4px 0', transition: 'color 0.15s' }

  return (
    <footer style={{ background: '#0A0A0A', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '64px 40px 32px' }}>
      <div className="max-w-6xl mx-auto">
        {/* Top grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          {/* Brand col */}
          <div className="col-span-2 md:col-span-1">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: '#E84E2A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 800, fontSize: 10, color: '#FFFFFF', lineHeight: 1 }}>DI</span>
              </div>
              <span style={{ fontFamily: "'Syne', sans-serif", fontWeight: 700, fontSize: 16, color: '#FFFFFF' }}>DocIntel</span>
            </div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 20, maxWidth: 220 }}>
              AI-powered document intelligence for modern teams.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              {[XIcon, Globe, Code2].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  style={{ color: 'rgba(255,255,255,0.35)', transition: 'color 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.80)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {/* Product col */}
          <div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.80)', marginBottom: 16 }}>Product</p>
            {FOOTER_PRODUCT.map(l => (
              <a key={l} href="#" style={linkStyle} onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.80)' }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}>{l}</a>
            ))}
          </div>

          {/* Company col */}
          <div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.80)', marginBottom: 16 }}>Company</p>
            {FOOTER_COMPANY.map(l => (
              <a key={l} href="#" style={linkStyle} onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.80)' }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}>{l}</a>
            ))}
          </div>

          {/* Legal col */}
          <div>
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13, color: 'rgba(255,255,255,0.80)', marginBottom: 16 }}>Legal</p>
            {FOOTER_LEGAL.map(l => (
              <a key={l} href="#" style={linkStyle} onMouseEnter={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.80)' }} onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.45)' }}>{l}</a>
            ))}
          </div>
        </div>

        {/* Bottom strip */}
        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 32, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.30)', margin: 0 }}>
            © 2026 DocIntel. All rights reserved.
          </p>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'rgba(255,255,255,0.20)', margin: 0 }}>
            Made with ❤️ for document teams
          </p>
        </div>
      </div>
    </footer>
  )
}

// ── Landing Page ───────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="landing-page">
      {/* eslint-disable-next-line react/no-unknown-property */}
      <style>{STYLES}</style>
      <Nav />
      <main>
        <HeroSection />
        <FeatureBand />
        <StatsSection />
        <TrustedBySection />
        <CapabilitiesSection />
        <HowItWorksSection />
        <TestimonialsSection />
        <PricingSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  )
}
