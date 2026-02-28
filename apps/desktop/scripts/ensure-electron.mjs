import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

function isElectronInstalled(electronDir) {
  const pathFile = path.join(electronDir, 'path.txt')
  if (!existsSync(pathFile)) return false

  const executableName = readFileSync(pathFile, 'utf8').trim()
  if (!executableName) return false

  const distPath = process.env.ELECTRON_OVERRIDE_DIST_PATH
    ? process.env.ELECTRON_OVERRIDE_DIST_PATH
    : path.join(electronDir, 'dist')

  return existsSync(path.join(distPath, executableName))
}

function ensureElectronInstall() {
  const electronPackagePath = require.resolve('electron/package.json')
  const electronDir = path.dirname(electronPackagePath)

  if (isElectronInstalled(electronDir)) return

  console.log('[ensure-electron] Electron binary missing. Running electron/install.js...')

  const installerPath = path.join(electronDir, 'install.js')
  const result = spawnSync(process.execPath, [installerPath], {
    stdio: 'inherit',
    env: process.env
  })

  if (result.status !== 0) {
    console.error('[ensure-electron] Electron install failed.')
    process.exit(result.status ?? 1)
  }

  if (!isElectronInstalled(electronDir)) {
    console.error('[ensure-electron] Electron install finished, but no binary was found.')
    process.exit(1)
  }

  console.log('[ensure-electron] Electron binary installed.')
}

ensureElectronInstall()
