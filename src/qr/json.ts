// JSON written exactly as b0r3d QR's design files are written by the PC app: two spaces to a level,
// whole numbers without a point and others as short as they read back the same (as .NET writes
// them), and U+2028 and U+2029 escaped along with the control characters.

export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

// .NET's "G" formatting with `precision` significant digits: plain digits, or an exponent when the
// number is very small or very big for that precision ("1E-05", "1.5E+20")
function general(d: number, precision: number): string {
  const [mantissa, power] = d.toExponential(precision - 1).split('e')
  const exponent = Number(power)
  const negative = mantissa.startsWith('-')
  const digits = mantissa.replace('-', '').replace('.', '').replace(/0+$/, '') || '0'
  let text: string
  if (exponent <= -5 || exponent >= precision) {
    const rest = digits.slice(1)
    text = digits[0] + (rest ? '.' + rest : '') + 'E' + (exponent < 0 ? '-' : '+') + String(Math.abs(exponent)).padStart(2, '0')
  } else if (exponent < 0) {
    text = '0.' + '0'.repeat(-exponent - 1) + digits
  } else {
    const whole = digits.slice(0, exponent + 1).padEnd(exponent + 1, '0')
    const fraction = digits.slice(exponent + 1)
    text = whole + (fraction ? '.' + fraction : '')
  }
  return (negative ? '-' : '') + text
}

/** A number as the design files write it. */
export function jsonNumber(d: number): string {
  if (!Number.isFinite(d)) return '0'
  if (d === Math.floor(d) && Math.abs(d) < 1e15) return String(d === 0 ? 0 : d)
  const short = general(d, 15)
  return Number(short) === d ? short : general(d, 17)
}

function jsonString(text: string): string {
  let s = '"'
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    switch (c) {
      case 0x22:
        s += '\\"'
        break
      case 0x5c:
        s += '\\\\'
        break
      case 0x0a:
        s += '\\n'
        break
      case 0x0d:
        s += '\\r'
        break
      case 0x09:
        s += '\\t'
        break
      case 0x08:
        s += '\\b'
        break
      case 0x0c:
        s += '\\f'
        break
      default:
        if (c < 0x20 || c === 0x2028 || c === 0x2029) s += '\\u' + c.toString(16).padStart(4, '0')
        else s += text[i]
    }
  }
  return s + '"'
}

/** A value as JSON text, two spaces to a level. */
export function jsonText(value: JsonValue, indent = 0): string {
  if (value === null) return 'null'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'string') return jsonString(value)
  if (typeof value === 'number') return jsonNumber(value)
  const pad = ' '.repeat(indent + 2)
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    return '[\n' + value.map((v) => pad + jsonText(v, indent + 2)).join(',\n') + '\n' + ' '.repeat(indent) + ']'
  }
  const entries = Object.entries(value)
  if (entries.length === 0) return '{}'
  return '{\n' + entries.map(([k, v]) => pad + jsonString(k) + ': ' + jsonText(v, indent + 2)).join(',\n') + '\n' + ' '.repeat(indent) + '}'
}
