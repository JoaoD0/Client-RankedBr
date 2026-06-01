const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, Notification } = require('electron')
const path = require('path')
const fs = require('fs')

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

let mainWindow = null
let tray = null

// ─────────────────────────────────────────────
// Window
// ─────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    frame: false,
    transparent: false,
    backgroundColor: '#0F1923',
    icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, 'dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    e.preventDefault()
    mainWindow.hide()
  })
}

// ─────────────────────────────────────────────
// System Tray
// ─────────────────────────────────────────────
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/tray-icon.png'))
  tray = new Tray(icon)
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir NexusVLR', click: () => mainWindow.show() },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.quit() } }
  ])
  tray.setToolTip('NexusVLR Client')
  tray.setContextMenu(contextMenu)
  tray.on('double-click', () => mainWindow.show())
}

// ─────────────────────────────────────────────
// Lockfile
// ─────────────────────────────────────────────
function readLockfile() {
  try {
    const lockfilePath = path.join(process.env.LOCALAPPDATA, 'Riot Games', 'Riot Client', 'Config', 'lockfile')
    const content = fs.readFileSync(lockfilePath, 'utf-8')
    const [name, pid, port, password, protocol] = content.split(':')
    return { name, pid, port, password, protocol: protocol?.trim() }
  } catch {
    return null
  }
}

// ─────────────────────────────────────────────
// Valorant — Tokens
// ─────────────────────────────────────────────
async function getValorantTokens(lockfile) {
  const axios = require('axios')
  const credentials = Buffer.from(`riot:${lockfile.password}`).toString('base64')
  const res = await axios.get(
    `https://127.0.0.1:${lockfile.port}/entitlements/v1/token`,
    {
      headers: { Authorization: `Basic ${credentials}` },
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
    }
  )
  return {
    authToken: res.data.accessToken,
    entitlement: res.data.token,
    puuid: res.data.subject,
  }
}

// ─────────────────────────────────────────────
// Valorant — Client Version
// ─────────────────────────────────────────────
async function getClientVersion() {
  const axios = require('axios')
  try {
    const res = await axios.get('https://valorant-api.com/v1/version')
    return res.data.data.riotClientVersion
  } catch {
    return 'release-08.00-shipping-9-2280640'
  }
}

// ─────────────────────────────────────────────
// Valorant — Party ID
// ─────────────────────────────────────────────
async function getPartyId(tokens, clientVersion) {
  const axios = require('axios')
  const res = await axios.get(
    `https://glz-br-1.na.a.pvp.net/parties/v1/players/${tokens.puuid}`,
    { headers: buildValorantHeaders(tokens, clientVersion) }
  )
  return res.data.CurrentPartyID
}

// ─────────────────────────────────────────────
// Valorant — Party Data completo
// ─────────────────────────────────────────────
async function getPartyData(tokens, clientVersion, partyId) {
  const axios = require('axios')
  const res = await axios.get(
    `https://glz-br-1.na.a.pvp.net/parties/v1/parties/${partyId}`,
    { headers: buildValorantHeaders(tokens, clientVersion) }
  )
  return res.data
}

// ─────────────────────────────────────────────
// Valorant — Extrair código do party
// ─────────────────────────────────────────────
function extractLobbyCode(partyData) {
  console.log('🔍 Party keys:', Object.keys(partyData))

  const code = partyData.InviteCode
    || partyData.inviteCode
    || partyData.AccessKey
    || partyData.accessKey
    || partyData.Code
    || partyData.code
    || partyData.PartyCode
    || partyData.partyCode
    || partyData.CustomGameData?.Password
    || partyData.CustomGameData?.InviteCode
    || null

  if (!code) {
    console.log('🔍 Party data completo:', JSON.stringify(partyData))
  }

  return code
}

// ─────────────────────────────────────────────
// Valorant — Custom Game Settings
// ─────────────────────────────────────────────
async function setCustomGameSettings(tokens, clientVersion, partyId, mapName) {
  const axios = require('axios')
  const mapPaths = {
    'Ascent':   '/Game/Maps/Ascent/Ascent',
    'Bind':     '/Game/Maps/Duality/Duality',
    'Haven':    '/Game/Maps/Triad/Triad',
    'Split':    '/Game/Maps/Bonsai/Bonsai',
    'Icebox':   '/Game/Maps/Port/Port',
    'Breeze':   '/Game/Maps/Foxtrot/Foxtrot',
    'Fracture': '/Game/Maps/Canyon/Canyon',
    'Pearl':    '/Game/Maps/Pitt/Pitt',
    'Lotus':    '/Game/Maps/Jam/Jam',
    'Sunset':   '/Game/Maps/Juliett/Juliett',
    'Abyss':    '/Game/Maps/Infinity/Infinity',
    'Corrode':  '/Game/Maps/Rook/Rook',
  }
  await axios.post(
    `https://glz-br-1.na.a.pvp.net/parties/v1/parties/${partyId}/customgamesettings`,
    {
      Map: mapPaths[mapName] || mapPaths['Ascent'],
      Mode: '/Game/GameModes/Bomb/BombGameMode.BombGameMode_C',
      UseBots: false,
      GamePod: 'aresriot.aws-sa-east-1.br-gp-saopaulo-1',
      GameRules: { TournamentMode: 'true', IsOvertimeWinByTwo: 'true' },
    },
    { headers: buildValorantHeaders(tokens, clientVersion) }
  )
}

// ─────────────────────────────────────────────
// Valorant — Start Custom Game
// ─────────────────────────────────────────────
async function startCustomGame(tokens, clientVersion, partyId) {
  const axios = require('axios')
  const res = await axios.post(
    `https://glz-br-1.na.a.pvp.net/parties/v1/parties/${partyId}/startcustomgame`,
    {},
    { headers: buildValorantHeaders(tokens, clientVersion) }
  )
  return res.data
}

// ─────────────────────────────────────────────
// Headers
// ─────────────────────────────────────────────
function buildValorantHeaders(tokens, clientVersion) {
  return {
    Authorization: `Bearer ${tokens.authToken}`,
    'X-Riot-Entitlements-JWT': tokens.entitlement,
    'X-Riot-ClientVersion': clientVersion,
    'X-Riot-ClientPlatform': 'ew0KCSJwbGF0Zm9ybVR5cGUiOiAiUEMiLA0KCSJwbGF0Zm9ybU9TIjogIldpbmRvd3MiLA0KCSJwbGF0Zm9ybU9TVmVyc2lvbiI6ICIxMC4wLjE5MDQyLjEuMjU2LjY0Yml0IiwNCgkicGxhdGZvcm1DaGlwc2V0IjogIlVua25vd24iDQp9',
  }
}

// ─────────────────────────────────────────────
// IPC — Verificar Valorant
// ─────────────────────────────────────────────
ipcMain.handle('valorant:check', async () => {
  const lockfile = readLockfile()
  if (!lockfile) return { connected: false }
  try {
    const tokens = await getValorantTokens(lockfile)
    return { connected: true, puuid: tokens.puuid }
  } catch {
    return { connected: false }
  }
})

// ─────────────────────────────────────────────
// IPC — FASE 1: Preparar lobby e obter código
// ─────────────────────────────────────────────
ipcMain.handle('valorant:prepare-lobby', async (_, { map }) => {
  try {
    const lockfile = readLockfile()
    if (!lockfile) throw new Error('Valorant não está aberto')

    const tokens = await getValorantTokens(lockfile)
    console.log('✅ Tokens OK')

    const clientVersion = await getClientVersion()
    console.log('✅ Version:', clientVersion)

    const partyId = await getPartyId(tokens, clientVersion)
    console.log('✅ PartyID:', partyId)

    const partyData = await getPartyData(tokens, clientVersion, partyId)
    console.log('✅ Party state:', partyData.State)

    if (partyData.State !== 'CUSTOM_GAME_SETUP') {
      throw new Error('Crie um Jogo Personalizado no Valorant primeiro!')
    }

    await setCustomGameSettings(tokens, clientVersion, partyId, map)
    console.log('✅ Mapa configurado:', map)

    const lobbyCode = extractLobbyCode(partyData)
    console.log('✅ Código do lobby:', lobbyCode)

    return {
      success: true,
      lobbyCode,
      partyId,
      map,
    }

  } catch (err) {
    console.log('❌ ERRO prepare-lobby:', err.message)
    return { success: false, error: err.message }
  }
})

// ─────────────────────────────────────────────
// IPC — FASE 2: Iniciar partida
// ─────────────────────────────────────────────
ipcMain.handle('valorant:start-match', async (_, { map, match_id }) => {
  try {
    const lockfile = readLockfile()
    if (!lockfile) throw new Error('Valorant não está aberto')

    const tokens = await getValorantTokens(lockfile)
    const clientVersion = await getClientVersion()
    const partyId = await getPartyId(tokens, clientVersion)

    const partyData = await getPartyData(tokens, clientVersion, partyId)
    const members = partyData.Members || []
    console.log('✅ Jogadores no lobby:', members.length)

    if (members.length < 2) {
      throw new Error(`Aguardando oponente entrar no lobby. (${members.length}/2 jogadores)`)
    }

    const result = await startCustomGame(tokens, clientVersion, partyId)
    console.log('✅ Partida iniciada!')

    new Notification({
      title: 'NexusVLR',
      body: `Partida iniciada no Valorant! Mapa: ${map}`,
    }).show()

    return { success: true, data: result, match_id, map }

  } catch (err) {
    console.log('❌ ERRO start-match:', err.response?.status, err.message)
    return { success: false, error: err.message }
  }
})

// ─────────────────────────────────────────────
// IPC — Controles da janela
// ─────────────────────────────────────────────
ipcMain.handle('window:minimize', () => mainWindow.minimize())
ipcMain.handle('window:hide', () => mainWindow.hide())

// ─────────────────────────────────────────────
// App Lifecycle
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
})

app.on('window-all-closed', (e) => {
  e.preventDefault()
})
