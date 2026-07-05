import client from './client'

export const getDocumentTables = (docId) =>
  client.get(`/documents/${docId}/tables`)

export const getTable = (tableId) =>
  client.get(`/tables/${tableId}`)

export const exportTable = (tableId, format) =>
  client.get(`/tables/${tableId}/export`, { params: { format }, responseType: 'blob' })
