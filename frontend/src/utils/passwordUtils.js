export function validatePassword(password) {
  const rules = [
    { test: p => p.length >= 8,          message: 'At least 8 characters' },
    { test: p => /[A-Z]/.test(p),        message: 'One uppercase letter' },
    { test: p => /[a-z]/.test(p),        message: 'One lowercase letter' },
    { test: p => /[0-9]/.test(p),        message: 'One number' },
    { test: p => /[^A-Za-z0-9]/.test(p), message: 'One special character' },
  ]
  return rules.map(r => ({ ...r, passed: r.test(password) }))
}
