export function isForbidden(err) {
  return err?.response?.status === 403
}
