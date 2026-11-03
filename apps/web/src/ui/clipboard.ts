/**
 * Copies text, resolving true when it worked. The text can be a promise, so a
 * click can copy what is still being fetched: where `ClipboardItem` exists the
 * item is written during the click, which keeps the user's gesture in Safari.
 * Falls back to a hidden textarea where the Clipboard API is missing or
 * refused (plain HTTP, no permission). Resolves false when the text never
 * arrives.
 */
export async function copyText(pending: string | Promise<string>): Promise<boolean> {
  if (typeof pending !== 'string' && typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    const blob = pending.then((text) => new Blob([text], { type: 'text/plain' }))
    blob.catch(() => {}) // A refused write may never read it; `pending` is awaited below.
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': blob })])
      return true
    } catch {
      // Refused, or the text never came: the latter rejects below.
    }
  }
  let text: string
  try {
    text = await pending
  } catch {
    return false
  }
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return copyWithSelection(text)
  }
}

function copyWithSelection(text: string): boolean {
  const active = document.activeElement as HTMLElement | null
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
    active?.focus()
  }
}
