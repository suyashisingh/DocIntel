import client from './client'

export const getAuditLogs = (params = {}) =>
  client.get('/audit-logs', { params })

export const exportAuditLogs = (params = {}) =>
  client.get('/audit-logs/export', { params, responseType: 'blob' })
