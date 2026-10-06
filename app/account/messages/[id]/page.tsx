'use client'
// /account/messages/<id> — the conversation itself lives in
// components/messages/ThreadView (phone chat screen / desktop right pane).
import { useParams } from 'next/navigation'
import ThreadView from '@/components/messages/ThreadView'
import { useIsMobile } from '@/lib/use-is-mobile'

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>()
  const isMobile = useIsMobile()
  return <ThreadView id={id} pane={!isMobile} />
}
