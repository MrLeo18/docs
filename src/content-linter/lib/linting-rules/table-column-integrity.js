import { addError } from 'markdownlint-rule-helpers'
import { getRange } from '../helpers/utils'
import frontmatter from '@/frame/lib/read-frontmatter'

// Regex to detect table rows (must start with |, contain at least one more |, and end with optional whitespace)
const TABLE_ROW_REGEX = /^\s*\|.*\|\s*$/
// Regex to detect table separator rows (contains only |, :, -, and whitespace)
const TABLE_SEPARATOR_REGEX = /^\s*\|[\s\-:|\s]*\|\s*$/
// Regex to detect Liquid-only cells (whitespace, liquid tag, whitespace)
const LIQUID_ONLY_CELL_REGEX = /^\s*{%\s*(ifversion|else|endif|elsif).*%}\s*$/

/**
 * Counts the number of columns in a table row by splitting on | and handling edge cases
 */
function countColumns(row) {
  // Remove leading and trailing whitespace
  const trimmed = row.trim()

  // Handle empty rows
  if (!trimmed || !trimmed.includes('|')) {
    return 0
  }

  // Split by | and filter out empty cells at start/end (from leading/trailing |)
  const cells = trimmed.split('|')

  // Remove first and last elements if they're empty (from leading/trailing |)
  if (cells.length > 0 && cells[0].trim() === '') {
    cells.shift()
  }
  if (cells.length > 0 && cells[cells.length - 1].trim() === '') {
    cells.pop()
  }

  return cells.length
}

/**
 * Checks if a table row contains only Liquid conditionals
 */
function isLiquidOnlyRow(row) {
  const trimmed = row.trim()
  if (!trimmed.includes('|')) return false

  const cells = trimmed.split('|')
  // Remove empty cells from leading/trailing |
  const filteredCells = cells.filter((cell, index) => {
    if (index === 0 && cell.trim() === '') return false
    if (index === cells.length - 1 && cell.trim() === '') return false
    return true
  })

  // Check if all cells contain only Liquid tags
  return (
    filteredCells.length > 0 && filteredCells.every((cell) => LIQUID_ONLY_CELL_REGEX.test(cell))
  )
}

export const tableColumnIntegrity = {
  names: ['GHD047', 'table-column-integrity'],
  description: 'Tables must have consistent column counts across all rows',
  tags: ['tables', 'accessibility', 'formatting'],
  severity: 'error',
  function: (params, onError) => {
    // Skip autogenerated files
    const frontmatterString = params.frontMatterLines.join('\n')
    const fm = frontmatter(frontmatterString).data
    if (fm && fm.autogenerated) return

    const lines = params.lines
    let inTable = false
    let expectedColumnCount = null
    let tableStartLine = null
    let headerRow = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const isTableRow = TABLE_ROW_REGEX.test(line)
      const isSeparatorRow = TABLE_SEPARATOR_REGEX.test(line)

      // Check if we're starting a new table
      if (!inTable && isTableRow) {
        // Look ahead to see if next line is a separator (confirming this is a table)
        const nextLine = lines[i + 1]
        if (nextLine && TABLE_SEPARATOR_REGEX.test(nextLine)) {
          inTable = true
          tableStartLine = i + 1
          headerRow = line
          expectedColumnCount = countColumns(line)
          continue
        }
      }

      // Check if we're ending a table
      if (inTable && !isTableRow) {
        inTable = false
        expectedColumnCount = null
        tableStartLine = null
        headerRow = null
        continue
      }

      // If we're in a table, validate column count
      if (inTable && isTableRow && !isSeparatorRow) {
        // Skip Liquid-only rows as they're allowed to have different column counts
        if (isLiquidOnlyRow(line)) {
          continue
        }

        const actualColumnCount = countColumns(line)

        if (actualColumnCount !== expectedColumnCount) {
          const range = getRange(line, line.trim())
          let errorMessage

          if (actualColumnCount > expectedColumnCount) {
            errorMessage = `Table row has ${actualColumnCount} columns but header has ${expectedColumnCount}. Add ${actualColumnCount - expectedColumnCount} more column(s) to the header row to match this row.`
          } else {
            errorMessage = `Table row has ${actualColumnCount} columns but header has ${expectedColumnCount}. Add ${expectedColumnCount - actualColumnCount} missing column(s) to this row.`
          }

          addError(
            onError,
            i + 1,
            errorMessage,
            line,
            range,
            null, // No auto-fix available due to complexity
          )
        }
      }
    }
  },
}
