import client from './client'

export const createComparison = (docAId, docBId, mode) =>
  client.post('/comparisons', { doc_a_id: docAId, doc_b_id: docBId, mode })

export const getComparison = (id) =>
  client.get(`/comparisons/${id}`)

export const listComparisons = (params = {}) =>
  client.get('/comparisons', { params })
