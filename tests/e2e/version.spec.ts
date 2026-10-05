import { test, expect } from '@playwright/test'
import { execSync } from 'child_process'
import fs from 'fs'

const { version } = JSON.parse(fs.readFileSync('package.json', 'utf8'))
const commit = execSync('git rev-parse HEAD').toString().trim()

test('the footer shows the version and links the build to its commit', async ({ page }) => {
  await page.goto('/')
  const footer = page.getByTestId('app-version')
  await expect(footer).toContainText(`b0r3d QR v${version}`)
  const build = footer.getByRole('link')
  await expect(build).toHaveText(commit.slice(0, 7))
  await expect(build).toHaveAttribute(
    'href',
    `https://github.com/still-b0r3d/qr.b0r3d.org/commit/${commit}`
  )
})

test('the version follows <Mini QR version>+b0r3d.<n>', () => {
  expect(version).toMatch(/^\d+\.\d+\.\d+\+b0r3d\.[1-9]\d*$/)
})
