import { useCallback, useEffect, useState } from 'react'
import { Trash2, Users, Mail, Info } from 'lucide-react'
import { getMembers, inviteMember, removeMember, updateMemberRole, getPendingInvites } from '../api/organizations'
import { getRoles } from '../api/roles'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Badge } from '../components/ui/Badge'
import { Skeleton } from '../components/ui/Skeleton'
import { LockedState } from '../components/ui/LockedState'
import { isForbidden } from '../lib/http'
import { cn } from '../lib/cn'

const ROLE_DESCRIPTIONS = {
  admin: 'Full access — manage members, settings, all documents',
  analyst: 'Can upload, process, and export documents',
  viewer: 'Read-only access to documents and search',
}

const ROLE_VARIANTS = {
  admin:   'accent',
  analyst: 'info',
  viewer:  'default',
}

function RoleBadge({ role }) {
  return (
    <Badge variant={ROLE_VARIANTS[role] ?? 'default'} size="md" className="capitalize">
      {role}
    </Badge>
  )
}

export default function Team() {
  const { user } = useAuth()
  const { theme } = useTheme()
  const orgId = user?.org_id
  const isAdmin = user?.role === 'admin'

  const [members, setMembers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [forbidden, setForbidden] = useState(false)
  const [actionError, setActionError] = useState('')

  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('')
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')

  const [removingId, setRemovingId] = useState(null)
  const [changingRoleId, setChangingRoleId] = useState(null)

  const [pendingInvites, setPendingInvites] = useState([])
  const [showRoleTooltip, setShowRoleTooltip] = useState(false)

  const fetchPendingInvites = useCallback(() => {
    if (!orgId || !isAdmin) return
    getPendingInvites(orgId)
      .then(({ data }) => setPendingInvites(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [orgId, isAdmin])

  const fetchMembers = useCallback(() => {
    if (!orgId) return
    setLoading(true)
    setFetchError('')
    getMembers(orgId)
      .then(({ data }) => {
        setMembers(Array.isArray(data) ? data : [])
        fetchPendingInvites()
      })
      .catch((err) => {
        if (isForbidden(err)) setForbidden(true)
        else setFetchError('Could not load team members.')
      })
      .finally(() => setLoading(false))
  }, [orgId, fetchPendingInvites])

  useEffect(() => { fetchMembers() }, [fetchMembers])

  useEffect(() => {
    if (!isAdmin) return
    getRoles()
      .then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        const PREFERRED_ORDER = ['viewer', 'analyst', 'admin']
        const sorted = [
          ...PREFERRED_ORDER.map((name) => list.find((r) => r.name === name)).filter(Boolean),
          ...list.filter((r) => !PREFERRED_ORDER.includes(r.name)),
        ]
        setRoles(sorted)
        setInviteRole((prev) => {
          if (prev) return prev
          const viewer = sorted.find((r) => r.name === 'viewer')
          return viewer ? viewer.name : (sorted[0]?.name ?? '')
        })
      })
      .catch(() => {})
  }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setInviteError('')
    setInviteSuccess('')
    try {
      await inviteMember(orgId, inviteEmail, inviteRole)
      setInviteSuccess(`Invite sent to ${inviteEmail}.`)
      setInviteEmail('')
      fetchMembers()
    } catch (err) {
      setInviteError(err.response?.data?.detail || 'Failed to add member.')
    } finally {
      setInviting(false)
    }
  }

  async function handleRemove(userId) {
    setRemovingId(userId)
    setActionError('')
    try {
      await removeMember(orgId, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to remove member.')
    } finally {
      setRemovingId(null)
    }
  }

  async function handleRoleChange(userId, newRole) {
    setChangingRoleId(userId)
    setActionError('')
    try {
      await updateMemberRole(orgId, userId, newRole)
      setMembers((prev) => prev.map((m) => (m.user_id === userId ? { ...m, role: newRole } : m)))
    } catch (err) {
      setActionError(err.response?.data?.detail || 'Failed to update role.')
    } finally {
      setChangingRoleId(null)
    }
  }

  const inputCls = 'px-3.5 py-2.5 text-sm font-body bg-paper border border-border rounded-xl text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all'

  const roleCounts = members.reduce((acc, m) => {
    acc[m.role] = (acc[m.role] || 0) + 1
    return acc
  }, {})

  const permDenied = !loading && (forbidden || user?.permissions?.team?.view === false)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-display-md text-ink tracking-tight">Team</h1>
          {!permDenied && (
            <p className="mt-1 text-sm text-muted font-body">
              {members.length} member{members.length !== 1 ? 's' : ''} in your organization
            </p>
          )}
        </div>
      </div>

      {permDenied ? (
        <div className="bg-surface border border-border rounded-xl">
          <LockedState />
        </div>
      ) : (
      <>
      {/* Two-column grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

        {/* Left column — invite form + members + pending invites */}
        <div className="md:col-span-2 space-y-8">

          {/* Invite form */}
          {isAdmin && (
            <div className="bg-surface border border-border rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-7 h-7 rounded-lg bg-paper border border-border flex items-center justify-center">
                  <Mail size={13} strokeWidth={1.75} className="text-muted" />
                </div>
                <h2 className="font-display text-sm font-semibold text-ink">Invite member</h2>
              </div>
              <form onSubmit={handleInvite} className="flex gap-3 items-end flex-wrap">
                <div className="flex-1 min-w-48">
                  <label className="block text-xs font-medium text-muted font-body mb-1.5">
                    Email address
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    className={cn(inputCls, 'w-full')}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1 text-xs font-medium text-muted font-body mb-1.5">
                    Role
                    <div
                      className="relative inline-flex"
                      onMouseEnter={() => setShowRoleTooltip(true)}
                      onMouseLeave={() => setShowRoleTooltip(false)}
                    >
                      <Info size={12} strokeWidth={1.75} className="text-muted/60 cursor-default" />
                      {showRoleTooltip && (
                        <div className="absolute left-5 top-0 z-50 w-64 bg-surface border border-border rounded-xl shadow-lg p-3 text-xs font-body">
                          {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
                            <div key={role} className="mb-2 last:mb-0">
                              <span className="font-semibold capitalize text-ink">{role}</span>
                              <p className="text-muted mt-0.5 leading-relaxed">{desc}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className={cn(inputCls)}
                  >
                    {roles.map((r) => (
                      <option key={r.id} value={r.name}>
                        {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="submit"
                  disabled={inviting || !inviteRole}
                  className="px-5 py-2.5 text-sm font-semibold font-body bg-ink text-surface rounded-xl hover:bg-ink/90 active:scale-[0.98] disabled:opacity-50 transition-all"
                >
                  {inviting ? 'Sending…' : 'Send invite'}
                </button>
              </form>

              {inviteError && (
                <div className="mt-3 flex items-center gap-2 text-xs text-red-600 font-body bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                  <span>⚠</span> {inviteError}
                </div>
              )}
              {inviteSuccess && (
                <div className="mt-3 flex items-center gap-2 text-xs text-emerald-700 font-body bg-emerald-50 border border-emerald-200 rounded-xl px-3.5 py-2.5">
                  <span>✓</span> {inviteSuccess}
                </div>
              )}
            </div>
          )}

          {/* Members table */}
          <div className="bg-surface border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="font-display text-sm font-semibold text-ink">Members</h2>
              <span className="text-xs text-muted font-body tabular-nums">{members.length} total</span>
            </div>

            {actionError && (
              <div className="mx-5 mt-4 text-xs text-red-600 font-body bg-red-50 border border-red-200 rounded-xl px-3.5 py-2.5">
                {actionError}
              </div>
            )}

            {loading && (
              <div>
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-5 py-4 border-b border-border last:border-0">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-48" />
                      <Skeleton className="h-3 w-24" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
            )}

            {fetchError && (
              <div className="px-5 py-10 text-center text-sm text-red-600 font-body">{fetchError}</div>
            )}

            {!loading && !fetchError && members.length === 0 && (
              <div className="px-5 py-16 text-center">
                <div className="w-10 h-10 rounded-xl bg-paper border border-border flex items-center justify-center mx-auto mb-3">
                  <Users size={16} strokeWidth={1.5} className="text-muted" />
                </div>
                <p className="text-sm font-semibold text-ink font-display mb-1">No members yet</p>
                <p className="text-xs text-muted font-body">Invite your team using the form above.</p>
              </div>
            )}

            {!loading && !fetchError && members.length > 0 && (
              <table className="w-full text-sm font-body">
                <thead>
                  <tr className="border-b border-border bg-paper/40 text-left">
                    <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Member</th>
                    <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Role</th>
                    <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Joined</th>
                    <th className="px-5 py-3 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => {
                    const isSelf = m.user_id === user?.id
                    const initials = m.email ? m.email.slice(0, 2).toUpperCase() : '?'
                    return (
                      <tr key={m.user_id} className="group border-b border-border last:border-0 hover:bg-paper/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-paper border border-border flex items-center justify-center shrink-0">
                              <span className="text-[10px] font-semibold text-ink font-mono">{initials}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-ink font-body">
                                {m.email}
                                {isSelf && <span className="ml-2 text-xs text-muted font-normal">(you)</span>}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          {isAdmin && !isSelf && roles.length > 0 ? (
                            <select
                              value={m.role}
                              onChange={(e) => handleRoleChange(m.user_id, e.target.value)}
                              disabled={changingRoleId === m.user_id}
                              className="text-xs font-body bg-paper border border-border rounded-lg px-2.5 py-1.5 text-ink focus:outline-none focus:ring-1 focus:ring-accent/30 disabled:opacity-60 transition"
                            >
                              {!roles.find((r) => r.name === m.role) && (
                                <option value={m.role} disabled>{m.role} (unknown)</option>
                              )}
                              {roles.map((r) => (
                                <option key={r.id} value={r.name}>
                                  {r.name.charAt(0).toUpperCase() + r.name.slice(1)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <RoleBadge role={m.role} />
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-xs text-muted font-mono tabular-nums">
                          {m.joined_at ? new Date(m.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          {isAdmin && !isSelf && (
                            <button
                              onClick={() => handleRemove(m.user_id)}
                              disabled={removingId === m.user_id}
                              className="p-1.5 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 disabled:opacity-40 transition-colors opacity-0 group-hover:opacity-100"
                              title="Remove member"
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Pending Invitations */}
          {isAdmin && (
            <div className="bg-surface border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <h2 className="font-display text-sm font-semibold text-ink">Pending Invitations</h2>
                {pendingInvites.length > 0 && (
                  <span className="text-xs text-muted font-body tabular-nums">{pendingInvites.length} pending</span>
                )}
              </div>
              {pendingInvites.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-xs text-muted font-body">No pending invitations</p>
                </div>
              ) : (
                <table className="w-full text-sm font-body">
                  <thead>
                    <tr className="border-b border-border bg-paper/40 text-left">
                      <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Email</th>
                      <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Role</th>
                      <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Sent</th>
                      <th className="px-5 py-3 text-label text-muted uppercase tracking-[0.07em]">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingInvites.map((inv) => (
                      <tr key={inv.id} className="border-b border-border last:border-0">
                        <td className="px-5 py-3.5 text-sm text-ink">{inv.email}</td>
                        <td className="px-5 py-3.5"><RoleBadge role={inv.role} /></td>
                        <td className="px-5 py-3.5 text-xs text-muted font-mono tabular-nums">
                          {inv.created_at
                            ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : '—'}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold"
                            style={theme === 'light'
                              ? { background: 'rgba(107,78,255,0.12)', color: '#6B4EFF', border: '1px solid rgba(107,78,255,0.40)' }
                              : { background: 'rgba(234,179,8,0.10)', color: '#facc15', border: '1px solid rgba(250,204,21,0.25)' }
                            }
                          >
                            Pending
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar — Team overview */}
        <div className="md:col-span-1">
          <div className="bg-surface border border-border rounded-xl p-6 space-y-5 sticky top-6">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-paper border border-border flex items-center justify-center">
                <Users size={13} strokeWidth={1.75} className="text-muted" />
              </div>
              <h2 className="font-display text-sm font-semibold text-ink">Team overview</h2>
            </div>

            <div>
              <p className="text-xs text-muted font-body mb-1">Total members</p>
              <p className="text-2xl font-display font-semibold text-ink tabular-nums">{members.length}</p>
            </div>

            {Object.keys(roleCounts).length > 0 && (
              <div>
                <p className="text-[10px] text-muted font-body uppercase tracking-[0.07em] mb-2">By role</p>
                <div className="space-y-1.5">
                  {Object.entries(roleCounts).map(([role, count]) => (
                    <div key={role} className="flex items-center justify-between">
                      <span className="text-xs font-body text-ink capitalize">{role}</span>
                      <span className="text-xs font-mono font-semibold text-ink tabular-nums">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] text-muted font-body uppercase tracking-[0.07em] mb-2">Role guide</p>
              <div className="space-y-3">
                {Object.entries(ROLE_DESCRIPTIONS).map(([role, desc]) => (
                  <div key={role}>
                    <p className="text-xs font-semibold text-ink font-display capitalize">{role}</p>
                    <p className="text-[11px] text-muted font-body mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

      </div>
      </>
      )}
    </div>
  )
}
