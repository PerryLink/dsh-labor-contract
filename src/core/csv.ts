/** RFC 4180 field escaping: quote on comma, quote, CR or LF and double embedded quotes. */
const CSV_NEEDS_QUOTES = /[",\r\n]/

export function csvField(value: string): string {
  return CSV_NEEDS_QUOTES.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Build a UTF-8 CSV body with a trailing newline; empty input yields an empty string. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  if (rows.length === 0) return ''
  return `${rows.map((row) => row.map(csvField).join(',')).join('\n')}\n`
}
