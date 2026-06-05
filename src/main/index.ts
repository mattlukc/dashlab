import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron'
import electronUpdater from 'electron-updater'
import * as path from 'path'
import * as fs from 'fs'

// electron-updater is CommonJS; under electron-vite's ESM the named export isn't
// statically resolvable, so pull autoUpdater off the default import.
const { autoUpdater } = electronUpdater
import { getDb } from './lib/db'
import { registerIpcHandlers, startPollers } from './api'
import { loadSettings, saveSettings } from './lib/settings'

// Let the renderer play the ka-ching / celebration audio without a prior user
// gesture. Without this, Chromium blocks autoplay and audio.play() rejects with
// NotAllowedError — so new-order sounds silently failed, especially on the TV
// dashboard where nobody clicks. Must run before app is ready.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

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

// ---- OTA auto-update via electron-updater + GitHub Releases ----
// We don't auto-download or auto-install — the renderer drives it through an
// in-app banner: "update-available" → user clicks Download → "update-downloaded"
// → user clicks Restart & Install. quitAndInstall on an unsigned macOS build can
// fail, so we fall back to opening the GitHub releases page.
function setupAutoUpdater() {
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('update-available', (info) => {
    log('update available: ' + info.version)
    mainWindow?.webContents.send('update-available', { version: info.version })
  })
  autoUpdater.on('update-downloaded', (info) => {
    log('update downloaded: ' + info.version)
    mainWindow?.webContents.send('update-downloaded', { version: info.version })
  })
  autoUpdater.on('error', (err) => {
    log('autoUpdater error: ' + (err?.message ?? err))
  })

  ipcMain.handle('download-update', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e) {
      log('downloadUpdate failed: ' + e)
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('install-update', async () => {
    try {
      autoUpdater.quitAndInstall()
      return { ok: true }
    } catch (e) {
      // Unsigned macOS builds can't relaunch the installer in place — send the
      // user to the releases page to grab the new build manually.
      log('quitAndInstall failed, opening releases page: ' + e)
      await shell.openExternal('https://github.com/mattlukc/dashlab/releases/latest')
      return { ok: false, error: String(e) }
    }
  })

  // Only check in packaged builds — dev has no update feed (dev-app-update.yml).
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((e) => log('checkForUpdates failed: ' + e))
    }, 5000)
  }
}

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

  // Wire up OTA updates (event listeners, IPC, delayed check).
  setupAutoUpdater()
})

app.on('window-all-closed', () => {})
app.on('activate', () => showWindow())
app.on('before-quit', () => { isQuitting = true })
