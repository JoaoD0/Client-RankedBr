import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://galcbklbtdnbodgeptad.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdhbGNia2xidGRuYm9kZ2VwdGFkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA5MDYwNDUsImV4cCI6MjA4NjQ4MjA0NX0.mahzFnkFvHv1q6pqrI2Y9SuCbKKIgzBXrfduiaKsYi4'

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
  ch?.send({ type: 'broadcast', event, payload: data })
}

export function disconnectWebSocket() {
  lobbyChannel?.unsubscribe()
  matchChannel?.unsubscribe()
  lobbyChannel = null
  matchChannel = null
}