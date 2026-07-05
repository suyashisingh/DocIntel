import client from './client'

export const getNotifications = (offset = 0, limit = 20) =>
  client.get('/notifications', { params: { offset, limit } })

export const markAllRead = () =>
  client.put('/notifications/read-all')

export const markOneRead = (id) =>
  client.put(`/notifications/${id}/read`)

export const deleteNotification = (id) =>
  client.delete(`/notifications/${id}`)
