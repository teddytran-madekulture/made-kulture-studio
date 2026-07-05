import { redirect } from 'next/navigation'

// Landing for the Website workspace — Home is the first page.
export default function WebsiteIndex() {
  redirect('/admin/website/home')
}
