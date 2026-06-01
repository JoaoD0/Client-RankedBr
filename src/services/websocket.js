import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mkibzenbhusvlluswtwa.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1raWJ6ZW5iaHVzdmxsdXN3dHdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzE3MDksImV4cCI6MjA5NTkwNzcwOX0.70XE4MhhP23vgd6GfVwWU78hpF4m9uXdsV_Avlq3CeA'

let supabase = null
let lobbyChannel = null
let matchChannel = null

export function connectWebSocket(token, onEvent) {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  lobbyChannel = supabase
    .channel('lobby-events')
    .on('broadcast', { event: 'match_found' }, ({ payload }) => {
      console.log('[WS] match_found recebido!', payload)
      onEvent({ event: 'match_found', data: payload })
      subscribeToMatch(payload.match_id, onEvent)
    })
    .subscribe((status) => {
      console.log('[WS] lobby-events status:', status)
      if (status === 'SUBSCRIBED') onEvent({ event: 'connected' })
      if (status === 'CLOSED') onEvent({ event: 'disconnected' })
    })
}

function subscribeToMatch(matchId, onEvent) {
  if (matchChannel) {
    matchChannel.unsubscribe()
    matchChannel = null
  }

  matchChannel = supabase
    .channel(`match-${matchId}`)
    .on('broadcast', { event: 'start_match' }, ({ payload }) => {
      console.log('[WS] start_match recebido!', payload)
      onEvent({ event: 'start_match', data: payload })
    })
    .subscribe((status) => {
      console.log(`[WS] match-${matchId} status:`, status)
    })
}

export function sendWsEvent(event, data) {
  const ch = matchChannel || lobbyChannel
  if (!ch) return
  ch.send({ type: 'broadcast', event, payload: data })
    .catch(err => console.error('[WS] sendWsEvent error:', err))
}

export function disconnectWebSocket() {
  lobbyChannel?.unsubscribe()
  matchChannel?.unsubscribe()
  lobbyChannel = null
  matchChannel = null
}