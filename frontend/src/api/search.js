import client from './client'

export const searchDocuments = (orgId, query, filters = {}) => {
  const { tag_ids, ...rest } = filters
  const base = { org_id: orgId, entity: query }
  if (rest.doc_type) base.document_type = rest.doc_type
  if (rest.date_from) base.date_from = rest.date_from
  if (rest.date_to) base.date_to = rest.date_to
  return client.get('/documents/search', {
    params: base,
    paramsSerializer: (p) => {
      const search = new URLSearchParams()
      for (const [k, v] of Object.entries(p)) {
        if (v != null) search.append(k, v)
      }
      if (tag_ids?.length) tag_ids.forEach((id) => search.append('tag_ids', id))
      return search.toString()
    },
  })
}
