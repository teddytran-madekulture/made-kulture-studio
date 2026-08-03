'use client'

// Talk to June about a draft, and approve what she learns.
//
// Deliberately self-contained: it owns its own fetches and state so the inbox
// page only has to render it and take back a revised draft. Two entry points —
// the instruction box (Teddy tells her what to change) and runLearn() below,
// which the page fires after he sends a reply he wrote himself.

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#d4a843'

const label: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 10,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  fontWeight: 600,
}

export interface Proposal {
  id: string
  mode: 'new' | 'update'
  kb_id: string | null
  topic: string
  content: string
  reason: string | null
  source: string
  created_at: string
}

// Fired by the inbox after Teddy sends his own reply. Best-effort by design:
// learning is a bonus on top of an email that already went out, so a failure
// here must never surface as an error on a successful send.
export async function runLearn(conversationId: string, sentReply: string): Promise<void> {
  try {
    await fetch(`/api/admin/inbox/${conversationId}/coach`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'learn', sentReply }),
    })
  } catch {
    /* ignore */
  }
}

export default function JuneCoach({
  conversationId,
  draftId,
  draftBody,
  onDraftRevised,
  refreshKey,
}: {
  conversationId: string
  draftId?: string | null
  draftBody?: string | null
  onDraftRevised?: (body: string) => void
  refreshKey?: number        // bump to re-pull proposals (e.g. after a send)
}) {
  const [instruction, setInstruction] = useState('')
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [edits, setEdits] = useState<Record<string, { topic: string; content: string }>>({})
  const [rowBusy, setRowBusy] = useState<string | null>(null)

  const loadProposals = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/kb/proposal?conversationId=${encodeURIComponent(conversationId)}`)
      if (!r.ok) return
      const d = await r.json()
      setProposals(d.proposals ?? [])
    } catch {
      /* a missing proposal list must not break the thread */
    }
  }, [conversationId])

  useEffect(() => { loadProposals() }, [loadProposals, refreshKey])

  const send = async () => {
    const text = instruction.trim()
    if (!text || busy) return
    setBusy(true); setError(null); setNote(null)
    try {
      const r = await fetch(`/api/admin/inbox/${conversationId}/coach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'revise',
          instruction: text,
          draftId: draftId ?? undefined,
          // Send what's on screen, not what's in the database — he may have
          // hand-edited the textarea before typing this.
          draftBody: draftBody ?? undefined,
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d?.error || 'That didn’t go through.'); return }
      setInstruction('')
      setNote(d.warning ? `${d.note} — ${d.warning}` : d.note)
      if (d.revisedDraft && onDraftRevised) onDraftRevised(d.revisedDraft)
      if (d.proposals?.length) setProposals(p => [...p, ...d.proposals])
    } catch (e: any) {
      setError(String(e?.message || e))
    } finally {
      setBusy(false)
    }
  }

  const decide = async (p: Proposal, action: 'save' | 'dismiss') => {
    setRowBusy(p.id)
    const e = edits[p.id]
    try {
      const r = await fetch('/api/admin/kb/proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: p.id,
          action,
          ...(action === 'save' && e ? { topic: e.topic, content: e.content } : {}),
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d?.error || 'Couldn’t save that.'); return }
      setProposals(list => list.filter(x => x.id !== p.id))
      setEdits(m => { const { [p.id]: _drop, ...rest } = m; return rest })
      if (action === 'save') setNote(`Saved — I’ll know that from now on.`)
    } catch (e2: any) {
      setError(String(e2?.message || e2))
    } finally {
      setRowBusy(null)
    }
  }

  const box: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.12)', color: '#fff', fontSize: 13,
    lineHeight: 1.5, padding: 10, outline: 'none', borderRadius: 6,
    fontFamily: 'Inter, sans-serif',
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <textarea
          value={instruction}
          onChange={e => setInstruction(e.target.value)}
          onKeyDown={e => {
            // Enter sends; Shift+Enter for a second line. Matches the reply box.
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          rows={2}
          placeholder={'Tell June what to change — "leave out the pricing", "we do have a black fabric backdrop, mention it"'}
          style={{ ...box, resize: 'vertical', flex: 1 }}
        />
        <button
          onClick={send}
          disabled={busy || !instruction.trim()}
          style={{
            ...label, alignSelf: 'stretch', padding: '0 14px', borderRadius: 4, border: 'none',
            cursor: busy || !instruction.trim() ? 'default' : 'pointer',
            background: instruction.trim() ? GOLD : 'rgba(255,255,255,0.1)',
            color: instruction.trim() ? '#080808' : 'rgba(255,255,255,0.3)',
          }}>
          {busy ? '…' : 'TELL JUNE'}
        </button>
      </div>

      {note && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 6, fontStyle: 'italic' }}>
          June: {note}
        </div>
      )}
      {error && (
        <div style={{ fontSize: 12, color: '#ff9a9a', marginTop: 6 }}>{error}</div>
      )}

      {proposals.map(p => {
        const e = edits[p.id] ?? { topic: p.topic, content: p.content }
        const isUpdate = p.mode === 'update'
        return (
          <div key={p.id} style={{
            marginTop: 10, padding: 12, borderRadius: 8,
            border: `1px solid ${GOLD}`, background: 'rgba(212,168,67,0.07)',
          }}>
            <div style={{ ...label, color: GOLD, marginBottom: 6 }}>
              {isUpdate ? '✎ UPDATE WHAT JUNE KNOWS' : '✦ SOMETHING NEW FOR JUNE TO REMEMBER'}
            </div>
            {p.reason && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8 }}>
                {p.reason}
              </div>
            )}
            <input
              value={e.topic}
              onChange={ev => setEdits(m => ({ ...m, [p.id]: { ...e, topic: ev.target.value } }))}
              style={{ ...box, marginBottom: 6, fontFamily: 'monospace', fontSize: 12 }}
            />
            <textarea
              value={e.content}
              onChange={ev => setEdits(m => ({ ...m, [p.id]: { ...e, content: ev.target.value } }))}
              rows={Math.min(10, Math.max(2, e.content.split('\n').length + 1))}
              style={{ ...box, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <button
                disabled={rowBusy === p.id || !e.topic.trim() || !e.content.trim()}
                onClick={() => decide(p, 'save')}
                style={{
                  ...label, background: GOLD, border: 'none', color: '#080808',
                  padding: '8px 14px', cursor: 'pointer', borderRadius: 4,
                }}>
                {rowBusy === p.id ? 'SAVING…' : isUpdate ? 'SAVE THE CORRECTION' : 'SAVE TO HER KNOWLEDGE'}
              </button>
              <button
                disabled={rowBusy === p.id}
                onClick={() => decide(p, 'dismiss')}
                style={{
                  ...label, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                  color: 'rgba(255,255,255,0.6)', padding: '8px 14px', cursor: 'pointer', borderRadius: 4,
                }}>
                NO THANKS
              </button>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>
              {isUpdate
                ? 'Replaces what she currently knows on this topic. Takes effect on her next reply — no deploy.'
                : 'She’ll be able to state this to customers. Takes effect on her next reply — no deploy.'}
            </div>
          </div>
        )
      })}
    </div>
  )
}
