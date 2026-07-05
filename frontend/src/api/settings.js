import client from './client'

export const updateProfile     = (data)         => client.patch('/users/me', data)
export const changePassword    = (data)         => client.patch('/users/me/password', data)
export const deleteAccount     = ()             => client.delete('/users/me')
export const getOrg            = (orgId)        => client.get(`/organizations/${orgId}`)
export const updateOrg         = (orgId, data)  => client.patch(`/organizations/${orgId}`, data)
export const leaveOrg          = (orgId)        => client.post(`/organizations/${orgId}/leave`)
