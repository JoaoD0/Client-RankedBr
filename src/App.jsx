import { useState, useEffect } from 'react'
import { connectWebSocket, sendWsEvent, disconnectWebSocket } from './services/websocket'

const SUPABASE_URL = 'https://mkibzenbhusvlluswtwa.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raWJ6ZW5iaHVzdmxsdXN3dHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzE3MDksImV4cCI6MjA5NTkwNzcwOX0.70XE4MhhP23vgd6GfVwWU78hpF4m9uXdsV_Avlq3CeA'

async function loginWithSupabase(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error_description || data.error)
  return data
}

// ─── Login Screen ───
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin() {
    setLoading(true)
    setError('')
    try {
      const data = await loginWithSupabase(email, password)
      localStorage.setItem('rankedbr_token', data.access_token)
      localStorage.setItem('rankedbr_user', JSON.stringify(data.user))
      onLogin(data.access_token, data.user)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="screen login-screen">
      <div className="logo-area">
        <div className="logo-badge">R</div>
        <span className="logo-text">RankedBR</span>
        <span className="logo-sub">Client</span>
      </div>
      <div className="form">
        <div className="field">
          <label>Email</label>
          <input type="email" placeholder="seu@email.com" value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        <div className="field">
          <label>Senha</label>
          <input type="password" placeholder="••••••••" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()} />
        </div>
        {error && <div className="error-msg">{error}</div>}
        <button className="btn-primary" onClick={handleLogin} disabled={loading}>
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
        <p className="hint">Entre com sua conta RankedBR</p>
      </div>
    </div>
  )
}

// ─── Dashboard Screen ───
function DashboardScreen({ user, token }) {
  const [valorantStatus, setValorantStatus] = useState('checking')
  const [wsStatus, setWsStatus] = useState('offline')
  const [puuid, setPuuid] = useState('')
  const [matchStatus, setMatchStatus] = useState(null)
  const [log, setLog] = useState([])

  const addLog = (msg) => setLog(prev =>
    [`${new Date().toLocaleTimeString()} — ${msg}`, ...prev].slice(0, 20)
  )

  // Verifica Valorant a cada 5s
  useEffect(() => {
    async function checkValorant() {
      const result = await window.api.checkValorant()
      setValorantStatus(result.connected ? 'connected' : 'disconnected')
      if (result.puuid) setPuuid(result.puuid)
    }
    checkValorant()
    const interval = setInterval(checkValorant, 5000)
    return () => clearInterval(interval)
  }, [])

  // WebSocket
  useEffect(() => {
    connectWebSocket(token, async (event) => {

      if (event.event === 'connected') {
        setWsStatus('online')
        addLog('Conectado ao RankedBR')
        if (puuid) sendWsEvent('player_ready', { puuid, match_id: null })
      }

      if (event.event === 'disconnected') {
        setWsStatus('offline')
        addLog('Desconectado. Reconectando...')
      }

      // ── FASE 1: Preparar lobby e obter código ──
      if (event.event === 'start_match') {
        const { match_id, map, captain_puuid } = event.data

        if (captain_puuid !== puuid) {
          addLog(`Partida encontrada! Aguardando capitão configurar o lobby...`)
          return
        }

        addLog(`Configurando lobby... Mapa: ${map}`)
        setMatchStatus({ state: 'preparing', map, match_id })

        const prepResult = await window.api.prepareLobby({ map, match_id })

        if (!prepResult.success) {
          addLog(`❌ Erro: ${prepResult.error}`)
          setMatchStatus({ state: 'error', error: prepResult.error })
          sendWsEvent('match_error', { match_id, error: prepResult.error })
          return
        }

        const lobbyCode = prepResult.lobbyCode
        addLog(`✅ Lobby pronto! Código: ${lobbyCode || 'N/A'}`)

        sendWsEvent('lobby_code', { match_id, code: lobbyCode, map })

        setMatchStatus({ state: 'waiting_opponent', map, match_id, lobbyCode })
        addLog(`⏳ Aguardando oponente entrar no lobby...`)
      }

      // ── FASE 2: Oponente entrou, inicia a partida ──
      if (event.event === 'opponent_joined') {
        const { match_id, map } = event.data

        addLog(`Oponente entrou! Iniciando partida...`)
        setMatchStatus(prev => ({ ...prev, state: 'starting' }))

        const result = await window.api.startMatch({ map, match_id })

        if (result.success) {
          sendWsEvent('match_started', { match_id, success: true, map })
          setMatchStatus({ state: 'success', map, match_id })
          addLog(`✅ Partida iniciada! Mapa: ${map}`)
        } else {
          sendWsEvent('match_error', { match_id, error: result.error })
          setMatchStatus({ state: 'error', error: result.error })
          addLog(`❌ Erro ao iniciar: ${result.error}`)
        }
      }

      if (event.event === 'ping') sendWsEvent('pong', {})
    })
    return () => disconnectWebSocket()
  }, [token, puuid])

  const dot = (status) => (
    <span className={`dot ${status === 'connected' || status === 'online' ? 'green' : status === 'checking' ? 'yellow' : 'red'}`} />
  )

  const statusLabel = {
    connected: 'Conectado', disconnected: 'Não detectado',
    checking: 'Verificando...', online: 'Online', offline: 'Offline',
  }

  const toastMsg = () => {
    if (!matchStatus) return null
    if (matchStatus.state === 'preparing') return `⚙️ Configurando lobby... Mapa: ${matchStatus.map}`
    if (matchStatus.state === 'waiting_opponent') return `⏳ Aguardando oponente entrar no lobby...${matchStatus.lobbyCode ? ` Código: ${matchStatus.lobbyCode}` : ''}`
    if (matchStatus.state === 'starting') return `🚀 Iniciando partida...`
    if (matchStatus.state === 'success') return `✅ Partida iniciada! Abra o Valorant.`
    if (matchStatus.state === 'error') return `❌ ${matchStatus.error}`
    return null
  }

  return (
    <div className="screen dashboard-screen">
      <div className="logo-area small">
        <div className="logo-badge">R</div>
        <span className="logo-text">RankedBR</span>
        <span className="logo-sub">Client</span>
      </div>

      <div className="status-card">
        <div className="status-row">
          {dot(valorantStatus)}
          <span className="status-label">Valorant</span>
          <span className="status-value">{statusLabel[valorantStatus]}</span>
        </div>
        <div className="status-row">
          {dot(wsStatus)}
          <span className="status-label">RankedBR</span>
          <span className="status-value">{statusLabel[wsStatus]}</span>
        </div>
        <div className="status-row">
          <span className="dot blue" />
          <span className="status-label">Conta</span>
          <span className="status-value">{user?.email?.split('@')[0] || '—'}</span>
        </div>
        <div className="status-row">
          <span className="dot blue" />
          <span className="status-label">PUUID</span>
          <span className="status-value"
            style={{ fontSize: '9px', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={() => navigator.clipboard.writeText(puuid)}
            title="Clique para copiar">
            {puuid ? puuid.substring(0, 20) + '...' : 'Abra o Valorant'}
          </span>
        </div>
      </div>

      {matchStatus && toastMsg() && (
        <div className={`match-toast ${matchStatus.state === 'success' ? 'success' : matchStatus.state === 'error' ? 'error' : 'starting'}`}>
          {toastMsg()}
        </div>
      )}

      <div className="log-box">
        <div className="log-title">Log de eventos</div>
        {log.length === 0 && <div className="log-empty">Aguardando eventos...</div>}
        {log.map((l, i) => <div key={i} className="log-line">{l}</div>)}
      </div>

      <button className="btn-secondary" onClick={() => window.api.hide()}>
        Minimizar para bandeja
      </button>
    </div>
  )
}

// ─── App Root ───
export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('rankedbr_token'))
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('rankedbr_user')) } catch { return null }
  })

  return (
    <div className="app">
      <div className="titlebar">
        <span>RankedBR Client</span>
        <div className="titlebar-controls">
          <button onClick={() => window.api.minimize()}>─</button>
          <button onClick={() => window.api.hide()}>✕</button>
        </div>
      </div>
      {!token ? (
        <LoginScreen onLogin={(t, u) => { setToken(t); setUser(u) }} />
      ) : (
        <DashboardScreen user={user} token={token} />
      )}
    </div>
  )
}
