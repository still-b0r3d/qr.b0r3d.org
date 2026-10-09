import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import fs from 'fs'

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const commit = execSync('git rev-parse HEAD').toString().trim()

const SOURCE_URL = 'https://github.com/still-b0r3d/qr.b0r3d.org'

test('the footer shows the version and the build', async ({ page }) => {
  await page.goto('/')
  const footer = page.getByTestId('app-version')
  await expect(footer).toContainText(`b0r3d QR v${version}`)
  await expect(footer).toContainText(`build ${commit.slice(0, 7)}`)
  // The build is plain text; the Source link (below) is the way to the code.
  await expect(footer.getByRole('link', { name: commit.slice(0, 7) })).toHaveCount(0)
})

test('the footer links the source and license (GPL)', async ({ page }) => {
  await page.goto('/')
  const footer = page.getByTestId('app-version')
  await expect(footer.getByRole('link', { name: 'Source', exact: true })).toHaveAttribute(
    'href',
    SOURCE_URL
  )
  await expect(footer.getByRole('link', { name: 'GPL-3.0', exact: true })).toHaveAttribute(
    'href',
    `${SOURCE_URL}/blob/main/LICENSE`
  )
})

// From 1.0, b0r3d's own version follows the Mini QR base (before, a count).
test('the version follows <Mini QR version>+b0r3d.<major>.<minor>', () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+\+b0r3d\.[1-9]\d*\.\d+$/)
})
