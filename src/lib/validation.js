const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function validateEmail(value) {
  const email = value.trim()
  if (!email) return 'Enter your work email.'
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address, like you@agency.com.'
  if (email.length > 254) return 'That email address is too long.'
  return null
}

export function validatePassword(value) {
  if (!value) return 'Create a password.'
  if (value.length < 12) return 'Use at least 12 characters.'
  if (value.length > 256) return 'Use 256 characters or fewer.'
  return null
}

export function validateRegister(values) {
  const errors = {}

  if (!values.fullName.trim()) {
    errors.fullName = 'Enter your full name.'
  } else if (values.fullName.trim().length > 255) {
    errors.fullName = 'Use 255 characters or fewer.'
  }

  const emailError = validateEmail(values.email)
  if (emailError) errors.email = emailError

  if (!values.agencyName.trim()) {
    errors.agencyName = 'Enter your agency name.'
  } else if (values.agencyName.trim().length < 2) {
    errors.agencyName = 'Agency names need at least 2 characters.'
  } else if (values.agencyName.trim().length > 255) {
    errors.agencyName = 'Use 255 characters or fewer.'
  }

  const passwordError = validatePassword(values.password)
  if (passwordError) errors.password = passwordError

  if (!values.confirmPassword) {
    errors.confirmPassword = 'Re-enter your password.'
  } else if (values.confirmPassword !== values.password) {
    errors.confirmPassword = 'Passwords do not match.'
  }

  if (!values.timezone) errors.timezone = 'Choose your timezone.'

  if (!values.terms) errors.terms = 'Please accept the terms to continue.'

  return errors
}

export function validateLogin(values) {
  const errors = {}
  const emailError = validateEmail(values.email)
  if (emailError) errors.email = emailError
  if (!values.password) errors.password = 'Enter your password.'
  return errors
}

const STRENGTH_LABELS = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']

/**
 * A lightweight, honest strength signal — not a security guarantee.
 * Score is 0-4 and mirrors the meter's four segments.
 */
export function passwordStrength(password) {
  if (!password) return { score: 0, label: STRENGTH_LABELS[0], hints: [] }

  const hints = []
  if (password.length < 12) hints.push('12+ characters')
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password)) hints.push('upper and lower case')
  if (!/\d/.test(password)) hints.push('a number')
  if (!/[^A-Za-z0-9]/.test(password)) hints.push('a symbol')

  let score = 0
  if (password.length >= 12) score += 1
  if (password.length >= 16) score += 1
  if (hints.length <= 2) score += 1
  if (hints.length === 0) score += 1

  score = Math.min(4, score)

  return { score, label: STRENGTH_LABELS[score], hints }
}
