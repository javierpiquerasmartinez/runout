/** The pages of getting in: an Invitation's link and choosing a new password. */
export const invitationPathPrefix = '/invitation/'
export const resetPasswordPath = '/reset-password'

/** The link token in `/invitation/<token>`, or null for any other path. */
export function invitationTokenFromPath(path: string): string | null {
  const match = path.match(/^\/invitation\/([A-Za-z0-9_-]+)$/)
  return match ? match[1] : null
}

/** The link token in `/reset-password/<token>`, or null for any other path. */
export function resetTokenFromPath(path: string): string | null {
  const match = path.match(/^\/reset-password\/([A-Za-z0-9_-]+)$/)
  return match ? match[1] : null
}
