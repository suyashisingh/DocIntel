export default function CircuitLines({ className = '' }) {
  return (
    <svg
      className={`pointer-events-none absolute inset-0 w-full h-full ${className}`}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      style={{ opacity: 0.04 }}
    >
      {/* Horizontal bus lines */}
      <line x1="0" y1="80"  x2="100%" y2="80"  stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="200" x2="100%" y2="200" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="340" x2="100%" y2="340" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="480" x2="100%" y2="480" stroke="currentColor" strokeWidth="1" />
      <line x1="0" y1="600" x2="100%" y2="600" stroke="currentColor" strokeWidth="1" />

      {/* Vertical bus lines */}
      <line x1="120"  y1="0" x2="120"  y2="100%" stroke="currentColor" strokeWidth="1" />
      <line x1="280"  y1="0" x2="280"  y2="100%" stroke="currentColor" strokeWidth="1" />
      <line x1="440"  y1="0" x2="440"  y2="100%" stroke="currentColor" strokeWidth="1" />

      {/* Node dots at intersections */}
      <circle cx="120" cy="80"  r="3" fill="currentColor" />
      <circle cx="280" cy="80"  r="3" fill="currentColor" />
      <circle cx="440" cy="80"  r="3" fill="currentColor" />
      <circle cx="120" cy="200" r="3" fill="currentColor" />
      <circle cx="280" cy="200" r="3" fill="currentColor" />
      <circle cx="440" cy="200" r="3" fill="currentColor" />
      <circle cx="120" cy="340" r="3" fill="currentColor" />
      <circle cx="280" cy="340" r="3" fill="currentColor" />
      <circle cx="440" cy="340" r="3" fill="currentColor" />
      <circle cx="120" cy="480" r="3" fill="currentColor" />
      <circle cx="280" cy="480" r="3" fill="currentColor" />
      <circle cx="440" cy="480" r="3" fill="currentColor" />

      {/* L-shaped traces */}
      <polyline points="120,80 180,80 180,140" fill="none" stroke="currentColor" strokeWidth="1" />
      <polyline points="280,200 350,200 350,260 400,260" fill="none" stroke="currentColor" strokeWidth="1" />
      <polyline points="440,340 380,340 380,420 440,420" fill="none" stroke="currentColor" strokeWidth="1" />
      <polyline points="120,480 200,480 200,420 280,420" fill="none" stroke="currentColor" strokeWidth="1" />

      {/* Small square IC pads */}
      <rect x="168" y="128" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="338" y="248" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x="188" y="408" width="24" height="24" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
    </svg>
  )
}
