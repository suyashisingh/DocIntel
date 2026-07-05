import client from './client'

export const listFolders = (orgId) => client.get(`/folders/${orgId}`)
export const createFolder = (orgId, data) => client.post(`/folders/${orgId}`, data)
export const updateFolder = (orgId, folderId, data) => client.put(`/folders/${orgId}/${folderId}`, data)
export const deleteFolder = (orgId, folderId) => client.delete(`/folders/${orgId}/${folderId}`)
export const addDocToFolder = (orgId, folderId, docId) =>
  client.post(`/folders/${orgId}/${folderId}/documents/${docId}`)
export const removeDocFromFolder = (orgId, folderId, docId) =>
  client.delete(`/folders/${orgId}/${folderId}/documents/${docId}`)
