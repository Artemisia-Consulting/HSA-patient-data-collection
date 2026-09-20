/**
 * CSV serialisation for the researcher export (FR8).
 *
 * Two things this does that a naive `rows.join(',')` does not:
 *
 *  1. Escapes properly — quotes, commas and newlines inside a value (the
 *     "Other (specify)" free-text column can contain all three).
 *  2. Neutralises formula injection. A cell beginning `=`, `+`, `-`, `@`, tab
 *     or CR is executed as a formula when the file is opened in Excel or
 *     Sheets. The export is practitioner-supplied text opened by a researcher
 *     on a laptop, which is exactly the path that attack takes, so leading
 *     control characters are prefixed with an apostrophe.
 *
 * OWNERSHIP: Stream 1 (backend).
 */

/** Excel assumes the OS codepage unless the file opens with a UTF-8 BOM. */
export const UTF8_BOM = '﻿'

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  let text = String(value)

  if (text.length > 0 && FORMULA_PREFIXES.includes(text[0])) {
    text = `'${text}`
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(
  headers: string[],
  rows: Array<Array<unknown>>,
  options: { bom?: boolean } = {},
): string {
  const lines = [headers.map(escapeCsvValue).join(',')]
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','))
  }
  // CRLF is what RFC 4180 specifies and what Excel on Windows expects.
  return (options.bom === false ? '' : UTF8_BOM) + lines.join('\r\n') + '\r\n'
}
