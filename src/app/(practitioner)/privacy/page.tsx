/**
 * The plain-language privacy note (rubric item 13, tier 3 — "a visible privacy
 * policy … explains POPIA compliance in plain language").
 *
 * Linked from the consent tick, the log form and the nav, so it is reachable
 * at the moment it matters rather than buried.
 *
 * This describes what the app actually does. If a claim here stops being true
 * — a field added, an export widened — this page is wrong and must change with
 * it.
 *
 * OWNER: Stream 2. Content to be confirmed by the HSA before go-live.
 */
import type { Metadata } from 'next'

import { AppShell } from '@/components/shell/AppShell'

export const metadata: Metadata = {
  title: 'Privacy & POPIA · HSA Daily Patient Log',
  description:
    'What this app collects, what it never collects, and how it meets POPIA.',
}

export default function PrivacyPage() {
  return (
    <AppShell>
      <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
        Privacy, in plain language
      </h1>
      <p className="mt-2 text-[15px] text-neutral-600 dark:text-neutral-300">
        This app exists to count what South African homeopaths treat. It is built
        so that it <em>cannot</em> collect anything about a patient.
      </p>

      <Section title="What you record">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>How many new patients and returning patients you saw that day.</li>
          <li>
            For each of those patients, which conditions you treated — chosen from
            a fixed list, and as many or as few as you want to itemise.
          </li>
          <li>
            For each condition: how you arrived at the diagnosis, and whether a
            conventional medical practitioner is involved.
          </li>
        </ul>
        <p className="mt-2">
          Recording condition by condition <em>per patient</em> is what lets the
          study say how often one person presents with more than one thing. It
          does not add anything about who that person is.
        </p>
      </Section>

      <Section title="What is never collected">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Patient names, initials, or any patient reference.</li>
          <li>ID numbers, dates of birth, contact details or addresses.</li>
          <li>Age, sex, file numbers or medical aid details.</li>
          <li>Clinical notes, prescriptions or case histories.</li>
        </ul>
        <p className="mt-2">
          There is no field for any of these anywhere in the app, and none in the
          database behind it. That is the safeguard — not a promise to be careful.
        </p>
        <p className="mt-2">
          A patient you record today and the same person returning next week are
          two unrelated entries. Nothing in the app can connect them, including
          for you — so no individual can be followed through the data.
        </p>
      </Section>

      <Section title="What the researchers see">
        <p>
          Your entries reach the research team attached to an{' '}
          <strong>anonymous practitioner ID</strong> and, if you gave it, your{' '}
          <strong>province</strong>. Your email address, your name and your
          practice name are never included in any dashboard view or CSV export.
          Your email is used for one thing: sending you your daily logging link.
        </p>
      </Section>

      <Section title="If you sign in with Google">
        <p>
          Signing in with Google is optional — the link in your reminder does
          the same job. If you use it, Google tells this app two things: the
          email address you signed up with, and the name on your Google
          account. It is not given your password, your contacts, your calendar
          or anything else, and it cannot act on your Google account.
        </p>
        <p className="mt-2">
          That check is only ever used to recognise you. It never creates a
          participant on its own: if Google confirms an address that has not
          signed up, you are taken to the sign-up form to tick the consent box
          yourself. And nothing about it reaches the research dataset — the
          researchers see the same anonymous ID and province they would have
          seen anyway.
        </p>
      </Section>

      <Section title="Your consent">
        <p>
          Ticking the box at signup is your consent to take part. There is no
          separate form and no confirmation email. You can withdraw at any time by
          emailing{' '}
          <a className="underline" href="mailto:data@hsa.org.za">
            data@hsa.org.za
          </a>
          , and your entries will be removed from the dataset.
        </p>
      </Section>

      <Section title="How this meets POPIA">
        <p>
          POPIA governs personal information about identifiable people. Because no
          patient is identifiable from anything stored here, the patient data in
          this study is not personal information under the Act. The only personal
          information processed is <em>yours</em> as a practitioner — your name and
          email — which is collected with your consent, used solely to operate the
          study, kept separate from the research dataset, and deleted on request.
        </p>
      </Section>

      <p className="mt-8 text-xs text-neutral-500 dark:text-neutral-400">
        Homoeopathic Association of South Africa · October 2026 data collection.
      </p>
    </AppShell>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-50">
        {title}
      </h2>
      <div className="mt-1.5 space-y-2 text-[15px] leading-relaxed text-neutral-700 dark:text-neutral-200">
        {children}
      </div>
    </section>
  )
}
