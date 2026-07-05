import client from './client'

export const listTags = (orgId) =>
  client.get('/tags', { params: { org_id: orgId } })

export const createTag = (orgId, data) =>
  client.post('/tags', data, { params: { org_id: orgId } })

export const updateTag = (orgId, tagId, data) =>
  client.put(`/tags/${tagId}`, data, { params: { org_id: orgId } })

export const deleteTag = (orgId, tagId) =>
  client.delete(`/tags/${tagId}`, { params: { org_id: orgId } })

export const getDocumentTags = (docId) =>
  client.get(`/documents/${docId}/tags`)

export const addTagToDocument = (docId, tagId) =>
  client.post(`/documents/${docId}/tags`, { tag_id: tagId })

export const removeTagFromDocument = (docId, tagId) =>
  client.delete(`/documents/${docId}/tags/${tagId}`)
