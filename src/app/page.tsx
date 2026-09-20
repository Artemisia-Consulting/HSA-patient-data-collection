/**
 * The app's front door. Resolves the session and forwards to signup, the
 * walkthrough or the log form — see `EntryRouter`.
 *
 * Kept as a server component with a single client child so the shell is static
 * and the first paint does not wait on any JavaScript decision.
 *
 * OWNER: Stream 2.
 */
import { AppShell } from '@/components/shell/AppShell'
import { EntryRouter } from '@/components/shell/EntryRouter'

export default function Home() {
  return (
    <AppShell showNav={false}>
      <EntryRouter />
    </AppShell>
  )
}
