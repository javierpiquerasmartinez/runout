import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyText } from './clipboard'

/** What landed on the mocked clipboard, whichever way it was written. */
let copied: string | null

function clipboardWithWriteText() {
  const clipboard = {
    writeText: vi.fn(async (text: string) => {
      copied = text
    }),
  }
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
  return clipboard
}

beforeEach(() => {
  copied = null
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('copyText', () => {
  it('copies a text with writeText', async () => {
    clipboardWithWriteText()
    await expect(copyText('Mano copiada')).resolves.toBe(true)
    expect(copied).toBe('Mano copiada')
  })

  it('copies a promised text with writeText once it arrives, where ClipboardItem is missing', async () => {
    clipboardWithWriteText()
    await expect(copyText(Promise.resolve('Mano copiada'))).resolves.toBe(true)
    expect(copied).toBe('Mano copiada')
  })

  it('copies nothing and resolves false when the promised text never arrives', async () => {
    const clipboard = clipboardWithWriteText()
    await expect(copyText(Promise.reject(new Error('offline')))).resolves.toBe(false)
    expect(clipboard.writeText).not.toHaveBeenCalled()
    expect(copied).toBeNull()
  })

  describe('where ClipboardItem exists', () => {
    let clipboard: ReturnType<typeof clipboardWithWriteText> & { write: ReturnType<typeof vi.fn> }

    beforeEach(() => {
      // jsdom has no ClipboardItem; this one holds its data like the browser's.
      class FakeClipboardItem {
        readonly items: Record<string, string | Blob | Promise<string | Blob>>
        constructor(items: Record<string, string | Blob | Promise<string | Blob>>) {
          this.items = items
        }
        async getType(type: string): Promise<Blob> {
          const data = await this.items[type]
          return typeof data === 'string' ? new Blob([data], { type }) : data
        }
      }
      vi.stubGlobal('ClipboardItem', FakeClipboardItem)
      clipboard = Object.assign(clipboardWithWriteText(), {
        // Like the browser, write waits for the item's data and rejects if it never comes.
        write: vi.fn(async ([item]: FakeClipboardItem[]) => {
          copied = await (await item.getType('text/plain')).text()
        }),
      })
    })

    it('writes the item during the click, before the promised text arrives', async () => {
      let arrive!: (text: string) => void
      const copying = copyText(new Promise<string>((resolve) => (arrive = resolve)))
      expect(clipboard.write).toHaveBeenCalledOnce()

      arrive('Mano copiada')
      await expect(copying).resolves.toBe(true)
      expect(copied).toBe('Mano copiada')
      expect(clipboard.writeText).not.toHaveBeenCalled()
    })

    it('copies nothing and resolves false when the promised text never arrives', async () => {
      await expect(copyText(Promise.reject(new Error('offline')))).resolves.toBe(false)
      expect(copied).toBeNull()
      expect(clipboard.writeText).not.toHaveBeenCalled()
    })
  })

  describe('where the Clipboard API is refused', () => {
    let execCommand: ReturnType<typeof vi.fn>

    beforeEach(() => {
      const clipboard = clipboardWithWriteText()
      clipboard.writeText.mockRejectedValue(new DOMException('Not allowed', 'NotAllowedError'))
      // jsdom has no execCommand; the browser copies the selected textarea.
      execCommand = vi.fn((command: string) => {
        const area = document.querySelector('textarea')
        if (command !== 'copy' || !area) return false
        copied = area.value.slice(area.selectionStart, area.selectionEnd)
        return true
      })
      Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    })

    it('copies a promised text through a hidden textarea, giving focus back', async () => {
      const button = document.createElement('button')
      document.body.append(button)
      button.focus()

      await expect(copyText(Promise.resolve('Mano copiada'))).resolves.toBe(true)
      expect(copied).toBe('Mano copiada')
      expect(document.activeElement).toBe(button)
      expect(document.querySelector('textarea')).toBeNull()
      button.remove()
    })

    it('resolves false when the textarea copy fails too', async () => {
      execCommand.mockReturnValue(false)
      await expect(copyText('Mano copiada')).resolves.toBe(false)
    })
  })
})
