import { redirect } from 'next/navigation'

// The home-page photo editor was merged into the unified Website editor at
// /admin/content (photos + hero height + text in one place). Redirect any old
// links/bookmarks there.
export default function HomepageEditorRedirect() {
  redirect('/admin/content')
}
