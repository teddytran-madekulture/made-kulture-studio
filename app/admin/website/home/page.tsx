import { redirect } from 'next/navigation'

// The editor moved to the per-page route. Keep old links working.
export default function HomeEditorRedirect() {
  redirect('/admin/website/pages/home')
}
