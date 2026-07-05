import client from './client'

export const getAnalytics = async (orgId) => {
  const [summary, docTypes, uploadTrend, entityFreq] = await Promise.all([
    client.get(`/analytics/${orgId}/summary`),
    client.get(`/analytics/${orgId}/document-types`),
    client.get(`/analytics/${orgId}/upload-trend`),
    client.get(`/analytics/${orgId}/entity-frequency`),
  ])

  const document_type_breakdown = Object.fromEntries(
    docTypes.data.map(({ document_type, count }) => [document_type ?? 'unknown', count])
  )

  return {
    data: {
      ...summary.data,
      document_type_breakdown,
      upload_trends: uploadTrend.data,
      entity_frequency: entityFreq.data,
    },
  }
}

export const exportDocuments = async (orgId, format) => {
  const { data, headers } = await client.get(`/documents/${orgId}/export`, {
    params: { format },
    responseType: 'arraybuffer',
  })

  const mime = format === 'csv' ? 'text/csv' : 'application/json'
  const blob = new Blob([data], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `documents-export.${format}`
  a.click()
  URL.revokeObjectURL(url)
}
