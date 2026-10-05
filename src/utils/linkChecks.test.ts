import { describe, expect, it } from 'vitest'
import { findTrackingParams, getDataChecks, isBareDomain, stripTrackingParams } from './linkChecks'

describe('isBareDomain', () => {
  it('spots web addresses typed without a scheme', () => {
    for (const t of [
      'b0r3d.org',
      'www.example.com',
      'b0r3d.org/page?a=1#top',
      'shop.example.co.uk:8080/x'
    ]) {
      expect(isBareDomain(t), t).toBe(true)
    }
  })

  it('leaves links, emails, plain text and other schemes alone', () => {
    for (const t of [
      'https://b0r3d.org',
      'mailto:a@b0r3d.org',
      'a@b0r3d.org',
      'hello world',
      'WIFI:T:WPA;S:x;P:y;;',
      'tel:+15555550123',
      'tel:5555550123',
      'v1.2.3',
      'notes.txt is here'
    ]) {
      expect(isBareDomain(t), t).toBe(false)
    }
  })
})

describe('tracking parameters', () => {
  it('finds utm_* and click ids, once each', () => {
    expect(
      findTrackingParams('https://b0r3d.org/?utm_source=x&id=7&fbclid=abc&utm_source=y#top')
    ).toEqual(['utm_source', 'fbclid'])
  })

  it('removes only the tracking parameters, keeping order, encoding and fragment', () => {
    expect(stripTrackingParams('https://b0r3d.org/p?a=1&utm_medium=qr&b=%20x&gclid=9#frag')).toBe(
      'https://b0r3d.org/p?a=1&b=%20x#frag'
    )
    expect(stripTrackingParams('https://b0r3d.org/?utm_source=x')).toBe('https://b0r3d.org/')
  })

  it('treats "si" as tracking only on YouTube and Spotify', () => {
    expect(findTrackingParams('https://youtu.be/abc?si=xyz')).toEqual(['si'])
    expect(findTrackingParams('https://open.spotify.com/track/1?si=xyz')).toEqual(['si'])
    expect(findTrackingParams('https://example.com/?si=metric')).toEqual([])
  })

  it('ignores non-http text', () => {
    expect(findTrackingParams('utm_source=x')).toEqual([])
    expect(stripTrackingParams('mailto:a@b.c?utm_source=x')).toBe('mailto:a@b.c?utm_source=x')
  })
})

describe('getDataChecks', () => {
  it('suggests https:// for a bare address and trims stray whitespace', () => {
    expect(getDataChecks(' b0r3d.org/page\n')).toEqual([
      { key: 'outerWhitespace', fixed: 'b0r3d.org/page' },
      { key: 'bareDomain', fixed: 'https://b0r3d.org/page' }
    ])
  })

  it('offers a cleaned link when tracking parameters are present', () => {
    expect(getDataChecks('https://b0r3d.org/?utm_source=qr')).toEqual([
      { key: 'trackingParams', params: ['utm_source'], fixed: 'https://b0r3d.org/' }
    ])
  })

  it('has nothing to say about a clean link or empty input', () => {
    expect(getDataChecks('https://b0r3d.org')).toEqual([])
    expect(getDataChecks('')).toEqual([])
    expect(getDataChecks('   ')).toEqual([])
  })
})
