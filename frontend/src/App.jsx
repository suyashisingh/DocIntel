import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import AppLayout from './components/layout/AppLayout'
import LandingPage from './pages/LandingPage'
import IntroAnimation from './components/effects/IntroAnimation'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import DocumentResults from './pages/DocumentResults'
import Search from './pages/Search'
import Analytics from './pages/Analytics'
import Chat from './pages/Chat'
import Team from './pages/Team'
import Compare from './pages/Compare'
import CompareResult from './pages/CompareResult'
import Roles from './pages/Roles'
import Tags from './pages/Tags'
import Activity from './pages/Activity'
import AuditLog from './pages/AuditLog'
import Settings from './pages/Settings'

function ProtectedRoute({ children }) {
  const { token } = useAuth()
  return token ? <AppLayout>{children}</AppLayout> : <Navigate to="/login" replace />
}

function AppRoutes() {
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
    <Routes location={location} key={location.pathname}>
      <Route path="/" element={<><IntroAnimation /><LandingPage /></>} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
      <Route path="/documents/:id" element={<ProtectedRoute><DocumentResults /></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Search /></ProtectedRoute>} />
      <Route path="/analytics" element={<ProtectedRoute><Analytics /></ProtectedRoute>} />
      <Route path="/chat" element={<ProtectedRoute><Chat /></ProtectedRoute>} />
      <Route path="/team" element={<ProtectedRoute><Team /></ProtectedRoute>} />
      <Route path="/compare" element={<ProtectedRoute><Compare /></ProtectedRoute>} />
      <Route path="/compare/:id" element={<ProtectedRoute><CompareResult /></ProtectedRoute>} />
      <Route path="/roles" element={<ProtectedRoute><Roles /></ProtectedRoute>} />
      <Route path="/tags" element={<ProtectedRoute><Tags /></ProtectedRoute>} />
      <Route path="/activity" element={<ProtectedRoute><Activity /></ProtectedRoute>} />
      <Route path="/audit-log" element={<ProtectedRoute><AuditLog /></ProtectedRoute>} />
      <Route path="/settings"  element={<ProtectedRoute><Settings /></ProtectedRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  )
}
