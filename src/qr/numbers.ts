// Rounding and writing numbers exactly as the PC app does, so both write the same files character
// for character.

/** To the nearest whole number, halves to the even one (the PC app's default rounding). */
export function roundHalfEven(x: number): number {
  const floor = Math.floor(x)
  const rest = x - floor
  if (rest > 0.5) return floor + 1
  if (rest < 0.5) return floor
  return floor % 2 === 0 ? floor : floor + 1
}

/** To the nearest whole number, halves away from zero. */
export function roundHalfAway(x: number): number {
  const whole = Math.trunc(x)
  const rest = x - whole
  return Math.abs(rest) >= 0.5 ? whole + Math.sign(rest) : whole
}

/** `x` to `digits` decimals, halves to even, the way the PC app rounds before writing a number. */
export function roundTo(x: number, digits: number): number {
  const power = 10 ** digits
  return Math.abs(x) < 1e16 ? roundHalfEven(x * power) / power : x
}

/**
 * A number rounded first (halves to even, as the PC app's SVG numbers are) to up to `digits`
 * decimals, written with no trailing zeros ("12.5", "3", never "-0").
 */
export function written(x: number, digits: number): string {
  if (!Number.isFinite(x)) return '0'
  const r = roundTo(x, digits)
  return r === 0 ? '0' : String(r)
}

/**
 * A number written the way the PC app writes one for people ("0.##"): its first 15 significant
 * digits, rounded at `decimals` places with halves going up, trailing zeros dropped.
 */
export function formatted(x: number, decimals: number): string {
  if (!Number.isFinite(x)) return String(x)
  const [mantissa, power] = Math.abs(x).toExponential(14).split('e')
  const digits = mantissa.replace('.', '').split('').map(Number)
  let point = Number(power) + 1 // digits before the decimal point
  while (point <= 0) {
    digits.unshift(0)
    point++
  }
  while (digits.length < point + decimals + 1) digits.push(0)
  const keep = point + decimals
  if (digits[keep] >= 5) {
    let i = keep - 1
    while (i >= 0 && digits[i] === 9) digits[i--] = 0
    if (i >= 0) digits[i]++
    else {
      digits.unshift(1)
      point++
    }
  }
  const whole = digits.slice(0, point).join('').replace(/^0+(?=\d)/, '')
  const fraction = digits.slice(point, point + decimals).join('').replace(/0+$/, '')
  const text = fraction ? `${whole}.${fraction}` : whole
  return x < 0 && /[1-9]/.test(text) ? `-${text}` : text
}

/** As `formatted`, with exactly `decimals` places ("0.40", as the PC app's "0.00"). */
export function formattedFixed(x: number, decimals: number): string {
  const text = formatted(x, decimals)
  if (decimals === 0) return text
  const [whole, fraction = ''] = text.split('.')
  return `${whole}.${fraction.padEnd(decimals, '0')}`
}
