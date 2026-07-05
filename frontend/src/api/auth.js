import client from './client'

export const login = (email, password) => {
  const params = new URLSearchParams()
  params.append('username', email)
  params.append('password', password)
  return client.post('/auth/login', params, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  })
}

export const signup = (orgName, email, password, inviteToken = null) =>
  client.post('/auth/signup', {
    org_name: orgName || null,
    email,
    password,
    ...(inviteToken ? { invite_token: inviteToken } : {}),
  })

export const getInviteDetails = (token) =>
  client.get(`/auth/invite/${token}`)

