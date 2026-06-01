# RankedBR Client

App desktop para iniciar partidas personalizadas de Valorant automaticamente.

## Como funciona

1. Jogador instala o app
2. App roda em background (bandeja do sistema)
3. Quando o site RankedBR dispara uma partida, o app:
   - Lê o lockfile do Valorant
   - Pega os tokens de autenticação
   - Chama a API interna do Valorant para iniciar o custom game

## Setup

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar Supabase
Em `src/App.jsx`, troque:
```js
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY'
```

### 3. Configurar WebSocket
Em `src/services/websocket.js`, troque:
```js
const RANKEDBR_WS = 'wss://SEU_BACKEND/ws'
```

### 4. Rodar em desenvolvimento
```bash
npm run start
```

### 5. Gerar instalador .exe
```bash
npm run build:win
```
O instalador ficará em `release/`

## Requisitos
- Node.js 18+
- Windows (para ler o lockfile do Valorant)
- Valorant instalado no PC do capitão

## Estrutura
```
rankedbr-client/
├── main.js              # Electron main process (lê lockfile, chama API Valorant)
├── preload.js           # Bridge segura entre Electron e React
├── src/
│   ├── App.jsx          # UI (Login + Dashboard)
│   ├── services/
│   │   └── websocket.js # Conexão WebSocket com o backend RankedBR
│   └── index.css        # Estilos dark theme
├── vite.config.js
└── package.json
```

## Fluxo de eventos WebSocket

### Recebidos do servidor:
```json
{ "event": "start_match", "data": { "match_id": "xxx", "map": "Ascent" } }
```

### Enviados para o servidor:
```json
{ "event": "player_ready", "data": { "puuid": "xxx" } }
{ "event": "match_started", "data": { "match_id": "xxx", "success": true } }
{ "event": "match_error", "data": { "match_id": "xxx", "error": "..." } }
```
