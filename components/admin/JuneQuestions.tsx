'use client'

// QUESTIONS tab in the June Inbox — what June couldn't answer, grouped, with a
// draft knowledge line for each. SAVE goes through the same /api/admin/kb/proposal
// route as the coaching cards, so it is still the only way into agent_kb.

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#d4a843'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const small: React.CSSProperties = { fontFamily: mono, fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)' }
const btn = (primary = false): React.CSSProperties => ({
  background: primary ? GOLD : 'transparent', color: primary ? '#080808' : 'rgba(255,255,255,0.7)',
  border: primary ? 'none' : '1px solid rgba(255,255,255,0.2)', borderRadius: 4,
  padding: '7px 12px', fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', cursor: 'pointer',
})
const input: React.CSSProperties = {
  width: '100%', background: '#111', color: '#fff', border: '1px solid rgba(255,255,255,0.15)',
  borderRadius: 4, padding: '8px 10px', fontFamily: 'Inter', fontSize: 13, lineHeight: 1.5, boxSizing: 'border-box',
}

type Proposal = { id: string; mode: string; kb_id: string | null; topic: string; content: string; reason: string | null; status: string }
type Group = {
  id: string; label: string; ask_count: number; examples: string[]; conversation_ids: string[]; channels: string[]
  status: string; first_asked_at: string | null; last_asked_at: string | null; proposal: Proposal | null
}
type Ungrouped = { id: string; conversation_id: string | null; channel: string | null; question: string; created_at: string }

const when = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : ''

function Transcript({ id }: { id: string }) {
  const [msgs, setMsgs] = useState<any[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    fetch(`/api/admin/inbox/${id}`).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) setErr(d?.error || `Couldn't load (${r.status})`); else setMsgs(d.messages ?? [])
    })
  }, [id])
  if (err) return <div style={{ fontSize: 12, color: '#f87171' }}>{err}</div>
  if (!msgs) return <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Loading…</div>
  return (
    <div style={{ borderLeft: '2px solid rgba(255,255,255,0.1)', paddingLeft: 10, marginTop: 6 }}>
      {msgs.filter(m => m.role !== 'system' && m.role !== 'draft').slice(-12).map((m, i) => (
        <div key={m.id ?? i} style={{ fontSize: 12, lineHeight: 1.5, marginBottom: 6, color: m.role === 'user' ? '#fff' : 'rgba(255,255,255,0.6)', whiteSpace: 'pre-wrap' }}>
          <span style={{ ...small, marginRight: 6, color: m.role === 'user' ? GOLD : 'rgba(255,255,255,0.4)' }}>
            {m.role === 'user' ? 'CUSTOMER' : m.role === 'teddy' ? 'YOU' : 'JUNE'}
          </span>
          {String(m.content ?? '').slice(0, 800)}
        </div>
      ))}
    </div>
  )
}

function GroupCard({ g, onChanged }: { g: Group; onChanged: () => void }) {
  const [topic, setTopic] = useState(g.proposal?.topic ?? '')
  const [content, setContent] = useState(g.proposal?.content ?? '')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showChats, setShowChats] = useState(false)
  const p = g.proposal
  const pending = p?.status === 'pending'
  const blanks = /\[FILL IN/i.test(content)

  const decide = async (action: 'save' | 'dismiss') => {
    if (!p) return
    setBusy(action); setErr(null)
    const r = await fetch('/api/admin/kb/proposal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: p.id, action, topic, content }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(d?.error || `Failed (${r.status})`); return }
    onChanged()
  }
  const setStatus = async (action: 'ignore' | 'reopen' | 'done') => {
    setBusy(action); setErr(null)
    const r = await fetch('/api/admin/june-questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: g.id }),
    })
    const d = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok) { setErr(d?.error || `Failed (${r.status})`); return }
    onChanged()
  }

  const closed = g.status !== 'open'
  return (
    <div style={{ border: `1px solid ${closed ? 'rgba(255,255,255,0.08)' : 'rgba(212,168,67,0.35)'}`, borderRadius: 8, padding: 16, marginBottom: 12, opacity: closed ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: '#fff' }}>{g.label}</div>
        <div style={{ ...small, color: g.ask_count > 1 ? GOLD : small.color, whiteSpace: 'nowrap' }}>
          ASKED {g.ask_count}× {closed ? `· ${g.status.toUpperCase()}` : ''}
        </div>
      </div>
      <div style={{ ...small, marginTop: 4 }}>
        {(g.channels ?? []).join(' · ').toUpperCase()} · LAST {when(g.last_asked_at)}
      </div>

      <div style={{ marginTop: 10 }}>
        {(g.examples ?? []).slice(0, 3).map((ex, i) => (
          <div key={i} style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', fontStyle: 'italic', lineHeight: 1.5 }}>“{ex}”</div>
        ))}
      </div>

      {(g.conversation_ids?.length ?? 0) > 0 && (
        <div style={{ marginTop: 8 }}>
          <button style={{ ...btn(), padding: '4px 8px', fontSize: 10 }} onClick={() => setShowChats(s => !s)}>
            {showChats ? 'HIDE CHATS' : `SEE ${Math.min(g.conversation_ids.length, 3)} CHAT${g.conversation_ids.length === 1 ? '' : 'S'}`}
          </button>
          {showChats && g.conversation_ids.slice(-3).map(id => <Transcript key={id} id={id} />)}
        </div>
      )}

      {p && pending && !closed && (
        <div style={{ marginTop: 14, background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.25)', borderRadius: 6, padding: 12 }}>
          <div style={{ ...small, color: GOLD, marginBottom: 6 }}>
            JUNE'S DRAFT ANSWER · {p.mode === 'update' ? 'UPDATES AN EXISTING ENTRY' : 'NEW ENTRY'}
          </div>
          {p.reason && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 8, lineHeight: 1.5 }}>{p.reason}</div>}
          <input style={{ ...input, marginBottom: 6, fontFamily: mono, fontSize: 12 }} value={topic} onChange={e => setTopic(e.target.value)} />
          <textarea style={{ ...input, minHeight: 110, resize: 'vertical' }} value={content} onChange={e => setContent(e.target.value)} />
          {blanks && (
            <div style={{ fontSize: 12, color: '#f0b75a', marginTop: 6 }}>
              Replace every [FILL IN …] before saving — June would read it out word for word.
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
            <button style={{ ...btn(true), opacity: blanks ? 0.4 : 1, cursor: blanks ? 'not-allowed' : 'pointer' }} disabled={!!busy || blanks} onClick={() => decide('save')}>
              {busy === 'save' ? 'SAVING…' : 'SAVE TO HER KNOWLEDGE'}
            </button>
            <button style={btn()} disabled={!!busy} onClick={() => decide('dismiss')}>NO THANKS</button>
          </div>
        </div>
      )}
      {p && !pending && !closed && (
        <div style={{ ...small, marginTop: 12 }}>DRAFT {p.status.toUpperCase()}</div>
      )}
      {!p && !closed && (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 12 }}>
          No draft for this one. Add it yourself on the KNOWLEDGE tab if it's worth teaching her.
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        {closed
          ? <button style={btn()} disabled={!!busy} onClick={() => setStatus('reopen')}>REOPEN</button>
          : <>
              <button style={btn()} disabled={!!busy} onClick={() => setStatus('done')}>MARK HANDLED</button>
              <button style={btn()} disabled={!!busy} onClick={() => setStatus('ignore')}>IGNORE</button>
            </>}
      </div>
      {err && <div style={{ fontSize: 12, color: '#f87171', marginTop: 8 }}>{err}</div>}
    </div>
  )
}

export default function JuneQuestions() {
  const [groups, setGroups] = useState<Group[] | null>(null)
  const [ungrouped, setUngrouped] = useState<Ungrouped[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [runMsg, setRunMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    const r = await fetch('/api/admin/june-questions')
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d?.error || `Couldn't load (${r.status})`); return }
    setErr(null); setGroups(d.groups ?? []); setUngrouped(d.ungrouped ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  const runNow = async () => {
    setRunning(true); setRunMsg(null)
    const r = await fetch('/api/admin/june-questions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'run' }),
    })
    const d = await r.json().catch(() => ({}))
    setRunning(false)
    setRunMsg(r.ok
      ? (d.questions ? `Grouped ${d.questions} question${d.questions === 1 ? '' : 's'} · ${d.proposals} draft${d.proposals === 1 ? '' : 's'} written` : 'Nothing new to review.')
      : `Review failed: ${d?.error || r.status}`)
    load()
  }

  const open = (groups ?? []).filter(g => g.status === 'open')
  const closed = (groups ?? []).filter(g => g.status !== 'open')

  return (
    <div style={{ maxWidth: 780 }}>
      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 16 }}>
        Every time June can't answer something, she quietly notes the question. Each Monday morning they're grouped here with a
        draft answer. <span style={{ color: GOLD }}>Nothing reaches her knowledge until you tap SAVE.</span>
      </div>

      {err && <div style={{ fontSize: 13, color: '#f87171', marginBottom: 16 }}>{err}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ ...small, color: ungrouped.length ? GOLD : small.color }}>
          {ungrouped.length} NEW SINCE THE LAST REVIEW
        </div>
        <button style={btn(ungrouped.length > 0)} disabled={running || ungrouped.length === 0} onClick={runNow}>
          {running ? 'REVIEWING…' : 'REVIEW NOW'}
        </button>
        {runMsg && <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{runMsg}</div>}
      </div>

      {ungrouped.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {ungrouped.slice(0, 10).map(q => (
            <div key={q.id} style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              <span style={{ ...small, marginRight: 8 }}>{when(q.created_at)} · {(q.channel ?? 'web').toUpperCase()}</span>{q.question}
            </div>
          ))}
          {ungrouped.length > 10 && <div style={small}>+{ungrouped.length - 10} MORE</div>}
        </div>
      )}

      {groups && open.length === 0 && ungrouped.length === 0 && !err && (
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          Nothing open. June hasn't hit a question she couldn't answer since the last review.
        </div>
      )}
      {open.map(g => <GroupCard key={g.id} g={g} onChanged={load} />)}

      {closed.length > 0 && (
        <>
          <div style={{ ...small, margin: '28px 0 10px' }}>RECENTLY HANDLED</div>
          {closed.map(g => <GroupCard key={g.id} g={g} onChanged={load} />)}
        </>
      )}
    </div>
  )
}
