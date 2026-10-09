/**
 * A minimal .xlsx writer for the researcher export.
 *
 * Why not CSV alone: Excel splits a CSV on the *regional* list separator, and
 * on a South African (en-ZA) machine that is a semicolon, not a comma. The
 * researcher's file then opens as one long cell per row. A real workbook has
 * no separator to guess, opens as a table everywhere, and imports into Google
 * Sheets as-is (Drive → Upload, or File → Import in Sheets).
 *
 * Why hand-rolled rather than a library: the format needed here is tiny — a
 * few sheets of text and numbers, a bold header, frozen first row, filters and
 * column widths — and the popular libraries are either large or carry
 * unpatched advisories on npm. An .xlsx is a zip of XML files, and Node ships
 * the deflate half of zip.
 *
 * Safety: every text cell is written as an inline string, never a formula, so
 * practitioner free text such as `=HYPERLINK(...)` is shown, not executed —
 * no apostrophe prefix needed, unlike the CSV.
 *
 * OWNERSHIP: Stream 1 (backend).
 */
import { deflateRawSync } from 'node:zlib'

export type XlsxCell = string | number | null | undefined | { date: string }

export interface XlsxSheet {
  /** Shown on the tab. Trimmed to Excel's 31-character limit. */
  name: string
  rows: XlsxCell[][]
  /**
   * The first row is a header: bold, frozen, with filter dropdowns. Off for
   * free-form sheets such as a summary laid out in blocks.
   */
  header?: boolean
  /** Character widths per column; omitted columns are sized from content. */
  widths?: number[]
  /** Row indexes (0-based) to render bold — section headings on a summary. */
  boldRows?: number[]
}

/* ------------------------------------------------------------------ *
 * Cells
 * ------------------------------------------------------------------ */

/** Characters XML 1.0 cannot carry at all, even escaped. */
// eslint-disable-next-line no-control-regex
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

function escapeXml(text: string): string {
  return text
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 0 → "A", 25 → "Z", 26 → "AA". */
export function columnName(index: number): string {
  let name = ''
  let n = index + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    name = String.fromCharCode(65 + rem) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** Excel's serial day number for a YYYY-MM-DD calendar date (1900 system). */
function excelSerial(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / 86_400_000 + 25_569
}

// Style indexes into the cellXfs list in `stylesXml` below.
const STYLE_PLAIN = 0
const STYLE_BOLD = 1
const STYLE_DATE = 2

function cellXml(ref: string, value: XlsxCell, bold: boolean): string {
  const style = bold ? ` s="${STYLE_BOLD}"` : ''
  if (value === null || value === undefined || value === '') {
    return bold ? `<c r="${ref}"${style}/>` : ''
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? `<c r="${ref}"${style}><v>${value}</v></c>` : ''
  }
  if (typeof value === 'object') {
    return `<c r="${ref}" s="${STYLE_DATE}"><v>${excelSerial(value.date)}</v></c>`
  }
  // `xml:space` keeps leading/trailing spaces in free text intact.
  return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
}

function displayLength(value: XlsxCell): number {
  if (value === null || value === undefined) return 0
  if (typeof value === 'object') return 11
  return String(value).length
}

function sheetXml(sheet: XlsxSheet): string {
  const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length))
  const bold = new Set(sheet.boldRows ?? [])
  if (sheet.header) bold.add(0)

  const widths = Array.from({ length: columnCount }, (_, col) => {
    const given = sheet.widths?.[col]
    if (given !== undefined) return given
    const longest = Math.max(0, ...sheet.rows.map((row) => displayLength(row[col])))
    return Math.min(60, Math.max(8, longest + 2))
  })

  const cols = columnCount
    ? `<cols>${widths
        .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
        .join('')}</cols>`
    : ''

  const rows = sheet.rows
    .map((row, r) => {
      const cells = row
        .map((value, c) => cellXml(`${columnName(c)}${r + 1}`, value, bold.has(r)))
        .join('')
      return `<row r="${r + 1}">${cells}</row>`
    })
    .join('')

  const lastRef = `${columnName(Math.max(0, columnCount - 1))}${Math.max(1, sheet.rows.length)}`
  const frozen = sheet.header
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
    : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
  const filter = sheet.header && columnCount ? `<autoFilter ref="A1:${lastRef}"/>` : ''

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    frozen +
    cols +
    `<sheetData>${rows}</sheetData>` +
    filter +
    '</worksheet>'
  )
}

/* ------------------------------------------------------------------ *
 * Package parts
 * ------------------------------------------------------------------ */

/** Excel refuses a tab name over 31 characters or containing []:*?/\ . */
function safeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet'
  let candidate = base
  let n = 2
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${n++})`
    base = base.slice(0, 31 - suffix.length)
    candidate = base + suffix
  }
  used.add(candidate.toLowerCase())
  return candidate
}

const stylesXml =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="3">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

/** Excel rejects an empty `<definedNames/>`, so the element is omitted instead. */
function definedNames(names: string[]): string {
  const body = names.join('')
  return body ? `<definedNames>${body}</definedNames>` : ''
}

export function toXlsx(sheets: XlsxSheet[]): Buffer {
  const used = new Set<string>()
  const names = sheets.map((sheet) => safeSheetName(sheet.name, used))

  const files: Array<[string, string]> = [
    [
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map(
            (_, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ],
    [
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ],
    [
      'xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        names
          .map(
            (name, i) =>
              `<sheet name="${escapeXml(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
          )
          .join('') +
        '</sheets>' +
        // The filter range has to be named for Excel to treat the dropdowns as
        // a real AutoFilter rather than repairing the file on open.
        definedNames(
          sheets.map((sheet, i) => {
            if (!sheet.header) return ''
            const columnCount = Math.max(0, ...sheet.rows.map((row) => row.length))
            if (!columnCount) return ''
            const last = `$${columnName(columnCount - 1)}$${Math.max(1, sheet.rows.length)}`
            const quoted = `'${names[i].replace(/'/g, "''")}'`
            return `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${escapeXml(`${quoted}!$A$1:${last}`)}</definedName>`
          }),
        ) +
        '</workbook>',
    ],
    [
      'xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets
          .map(
            (_, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ],
    ['xl/styles.xml', stylesXml],
    ...sheets.map(
      (sheet, i): [string, string] => [`xl/worksheets/sheet${i + 1}.xml`, sheetXml(sheet)],
    ),
  ]

  return zip(files.map(([path, text]) => [path, Buffer.from(text, 'utf8')]))
}

/* ------------------------------------------------------------------ *
 * Zip (deflate, no encryption, no zip64 — exports are far below 4 GB)
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

// 1 January 1980, 00:00 in DOS time — a fixed stamp keeps output deterministic.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1

function zip(entries: Array<[string, Buffer]>): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0

  for (const [path, data] of entries) {
    const name = Buffer.from(path, 'utf8')
    const compressed = deflateRawSync(data)
    const crc = crc32(data)

    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4) // version needed
    local.writeUInt16LE(0x0800, 6) // UTF-8 names
    local.writeUInt16LE(8, 8) // deflate
    local.writeUInt16LE(DOS_TIME, 10)
    local.writeUInt16LE(DOS_DATE, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    locals.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4) // version made by
    central.writeUInt16LE(20, 6) // version needed
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(DOS_TIME, 12)
    central.writeUInt16LE(DOS_DATE, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    // extra, comment, disk start, internal attrs, external attrs: all zero
    central.writeUInt32LE(offset, 42)
    centrals.push(central, name)

    offset += local.length + name.length + compressed.length
  }

  const centralSize = centrals.reduce((sum, part) => sum + part.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)

  return Buffer.concat([...locals, ...centrals, end])
}
