// /account/app — set up the Made Kulture app on this device (install + notifications).
import { GetAppCard } from '@/components/MemberApp'

export const metadata = { title: 'Get the app' }

export default function AccountAppPage() {
  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.02em', margin: '0 0 14px' }}>GET THE APP</h1>
      <GetAppCard />
    </div>
  )
}
