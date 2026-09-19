/**
 * Copies text, resolving true when it worked. Falls back to a hidden textarea
 * where the Clipboard API is missing or refused (plain HTTP, no permission).
 */
export async function copyText(text: string): Promise<boolean> {
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
