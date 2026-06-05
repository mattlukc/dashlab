import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import { getDb } from './lib/db'
import { registerIpcHandlers, startPollers } from './api'
import { loadSettings, saveSettings } from './lib/settings'

const APP_NAME = 'DashLab'
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false

const logFile = path.join(app.getPath('userData'), 'dashlab.log')
function log(msg: string) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  process.stdout.write(line)
  // Ensure the userData dir exists before writing — at module-load time it may
  // not yet, which previously made the very first log lines silently vanish.
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true })
    fs.appendFileSync(logFile, line)
  } catch {}
}

log('main module loaded')
// Single-instance: if another copy is already running, hand off and exit. Don't
// hard process.exit() before the handoff is wired — just return from startup.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  log('single-instance lock not acquired — another instance is running; exiting')
  app.quit()
} else {
  app.on('second-instance', () => showWindow())
}

function createWindow() {
  if (mainWindow) { showWindow(); return }
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: APP_NAME,
    show: true,
    backgroundColor: '#FAFAF8',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (!app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173')
    // Forward renderer console to the main log so dev errors are visible without
    // opening DevTools. Levels: 0=log 1=warning 2=error 3=info.
    mainWindow.webContents.on('console-message', (_e, level, message, line, source) => {
      if (level >= 2) log(`[renderer:error] ${message} (${source}:${line})`)
    })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow?.hide() }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  log('window created')
}

function showWindow() {
  if (mainWindow) { mainWindow.show(); mainWindow.focus() }
  else createWindow()
}

function createTray() {
  const iconPath = path.join(__dirname, '../../resources/icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip(APP_NAME)
  const menu = Menu.buildFromTemplate([
    { label: 'Open DashLab', click: showWindow },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit() } }
  ])
  tray.setContextMenu(menu)
  tray.on('click', showWindow)
}

// Native folder picker for the Settings → Config Sync tab.
ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
  return result.canceled ? null : result.filePaths[0]
})

// ---- Auto-update via the synced Google Drive folder ----
// The Drive folder syncs the built installer (dist-dashlab/) between machines.
// On startup we read the version stamp the other machine's build left behind and,
// if it's newer than what's running here, surface an in-app "Install Update"
// banner that opens the synced installer. No network / update server needed.

/** true if `remote` is a strictly higher x.y.z than `local`. */
function isNewerVersion(remote: string, local: string): boolean {
  const r = remote.split('.').map((n) => parseInt(n, 10) || 0)
  const l = local.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    const a = r[i] ?? 0
    const b = l[i] ?? 0
    if (a > b) return true
    if (a < b) return false
  }
  return false
}

/**
 * Resolve the dist-dashlab directory inside the synced Drive folder. The spec is
 * ambiguous about whether it sits at `<drive>/dist-dashlab` or
 * `<drive>/../dist-dashlab`, so we try both and use whichever actually holds the
 * version stamp. Returns null if neither exists.
 */
function resolveDriveDistDir(googleDrivePath: string): string | null {
  const candidates = [
    path.join(googleDrivePath, 'dist-dashlab'),
    path.join(googleDrivePath, '..', 'dist-dashlab'),
  ]
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'latest-version.json'))) return dir
  }
  return null
}

function checkForUpdate() {
  try {
    const settings = loadSettings()
    if (!settings.googleDrivePath) return // not configured — skip silently

    const distDir = resolveDriveDistDir(settings.googleDrivePath)
    if (!distDir) return // no synced build yet — skip silently

    const raw = fs.readFileSync(path.join(distDir, 'latest-version.json'), 'utf8')
    const remoteVersion = String(JSON.parse(raw).version || '')
    if (!remoteVersion) return

    const current = app.getVersion()
    if (!isNewerVersion(remoteVersion, current)) {
      log(`update check: up to date (running ${current}, drive ${remoteVersion})`)
      return
    }

    const installerPath =
      process.platform === 'win32'
        ? path.join(distDir, 'DashLab-Setup-win-x64.exe')
        : path.join(distDir, `DashLab-${remoteVersion}-arm64.dmg`)

    if (!fs.existsSync(installerPath)) {
      log(`update available (${remoteVersion}) but installer missing at ${installerPath}`)
      return
    }

    log(`update available: ${current} → ${remoteVersion} (${installerPath})`)
    mainWindow?.webContents.send('update-available', {
      version: remoteVersion,
      installerPath,
    })
  } catch (e) {
    // Any read/parse error → skip silently, this is best-effort.
    log('update check failed (ignored): ' + e)
  }
}

// Open the synced installer. On Mac the DMG opens in Finder; on Windows the NSIS
// installer launches, closes the app, and reinstalls.
ipcMain.handle('install-update', async (_e, installerPath: string) => {
  if (!installerPath) return { ok: false, error: 'No installer path' }
  const err = await shell.openPath(installerPath)
  return err ? { ok: false, error: err } : { ok: true }
})

// On launch, if a Google Drive folder is configured and holds a
// dashlab-config.json, load those settings so every machine stays in sync.
// The local googleDrivePath is preserved so the pointer doesn't get overwritten.
async function syncFromGoogleDrive() {
  const settings = loadSettings()
  if (!settings.googleDrivePath) return
  const configPath = path.join(settings.googleDrivePath, 'dashlab-config.json')
  if (!fs.existsSync(configPath)) return
  try {
    const imported = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    saveSettings({
      ...imported,
      googleDrivePath: settings.googleDrivePath,
      googleDriveSyncedAt: new Date().toISOString(),
    })
    log('Google Drive config loaded from ' + configPath)
  } catch (e) {
    log('Google Drive sync failed: ' + e)
  }
}

app.whenReady().then(async () => {
  log('app ready')
  try { fs.mkdirSync(path.dirname(logFile), { recursive: true }) } catch {}
  if (!app.isPackaged) app.setLoginItemSettings({ openAtLogin: false })
  else app.setLoginItemSettings({ openAtLogin: true, openAsHidden: true })

  // Pull the latest config from Google Drive BEFORE the backend reads settings.
  await syncFromGoogleDrive()

  // Backend init — replaces the old Next.js lib/server-init.ts side-effect:
  // open + migrate the DB, register the IPC bridge, then start the pollers.
  try {
    getDb()
    log('db opened')
    registerIpcHandlers()
    log('ipc handlers registered')
    startPollers()
    log('pollers started')
  } catch (err) {
    log(`backend init failed: ${(err as Error).message}`)
  }

  createTray()
  createWindow()
  log('startup done')

  // Best-effort auto-update check, delayed so it doesn't compete with launch.
  setTimeout(checkForUpdate, 3000)
})

app.on('window-all-closed', () => {})
app.on('activate', () => showWindow())
app.on('before-quit', () => { isQuitting = true })
