# DashLab — CLAUDE.md

**What it is:** Neat Tools internal e-commerce dashboard. Electron desktop app — no server, no localhost, no terminal required to run.

**GitHub:** https://github.com/mattlukc/dashlab (private)  
**Packaged app (Mac):** /Applications/DashLab.app  
**Owner:** Matt (mattlukc@gmail.com) + Seth (shop partner/FIL, GitHub collaborator)

---

## Stack

- **Electron** — desktop wrapper, main process
- **Vite + React** — renderer (UI)
- **Shopify Polaris** — UI components (use real Polaris components, no themed shims)
- **better-sqlite3** — local SQLite DB, rebuilt for Electron ABI via postinstall
- **TypeScript** throughout

---

## Architecture

```
src/
├── main/           ← Electron main process
│   ├── index.ts    ← app lifecycle, tray, IPC setup
│   ├── api.ts      ← all IPC handlers (~20 channels)
│   ├── dashboard.ts← analytics computations
│   ├── lib/
│   │   ├── db.ts       ← SQLite, lazy init, userData path, dedup logic
│   │   └── settings.ts ← settings load/save, Google Drive sync
│   └── jobs/       ← pollers: ShipStation, Shopify, Amazon, YouTube, Meta
├── preload/
│   └── index.ts    ← IPC bridge + window.electron
└── renderer/
    └── src/
        ├── main.tsx        ← fetch shim (routes /api/ → IPC)
        ├── App.tsx         ← React Router, RefreshContext
        ├── pages/          ← Dashboard, Orders, OrderDetail, Settings, TV
        └── components/     ← 31 shared components
```

**Key pattern:** Renderer calls `fetch('/api/...')`. The fetch shim in `main.tsx` intercepts these and routes them to IPC → main process. This means existing React components work without changes.

**Dual-source dedup:** Sales data comes from both ShipStation and channel-direct APIs. `directChannelExclusionSql()` in db.ts deduplicates. **Do not re-architect this without checking with Matt first.**

---

## Data sources

| Channel | Status |
|---|---|
| ShipStation | ✅ Live |
| Shopify | ✅ Live |
| Amazon FBA | ✅ Live |
| Amazon FBM | ✅ Live |
| Etsy | ❌ Banned by Etsy; token empty |
| YouTube | ✅ Live |
| Meta (FB + IG) | ✅ Live |
| TikTok | Manual entry (API approval pending) |

---

## Data storage

- **DB (packaged Mac):** `~/Library/Application Support/DashLab/dashlab.db`
- **DB (dev):** `~/Library/Application Support/dashlab/dashlab.db`
- **Settings (packaged):** `~/Library/Application Support/DashLab/settings.json`
- **Settings (dev):** `~/Library/Application Support/dashlab/settings.json`

Settings have a **4-place rule**: type definition, defaults, loadSettings merge, AND save handler. Miss one and settings silently break.

---

## How to run

### Dev mode
```bash
cd DashLab
npm run dev
```
> Note: `ELECTRON_RUN_AS_NODE=1` in shell breaks dev mode — the dev script unsets it automatically.

### Pack Mac
```bash
npm run pack:mac
# Output: dist-dashlab/mac-arm64/DashLab.app
```

### Pack Windows (for shop NUC)
```bash
npm run pack:win
# Output: dist-dashlab/win-unpacked/DashLab.exe
```

### Update flow (Matt + Seth)
1. `git pull`
2. `npm install` (in DashLab/)
3. `npm run pack:mac` or `npm run pack:win`
4. Replace /Applications/DashLab.app with new build

---

## What's done

- All live data: ShipStation, Shopify, Amazon FBA/FBM, YouTube, Meta
- Dashboard, Orders, OrderDetail, Settings, TV view
- Soft refresh (no white flash) via RefreshContext
- Config import/export (Settings → Config tab)
- Google Drive config sync (Settings → Config Sync tab)
- Auto-start at login via `app.setLoginItemSettings`
- Single-instance lock
- Tray icon: click to show, right-click → Open / Quit
- Mac .app built and installed

---

## What's left (priority order)

1. **Verify sounds** — ka-ching on new order, grunt on new follower
2. **Windows .exe build** — for shop NUC; run `npm run pack:win`, test on Windows
3. **Add Seth as GitHub collaborator** — `gh repo add-collaborator mattlukc/dashlab SETH_USERNAME`
4. **Auto-update from GitHub releases** — electron-updater is NOT yet installed or configured; publish config is `null`. Needs electron-updater added as a dependency and a GitHub publish config.
5. **Write install/update doc for Seth** — simple: clone, npm install, pack, done
6. **Full end-to-end test** — all pages, settings, refresh, Google Drive sync
7. **Print queue rearchitecture** — planned before the Electron rewrite, still needed

---

## Gotchas

- Don't run `codesign --force --deep` on packaged app — breaks Electron's framework signature
- better-sqlite3 is rebuilt for Electron ABI via `postinstall` — don't rebuild for system Node
- `ELECTRON_RUN_AS_NODE=1` in shell breaks `npm run dev`
- Old folders (`NeatBoard/app/` Next.js, `NeatBoard/electron/`) are kept as backup — do not delete

---

## How to work with Matt

- **Short bulleted replies** in plain English, no jargon in chat
- **All Claude Code prompts** go in a fenced code block so Matt can copy-paste into VS Code
- **Label clearly:** CC prompt vs chat comment
- **Every CC prompt ends with a `## Cowork Summary` section:**
  ```
  **Status:** [one line]
  **Files created/changed:** [bullet list]
  **Errors (if any):** [paste or "None"]
  **Next step:** [one sentence]
  ```
- **Propose non-trivial work** before diving in — get Matt's OK first
- **Never suggest stopping or pausing** — Matt decides when done
- **Action items for Matt go BELOW the CC prompt block**, not above
- Use **real Shopify Polaris components** for any new UI
- **Don't re-architect the dual-source/dedup model** without asking Matt first
