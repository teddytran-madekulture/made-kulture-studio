import { redirect } from 'next/navigation'

// The home-page photo editor was merged into the unified Website editor, now
// in the Website workspace at /admin/website/home. Redirect any old
// links/bookmarks there.
export default function HomepageEditorRedirect() {
  redirect('/admin/website/home')
}
