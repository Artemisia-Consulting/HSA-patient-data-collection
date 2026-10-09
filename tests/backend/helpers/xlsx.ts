import { inflateRawSync } from 'node:zlib'

/**
 * Reads an .xlsx back into its XML parts, via the zip central directory, so
 * tests can assert on what Excel will actually see. Deliberately independent
 * of the writer in `src/lib/server/xlsx.ts` — a shared helper would let a
 * bug in one hide in the other.
 */
export function unzipXlsx(bytes: Uint8Array): Map<string, string> {
  const buf = Buffer.from(bytes)
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  if (end < 0) throw new Error('not a zip: no end-of-central-directory record')

  const count = buf.readUInt16LE(end + 10)
  let at = buf.readUInt32LE(end + 16)
  const files = new Map<string, string>()

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory')
    const method = buf.readUInt16LE(at + 10)
    const size = buf.readUInt32LE(at + 20)
    const nameLength = buf.readUInt16LE(at + 28)
    const extra = buf.readUInt16LE(at + 30)
    const comment = buf.readUInt16LE(at + 32)
    const local = buf.readUInt32LE(at + 42)
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength)

    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
    const raw = buf.subarray(dataStart, dataStart + size)
    files.set(name, (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'))

    at += 46 + nameLength + extra + comment
  }
  return files
}

/** The text of every cell in a sheet, row by row — enough to assert on. */
export function sheetText(xml: string): string[][] {
  return [...xml.matchAll(/<row [^>]*>(.*?)<\/row>/g)].map(([, row]) =>
    [...row.matchAll(/<c [^>]*?(?:\/>|>(.*?)<\/c>)/g)].map(([, inner = '']) => {
      const text = inner.match(/<t[^>]*>(.*?)<\/t>/)?.[1] ?? inner.match(/<v>(.*?)<\/v>/)?.[1] ?? ''
      return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
    }),
  )
}
