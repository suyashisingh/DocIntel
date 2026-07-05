import client from './client'

export const getMembers = (orgId) => client.get(`/organizations/${orgId}/members`)
export const inviteMember = (orgId, email, role) =>
  client.post(`/organizations/${orgId}/invite`, { email, role })
export const removeMember = (orgId, userId) =>
  client.delete(`/organizations/${orgId}/members/${userId}`)
export const updateMemberRole = (orgId, userId, role) =>
  client.put(`/organizations/${orgId}/members/${userId}/role`, { role })
export const getPendingInvites = (orgId) => client.get(`/organizations/${orgId}/invites`)
