import { redirect } from 'next/navigation'

// The unified Website editor moved into the Website workspace at
// /admin/website/home. Redirect any old links/bookmarks there.
export default function ContentEditorRedirect() {
  redirect('/admin/website/home')
}
