import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import {
  changePassword, deleteAccount, getOrg, leaveOrg,
  updateOrg, updateProfile,
} from '../api/settings'
import { validatePassword } from '../utils/passwordUtils'

// ── Reusable primitives ───────────────────────────────────────────────────────

const cardCls = 'bg-surface border border-border rounded-xl p-6'
const inputCls = 'w-full px-3.5 py-2.5 text-sm font-body rounded-xl transition-all outline-none bg-paper border border-border text-ink placeholder:text-muted focus:ring-2 focus:ring-accent/20 focus:border-accent/50'
const labelCls = 'block text-xs font-medium text-muted font-body mb-1.5'
const sectionHeadingCls = 'font-display text-base font-semibold text-ink mb-0.5'
const sectionSubCls = 'text-sm text-muted font-body mb-5'

function SectionHeader({ title, subtitle }) {
  return (
    <div className="mb-5">
      <h2 className={sectionHeadingCls}>{title}</h2>
      {subtitle && <p className={sectionSubCls}>{subtitle}</p>}
    </div>
  )
}

function SaveRow({ onSave, saving, feedback, label = 'Save' }) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <button
        onClick={onSave}
        disabled={saving}
        className="px-4 py-2 text-sm font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
      >
        {saving ? 'Saving…' : label}
      </button>
      {feedback && (
        <span className={`text-xs font-body ${feedback.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
          {feedback.msg}
        </span>
      )}
    </div>
  )
}

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${checked ? 'bg-ink' : 'bg-border'} cursor-pointer`}
    >
      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
    </button>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl border border-border overflow-hidden">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-4 py-2 text-sm font-body transition-colors ${
            value === opt.value
              ? 'bg-ink text-surface font-semibold'
              : 'bg-paper text-muted hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// ── Feedback helpers ──────────────────────────────────────────────────────────

function useFeedback() {
  const [fb, setFb] = useState(null)
  const timerRef = useRef(null)

  function show(msg, type = 'success') {
    clearTimeout(timerRef.current)
    setFb({ msg, type })
    timerRef.current = setTimeout(() => setFb(null), 4000)
  }

  return [fb, show]
}

// ── Confirmation modal ────────────────────────────────────────────────────────

function ConfirmModal({ title, description, onConfirm, onCancel, confirmLabel = 'Confirm', danger = true, requireTyping = null }) {
  const [typed, setTyped] = useState('')
  const canConfirm = requireTyping ? typed === requireTyping : true

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel() }}
    >
      <div className="w-full max-w-md bg-surface border border-border rounded-2xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-display text-base font-semibold text-ink">{title}</h3>
          <button onClick={onCancel} className="p-1 text-muted hover:text-ink transition-colors shrink-0">
            <X size={16} strokeWidth={2} />
          </button>
        </div>
        <p className="text-sm text-muted font-body mb-4">{description}</p>
        {requireTyping && (
          <div className="mb-4">
            <label className={labelCls}>
              Type <span className="font-mono text-ink">{requireTyping}</span> to confirm
            </label>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              className={inputCls}
              placeholder={requireTyping}
            />
          </div>
        )}
        <div className="flex justify-end gap-2.5">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-body text-muted hover:text-ink transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 text-sm font-semibold font-body rounded-xl disabled:opacity-40 transition-all ${
              danger
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-ink text-surface hover:bg-ink/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

const THEME_OPTIONS = [{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'System' }]

const SETTINGS_TABS = [
  { key: 'account',    label: 'Account' },
  { key: 'workspace',  label: 'Workspace' },
  { key: 'appearance', label: 'Appearance' },
  { key: 'danger',     label: 'Danger Zone' },
]

export default function Settings() {
  const { user, logout, refreshUser } = useAuth()
  const { setTheme } = useTheme()
  const navigate = useNavigate()
  const isAdmin = user?.role === 'admin'

  // ── Navigation ──
  const [activeTab, setActiveTab] = useState('account')

  // ── Account ──
  const [displayName, setDisplayName]   = useState(user?.display_name || '')
  const [email, setEmail]               = useState(user?.email || '')
  const [currentPass, setCurrentPass]   = useState('')
  const [newPass, setNewPass]           = useState('')
  const [confirmPass, setConfirmPass]   = useState('')
  const [showCurrentPass, setShowCurrentPass] = useState(false)
  const [showNewPass, setShowNewPass]   = useState(false)
  // Consolidated account save (display name + email)
  const [savingAccount, setSavingAccount] = useState(false)
  const [fbAccount, showFbAccount]         = useFeedback()
  // Password keeps its own save state
  const [savingPass, setSavingPass]     = useState(false)
  const [fbPass, showFbPass]             = useFeedback()

  // ── Workspace ──
  const [orgName, setOrgName]           = useState('')
  const [orgNameOrig, setOrgNameOrig]   = useState('')
  const [orgLoading, setOrgLoading]     = useState(true)
  const [savingOrg, setSavingOrg]       = useState(false)
  const [fbOrg, showFbOrg]               = useFeedback()

  // ── Appearance ──
  const [theme, setThemeRaw] = useState(() => localStorage.getItem('theme_preference') || 'dark')
  const [fbAppearance, showFbAppearance] = useFeedback()

  // Sync theme state → <html data-theme="…"> on mount and on every change.
  useEffect(() => {
    const resolved = theme === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : theme
    document.documentElement.setAttribute('data-theme', resolved)
  }, [theme])

  // ── Danger zone ──
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showLeaveModal,  setShowLeaveModal]  = useState(false)
  const [dangerLoading, setDangerLoading]     = useState(false)
  const [fbDanger, showFbDanger]               = useFeedback()

  // Load org details
  useEffect(() => {
    if (!user?.org_id) return
    setOrgLoading(true)
    getOrg(user.org_id)
      .then(({ data }) => { setOrgName(data.name); setOrgNameOrig(data.name) })
      .catch(() => {})
      .finally(() => setOrgLoading(false))
  }, [user?.org_id])

  // Sync fields if user context updates (e.g. after refreshUser)
  useEffect(() => { if (user?.email) setEmail(user.email) }, [user?.email])
  useEffect(() => { setDisplayName(user?.display_name || '') }, [user?.display_name])

  // ── Handlers: Account ──

  async function handleSaveAccount() {
    const emailOrig       = user?.email || ''
    const displayNameOrig = user?.display_name || ''
    const emailChanged       = email.trim() !== '' && email.trim() !== emailOrig
    const displayNameChanged = displayName.trim() !== displayNameOrig

    if (!displayNameChanged && !emailChanged) {
      showFbAccount('No changes to save', 'error')
      return
    }

    const payload = {}
    if (emailChanged) payload.email = email.trim()
    if (displayNameChanged) payload.display_name = displayName.trim()

    setSavingAccount(true)
    try {
      await updateProfile(payload)
      await refreshUser()
      showFbAccount(emailChanged ? 'Account updated — log in again to refresh your session' : 'Account updated')
    } catch (err) {
      showFbAccount(err.response?.data?.detail || 'Failed to update account', 'error')
    } finally {
      setSavingAccount(false)
    }
  }

  async function handleSavePassword() {
    if (!currentPass || !newPass || !confirmPass) {
      showFbPass('All password fields are required', 'error')
      return
    }
    if (newPass !== confirmPass) {
      showFbPass('New passwords do not match', 'error')
      return
    }
    if (!validatePassword(newPass).every(r => r.passed)) {
      showFbPass('Password is too weak — see requirements below', 'error')
      return
    }
    setSavingPass(true)
    try {
      await changePassword({ current_password: currentPass, new_password: newPass })
      showFbPass('Password updated')
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    } catch (err) {
      showFbPass(err.response?.data?.detail || 'Failed to update password', 'error')
    } finally {
      setSavingPass(false)
    }
  }

  // ── Handlers: Workspace ──

  async function handleSaveOrg() {
    if (!orgName.trim()) { showFbOrg('Name cannot be empty', 'error'); return }
    if (orgName.trim() === orgNameOrig) { showFbOrg('No changes to save', 'error'); return }
    setSavingOrg(true)
    try {
      const { data } = await updateOrg(user.org_id, { name: orgName.trim() })
      setOrgNameOrig(data.name)
      showFbOrg('Organisation name updated')
    } catch (err) {
      showFbOrg(err.response?.data?.detail || 'Failed to update name', 'error')
    } finally {
      setSavingOrg(false)
    }
  }

  // ── Handlers: Appearance ──

  function handleThemeChange(val) {
    setThemeRaw(val)
    localStorage.setItem('theme_preference', val)
    setTheme(val)
    showFbAppearance('Theme preference saved')
  }

  // ── Handlers: Danger Zone ──

  async function handleDeleteAccount() {
    setDangerLoading(true)
    setShowDeleteModal(false)
    try {
      await deleteAccount()
      logout()
      navigate('/login')
    } catch (err) {
      showFbDanger(err.response?.data?.detail || 'Failed to delete account', 'error')
    } finally {
      setDangerLoading(false)
    }
  }

  async function handleLeaveOrg() {
    setDangerLoading(true)
    setShowLeaveModal(false)
    try {
      await leaveOrg(user.org_id)
      logout()
      navigate('/login')
    } catch (err) {
      showFbDanger(err.response?.data?.detail || 'Failed to leave organisation', 'error')
    } finally {
      setDangerLoading(false)
    }
  }

  const initials = user?.email ? user.email.slice(0, 2).toUpperCase() : '?'

  return (
    <div className="flex flex-row min-h-full">

      {/* ── Left nav column ───────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 pr-2">
        <p className="text-[10px] tracking-widest mb-2 px-3 uppercase font-body" style={{ color: '#8C8A85' }}>
          Settings
        </p>
        {SETTINGS_TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className="block w-full text-left px-3 py-1.5 rounded-md text-sm font-body transition-colors"
              style={{
                color: isActive ? '#F5F2EC' : '#8C8A85',
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                fontWeight: isActive ? 500 : 400,
              }}
              onMouseEnter={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#F5F2EC'
                  e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
                }
              }}
              onMouseLeave={e => {
                if (!isActive) {
                  e.currentTarget.style.color = '#8C8A85'
                  e.currentTarget.style.background = 'transparent'
                }
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* ── Vertical divider ─────────────────────────────────────────── */}
      <div className="self-stretch mx-2" style={{ borderLeft: '1px solid rgba(255,255,255,0.08)' }} />

      {/* ── Right content column ─────────────────────────────────────── */}
      <div className="flex-1 pl-8 pr-6 pb-16">

        {/* ── A: Account ────────────────────────────────────────────── */}
        {activeTab === 'account' && (
          <>
            <h2 className="text-lg font-semibold font-display mb-1" style={{ color: '#F5F2EC' }}>Account</h2>
            <p className="text-sm font-body mb-6" style={{ color: '#8C8A85' }}>Manage your personal details and security.</p>

            {/* Avatar */}
            <div className="flex items-center gap-4 pb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="w-14 h-14 rounded-full bg-[rgba(232,78,42,0.15)] border border-[rgba(232,78,42,0.25)] flex items-center justify-center shrink-0">
                <span className="font-mono text-lg font-semibold text-[#E84E2A]">{initials}</span>
              </div>
              <div>
                <p className="text-sm font-medium text-ink font-body">{user?.email}</p>
                <p className="text-xs text-muted font-body capitalize mt-0.5">{user?.role || 'member'}</p>
                <button
                  className="mt-2 text-xs font-body text-muted cursor-not-allowed opacity-50"
                  disabled
                >
                  Upload photo — coming soon
                </button>
              </div>
            </div>

            {/* Display name */}
            <div className="mt-8 mb-5">
              <label className={labelCls}>Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your preferred name"
                className={inputCls}
              />
              <p className="text-sm font-body mt-1" style={{ color: '#8C8A85' }}>
                Visible to your team members.
              </p>
            </div>

            {/* Email */}
            <div className="mt-6 mb-5">
              <label className={labelCls}>Email address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={inputCls}
              />
              <p className="text-sm font-body mt-1" style={{ color: '#8C8A85' }}>
                A verification email will be sent to confirm this change.
              </p>
            </div>

            {/* Save display name + email */}
            <div className="mt-2 mb-8">
              <SaveRow onSave={handleSaveAccount} saving={savingAccount} feedback={fbAccount} label="Save changes" />
            </div>

            {/* Change password */}
            <div className="pt-6" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-sm font-semibold text-ink font-body mb-3">Change password</p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Current password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPass ? 'text' : 'password'}
                      value={currentPass}
                      onChange={(e) => setCurrentPass(e.target.value)}
                      className={`${inputCls} pr-10`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                    >
                      {showCurrentPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>New password</label>
                  <div className="relative">
                    <input
                      type={showNewPass ? 'text' : 'password'}
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className={`${inputCls} pr-10`}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPass((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink transition-colors"
                    >
                      {showNewPass ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  {newPass && (() => {
                    const rules = validatePassword(newPass)
                    const passed = rules.filter(r => r.passed).length
                    return (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-2">
                          {rules.map((_, i) => (
                            <div key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i < passed ? '#22c55e' : '#333', transition: 'background 0.2s' }} />
                          ))}
                        </div>
                        <div className="space-y-0.5">
                          {rules.map((rule, i) => (
                            <p key={i} className="text-xs font-body flex items-center gap-1.5" style={{ color: rule.passed ? '#22c55e' : '#ef4444' }}>
                              <span className="font-mono">{rule.passed ? '✓' : '✗'}</span>
                              {rule.message}
                            </p>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <label className={labelCls}>Confirm new password</label>
                  <input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    className={inputCls}
                    placeholder="••••••••"
                  />
                  {confirmPass && (
                    <p className="text-xs font-body mt-1 flex items-center gap-1.5" style={{ color: confirmPass === newPass ? '#22c55e' : '#ef4444' }}>
                      <span className="font-mono">{confirmPass === newPass ? '✓' : '✗'}</span>
                      {confirmPass === newPass ? 'Passwords match' : 'Passwords don\'t match'}
                    </p>
                  )}
                </div>
              </div>
              <SaveRow onSave={handleSavePassword} saving={savingPass} feedback={fbPass} label="Update password" />
            </div>
          </>
        )}

        {/* ── B: Workspace ──────────────────────────────────────────── */}
        {activeTab === 'workspace' && (
          <>
            <h2 className="text-lg font-semibold font-display mb-1" style={{ color: '#F5F2EC' }}>Workspace</h2>
            <p className="text-sm font-body mb-6" style={{ color: '#8C8A85' }}>
              {isAdmin ? 'Manage your organisation settings.' : 'Your organisation details.'}
            </p>
            <div>
              <label className={labelCls}>Organisation name</label>
              {orgLoading ? (
                <div className="h-10 bg-border/40 rounded-xl animate-pulse" />
              ) : isAdmin ? (
                <>
                  <input
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    className={inputCls}
                  />
                  <SaveRow onSave={handleSaveOrg} saving={savingOrg} feedback={fbOrg} />
                </>
              ) : (
                <p className="text-sm text-ink font-body px-3.5 py-2.5 bg-paper border border-border rounded-xl">
                  {orgName || '—'}
                </p>
              )}
            </div>
          </>
        )}

        {/* ── D: Appearance ─────────────────────────────────────────── */}
        {activeTab === 'appearance' && (
          <>
            <h2 className="text-lg font-semibold font-display mb-1" style={{ color: '#F5F2EC' }}>Appearance</h2>
            <p className="text-sm font-body mb-6" style={{ color: '#8C8A85' }}>Personalise how DocIntel looks on this device.</p>

            <div className="mb-8">
              <p className="text-sm font-medium text-ink font-body mb-2">Theme</p>
              <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={handleThemeChange} />
            </div>

            {fbAppearance && (
              <p className={`mt-3 text-xs font-body ${fbAppearance.type === 'error' ? 'text-red-500' : 'text-emerald-500'}`}>
                {fbAppearance.msg}
              </p>
            )}
          </>
        )}

        {/* ── E: Danger Zone ────────────────────────────────────────── */}
        {activeTab === 'danger' && (
          <>
            <h2 className="text-lg font-semibold font-display mb-1" style={{ color: '#F5F2EC' }}>Danger Zone</h2>
            <p className="text-sm font-body mb-6" style={{ color: '#8C8A85' }}>These actions are permanent and cannot be undone.</p>

            {fbDanger && (
              <div className={`mb-6 text-xs font-body px-3.5 py-2.5 rounded-xl border ${fbDanger.type === 'error' ? 'text-red-500 bg-red-50 border-red-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200'}`}>
                {fbDanger.msg}
              </div>
            )}

            <div className="flex items-start justify-between gap-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-sm font-semibold text-ink font-body">Leave organisation</p>
                <p className="text-xs text-muted font-body mt-0.5">
                  Remove yourself from <span className="text-ink">{orgNameOrig || 'this organisation'}</span>. You will lose access immediately.
                </p>
              </div>
              <button
                onClick={() => setShowLeaveModal(true)}
                disabled={dangerLoading}
                className="shrink-0 px-3.5 py-2 text-sm font-medium font-body text-red-500 border border-red-500/30 rounded-xl hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                Leave org
              </button>
            </div>

            <div className="flex items-start justify-between gap-4 py-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <p className="text-sm font-semibold text-ink font-body">Delete account</p>
                <p className="text-xs text-muted font-body mt-0.5">
                  Permanently delete your account and all associated data. This cannot be reversed.
                </p>
              </div>
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={dangerLoading}
                className="shrink-0 px-3.5 py-2 text-sm font-medium font-body text-red-500 border border-red-500/30 rounded-xl hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                Delete account
              </button>
            </div>
          </>
        )}

      </div>

      {/* Modals — always mounted regardless of active section */}
      {showLeaveModal && (
        <ConfirmModal
          title="Leave organisation?"
          description={`You will immediately lose access to ${orgNameOrig || 'this organisation'} and all its documents. This cannot be undone.`}
          confirmLabel="Leave organisation"
          onConfirm={handleLeaveOrg}
          onCancel={() => setShowLeaveModal(false)}
        />
      )}

      {showDeleteModal && (
        <ConfirmModal
          title="Delete your account?"
          description="This will permanently delete your account and remove you from all organisations. All your data will be lost."
          confirmLabel="Delete my account"
          requireTyping="DELETE"
          onConfirm={handleDeleteAccount}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </div>
  )
}
