import client from './client'

export const queryChat = (question, documentId = null) =>
  client.post('/chat/query', {
    question,
    ...(documentId != null ? { document_id: documentId } : {}),
  })

export const getChatHistory = (documentId = null, limit = 20) =>
  client.get('/chat/history', {
    params: {
      ...(documentId != null ? { document_id: documentId } : {}),
      limit,
    },
  })
