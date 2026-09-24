import type { FileTypeId } from '../../../domain/file-types/index.ts'

export const MAX_TABLE_ROWS = 200
export const MAX_TABLE_COLUMNS = 32

export interface ParsedTable {
  rows: string[][]
  malformed: boolean
  truncated: boolean
  tooWide: boolean
}

function countUnquotedDelimiter(line: string, delimiter: string) {
  let quoted = false
  let count = 0
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        index += 1
      } else {
        quoted = !quoted
      }
    } else if (!quoted && character === delimiter) {
      count += 1
    }
  }
  return count
}

export function detectTableDelimiter(text: string, fileTypeId: FileTypeId) {
  if (fileTypeId === 'tsv') return '\t'
  if (fileTypeId !== 'csv') return ','

  const candidates = [',', ';', '\t', '|']
  const lines = text.split(/\r?\n/).slice(0, 12)
  return candidates.reduce(
    (best, candidate) => {
      const counts = lines.map((line) =>
        countUnquotedDelimiter(line, candidate),
      )
      const populated = counts.filter((count) => count > 0)
      if (populated.length === 0) return best
      const score =
        populated.length * 100 +
        populated.reduce((sum, count) => sum + count, 0)
      return score > best.score ? { delimiter: candidate, score } : best
    },
    { delimiter: ',', score: -1 },
  ).delimiter
}

export function parseDelimitedText(
  text: string,
  delimiter: string,
): ParsedTable {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let malformed = false
  let truncated = false
  let tooWide = false

  const pushField = () => {
    row.push(field)
    field = ''
    if (row.length > MAX_TABLE_COLUMNS) tooWide = true
  }
  const pushRow = () => {
    pushField()
    rows.push(row)
    row = []
    if (rows.length >= MAX_TABLE_ROWS) truncated = true
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    if (quoted) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"' && field.length === 0) {
      quoted = true
    } else if (character === delimiter) {
      pushField()
    } else if (character === '\n') {
      pushRow()
    } else if (character === '\r') {
      if (text[index + 1] === '\n') index += 1
      pushRow()
    } else {
      field += character
    }

    if (truncated || tooWide) break
  }

  if (quoted) malformed = true
  if (!truncated && !tooWide && (field.length > 0 || row.length > 0)) {
    pushRow()
  }

  return { rows, malformed, tooWide, truncated }
}
