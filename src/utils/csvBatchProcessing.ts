import { detectDelimiter, splitCSVLine, splitCSVRows, type CSVData, type VCardCSVData } from './csv'
import { generateVCardData } from './dataEncoding'

export interface BatchProcessingResult {
  urls: string[]
  frameTexts: string[]
  fileNames: string[]
  fontFamilies: string[]
  hasCustomFrameText: boolean
}

export interface BarcodeBatchItem {
  data: string
  fileName?: string
  /** Its row in the file, counting a header row (as a spreadsheet numbers them). */
  row: number
}

// Header names, compared in lower case.
const DATA_COLUMNS = ['data', 'code', 'barcode', 'value', 'text', 'url']
const FILE_NAME_COLUMNS = ['filename', 'file name', 'file', 'name']

/**
 * Reads a CSV for a barcode batch: one code per row. A header row is optional
 * and is recognised by its names (data, code, barcode, value, text or url
 * for the code; fileName for the file name), so a QR batch file works too.
 * Without one, the first column is the code and the second the file name.
 */
export function parseBarcodeBatchCsv(content: string): BarcodeBatchItem[] {
  // A byte order mark (U+FEFF) is not part of the first cell.
  const text = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content
  const rows = splitCSVRows(text)
  if (rows.length === 0) return []
  const delimiter = detectDelimiter(rows[0])
  const first = splitCSVLine(rows[0], delimiter).map((cell) => cell.toLowerCase())
  const dataColumn = first.findIndex((cell) => DATA_COLUMNS.includes(cell))
  const fileColumn = first.findIndex((cell) => FILE_NAME_COLUMNS.includes(cell))
  const hasHeader = dataColumn >= 0 || fileColumn >= 0
  const dataAt = dataColumn >= 0 ? dataColumn : fileColumn === 0 ? 1 : 0
  const fileAt = hasHeader ? fileColumn : 1

  const items: BarcodeBatchItem[] = []
  rows.forEach((line, index) => {
    if (hasHeader && index === 0) return
    const values = splitCSVLine(line, delimiter)
    const data = values[dataAt] ?? ''
    if (data.trim() === '') return
    const fileName = fileAt >= 0 ? values[fileAt] || undefined : undefined
    items.push({ data, fileName, row: index + 1 })
  })
  return items
}

/**
 * Processes parsed CSV data for batch QR code generation
 * @param csvData Array of parsed CSV data
 * @returns BatchProcessingResult with aligned arrays for urls, frameTexts, and fileNames
 */
export function processCsvDataForBatch(csvData: CSVData[]): BatchProcessingResult {
  const urls: string[] = []
  const frameTexts: string[] = []
  const fileNames: string[] = []
  const fontFamilies: string[] = []

  csvData.forEach((row) => {
    const isVCard = 'firstName' in row

    if (isVCard) {
      // Generate vCard data string
      const vCardData = row as VCardCSVData
      const vCardString = generateVCardData({
        firstName: vCardData.firstName,
        lastName: vCardData.lastName,
        org: vCardData.org,
        position: vCardData.position,
        phoneWork: vCardData.phonework,
        phonePrivate: vCardData.phoneprivate,
        phoneMobile: vCardData.phonemobile,
        email: vCardData.email,
        website: vCardData.website,
        street: vCardData.street,
        zipcode: vCardData.zipcode,
        city: vCardData.city,
        state: vCardData.state,
        country: vCardData.country,
        // 3.0 unless the CSV asks for another: phones read it most reliably.
        version: vCardData.version || '3.0'
      })
      urls.push(vCardString)
    } else {
      // Handle simple URL/text data
      urls.push(row.url)
    }

    // Always push frameText to maintain array alignment (empty string if not provided)
    frameTexts.push(row.frameText || '')

    // Always push fileName to maintain array alignment (empty string if not provided)
    fileNames.push(row.fileName || '')

    // Always push fontFamily to maintain array alignment (empty string if not provided)
    fontFamilies.push(row.frameFontFamily || '')
  })

  // Check if any non-empty frame text exists
  const hasCustomFrameText = frameTexts.some((text) => text && text.trim() !== '')

  return {
    urls,
    frameTexts,
    fileNames,
    fontFamilies,
    hasCustomFrameText
  }
}

/**
 * Generates a filename for batch export based on priority: fileName > frameText > generated from data
 * @param dataString The data string (URL or vCard)
 * @param frameText The frame text
 * @param customFileName The custom filename from CSV
 * @param index The index of the current item
 * @param usedFilenames Set of already used filenames to avoid duplicates
 * @returns The generated filename (without extension)
 */
export function generateBatchExportFilename(
  dataString: string,
  frameText: string,
  customFileName: string,
  index: number,
  usedFilenames: Set<string>
): string {
  let fileName = ''

  // Priority: custom fileName > frameText > generated name
  if (customFileName) {
    fileName = customFileName
  } else if (frameText) {
    fileName = frameText
  } else {
    // For vCard data, use firstName_lastName
    if (dataString.startsWith('BEGIN:VCARD')) {
      const match = dataString.match(/FN:([^\r\n]+)/)
      if (match) {
        const fullName = match[1].trim()
        fileName = fullName.replace(/\s+/g, '_')
      }
    } else {
      // For simple URL/text, use the data string
      const pathSegments = dataString.split('/')
      if (pathSegments.length > 2) {
        const lastPathSegment = pathSegments[pathSegments.length - 1]
        // Check if lastPathSegment is only alphanumeric or underscores
        const isValidFileName = /^[a-zA-Z0-9_]+$/.test(lastPathSegment)
        if (isValidFileName) {
          fileName = lastPathSegment
        } else {
          // Look for the second to last segment or domain
          const secondLastSegment = pathSegments[pathSegments.length - 2]
          if (secondLastSegment && /^[a-zA-Z0-9_]+$/.test(secondLastSegment)) {
            fileName = secondLastSegment
          } else {
            // Try to extract domain name
            const domainMatch = dataString.match(/https?:\/\/([^/]+)/)
            if (domainMatch) {
              fileName = domainMatch[1].replace(/[^a-zA-Z0-9]/g, '_')
            } else {
              fileName = `qr_code_${index}`
            }
          }
        }
      } else {
        fileName = dataString.trim()
      }
    }
  }

  // Ensure unique filenames
  if (usedFilenames.has(fileName)) {
    fileName = `${fileName}-${index}`
  }

  usedFilenames.add(fileName)
  return fileName
}
