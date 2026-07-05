import client from './client'

export const uploadDocument = (orgId, files, onProgress) => {
  const form = new FormData()
  const fileArray = Array.isArray(files) ? files : [files]
  fileArray.forEach((f) => form.append('files', f))
  return client.post(`/documents/${orgId}/upload`, form, {
    onUploadProgress: (e) => {
      if (onProgress && e.total) {
        onProgress(Math.round((e.loaded * 100) / e.total))
      }
    },
  })
}

export const bulkDelete = (documentIds) =>
  client.post('/documents/bulk-delete', { document_ids: documentIds })

export const bulkReprocess = (orgId, documentIds) =>
  client.post('/documents/bulk-reprocess', { document_ids: documentIds }, { params: { org_id: orgId } })

export const bulkExport = (documentIds, format) =>
  client.post('/documents/bulk-export', { document_ids: documentIds, format }, { responseType: 'blob' })

const documentListParamsSerializer = (params) => (p) => {
  const { tag_ids, tag_ids_any } = params
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v != null) search.append(k, v)
  }
  if (tag_ids?.length) tag_ids.forEach((id) => search.append('tag_ids', id))
  if (tag_ids_any?.length) tag_ids_any.forEach((id) => search.append('tag_ids_any', id))
  return search.toString()
}

export const listDocuments = (orgId, params = {}) => {
  const { tag_ids, tag_ids_any, ...rest } = params
  return client.get(`/documents/${orgId}`, {
    params: rest,
    paramsSerializer: documentListParamsSerializer(params),
  })
}

export const countDocuments = (orgId, params = {}) => {
  const { tag_ids, tag_ids_any, ...rest } = params
  return client.get(`/documents/${orgId}/count`, {
    params: rest,
    paramsSerializer: documentListParamsSerializer(params),
  })
}

export const getDocument = (docId) =>
  client.get(`/documents/results/${docId}`)

export const getDocumentVersions = (docId) =>
  client.get(`/documents/results/${docId}/versions`)

export const reprocessDocument = (orgId, docId) =>
  client.post(`/documents/${orgId}/${docId}/reprocess`)

export const deleteDocument = (orgId, docId) =>
  client.delete(`/documents/${orgId}/${docId}`)

export const downloadDocument = (documentId) =>
  client.get(`/documents/${documentId}/download`, { responseType: 'blob' })

export const getDocumentQAHistory = (docId, limit = 10, offset = 0) =>
  client.get(`/documents/${docId}/qa-history`, { params: { limit, offset } })

export const setRetention = (docId, data) =>
  client.put(`/documents/${docId}/retention`, data)

export const getExpiringSoon = (orgId, days = 7) =>
  client.get('/documents/expiring-soon', { params: { org_id: orgId, days } })

export const scanDocumentPII = (docId) =>
  client.get(`/documents/${docId}/pii`)

export const redactDocumentPII = (docId, piiTypes) =>
  client.post(`/documents/${docId}/redact`, { pii_types: piiTypes })
