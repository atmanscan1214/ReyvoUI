import { describe, expect, it } from 'vitest'
import { crc32, createZip } from '../zip'

describe('crc32', () => {
  it('matches the reference checksum for a known string', () => {
    expect(crc32(new TextEncoder().encode('hello'))).toBe(0x3610a686)
  })
})

describe('createZip', () => {
  it('writes local headers, a central directory, and an end record', async () => {
    const blob = createZip(
      [
        { name: 'contacts.csv', content: 'email\nana@example.com\n' },
        { name: 'companies.csv', content: 'name\nNorthwind\n' },
      ],
      { date: new Date(2026, 10, 25, 12, 0, 0) },
    )
    const bytes = new Uint8Array(await blob.arrayBuffer())
    const view = new DataView(bytes.buffer)

    expect(view.getUint32(0, true)).toBe(0x04034b50)

    const endOffset = bytes.length - 22
    expect(view.getUint32(endOffset, true)).toBe(0x06054b50)
    expect(view.getUint16(endOffset + 8, true)).toBe(2)
    expect(view.getUint16(endOffset + 10, true)).toBe(2)

    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('contacts.csv')
    expect(text).toContain('companies.csv')
    expect(text).toContain('ana@example.com')
  })

  it('rejects an empty archive', () => {
    expect(() => createZip([])).toThrow(/at least one file/i)
  })
})
