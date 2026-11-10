import type { ReactNode } from "react";
import { Link } from "react-router";
import { supportMailto, SUPPORT_EMAIL } from "../lib/support";

const linkClass = "font-semibold text-link focus-visible:outline-2 focus-visible:outline-accent";

/** Public privacy and terms pages. No sign-in. The wording matches what the app does today. */
function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-8">
      <Link to="/welcome" className={linkClass}>
        Hoppin
      </Link>
      <h1 className="page-title text-5xl">{title}</h1>
      <div className="flex flex-col gap-5 text-sm leading-relaxed">{children}</div>
      <p className="text-sm">
        <Link to="/privacy" className={linkClass}>
          Privacy
        </Link>
        {" · "}
        <Link to="/terms" className={linkClass}>
          Terms
        </Link>
        {" · "}
        <a href={supportMailto({ subject: "A question about Hoppin" })} className={linkClass}>
          Email support
        </a>
      </p>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

/** What Hoppin keeps, who else sees it, and how to delete an account. */
export function PrivacyPage() {
  return (
    <LegalPage title="Privacy">
      <p>Hoppin is a shared place for a group trip. This page says what the app keeps today, and what it does not.</p>

      <Section title="What we keep">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Your email, and the name you show the group.</li>
          <li>You sign in with that email and a password. The password stays with the sign-in service. It is not stored with the trip.</li>
          <li>Trips, plans, expenses, polls, and documents you add.</li>
          <li>Whether you want email updates for a trip, and whether you want phone notifications for that trip. Each choice is saved on your membership, one trip at a time.</li>
          <li>If you turn phone notifications on, the token for that phone. Signing out of this phone removes that token. Deleting the account removes every token.</li>
          <li>A copy of your trips on this device, so you can open them without a connection.</li>
        </ul>
        <p>We do not sell any of this. There are no ads, and no tracking kits.</p>
        <p>We do not send error reports or content-security reports to Hoppin.</p>
      </Section>

      <Section title="Photos">
        <p>Posters are made on your phone. Photos you pick for a poster stay on the phone and are never uploaded.</p>
        <p>A ticket or scan you add as a document is different: that file is uploaded into the trip's private storage, described below.</p>
      </Section>

      <Section title="Documents">
        <p>Documents you add to a trip are stored in private storage. They are not on a public page.</p>
        <p>A shared document is visible to the approved members of that trip. A personal document is visible to you and to that trip's organizers. People who are not in the trip cannot open either one.</p>
      </Section>

      <Section title="Who else handles it">
        <p>These services see some of the data, only so the app can run:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>Supabase keeps the database, sign-in, and file storage.</li>
          <li>Cloudflare hosts the site, runs the Turnstile check on sign-in, sign-up, and password reset, and routes mail sent to {SUPPORT_EMAIL}.</li>
          <li>Resend sends email: invites, password resets, and trip update emails.</li>
          <li>Firebase Cloud Messaging delivers a phone notification, only if you turned that on. It receives the token and a short note (the trip name and how many plans changed). It does not receive your email.</li>
          <li>OpenFreeMap serves map tiles. Opening a map contacts OpenFreeMap.</li>
          <li>Photon (photon.komoot.io) answers place search. A search contacts Photon.</li>
          <li>Open-Meteo answers weather and destination lookup. Those requests contact Open-Meteo.</li>
          <li>Frankfurter answers exchange rates. A rate request contacts Frankfurter.</li>
        </ul>
        <p>Map, search, weather, and rate requests do not include your email. The public home page also loads stock photos from Unsplash. That page does not send your account.</p>
        <p>Reading a scanned ticket can download a language file so the phone can read the page. The ticket stays on the phone.</p>
      </Section>

      <Section title="Deleting your account">
        <p>Open Account, then Delete my account. Type delete to confirm.</p>
        <p>
          If you are the only organizer of a trip that still has other approved members, the account is not deleted, and nothing is removed. Make someone else an organizer, or delete that trip, then try again.
        </p>
        <p>When deletion goes through:</p>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>A trip with no other approved member is deleted with the account.</li>
          <li>Your private plans and your personal document records are deleted. Before that, the app removes the personal files it can still see from storage.</li>
          <li>Group plans, shared documents, expenses, and polls stay with the group. Plans and documents you shared, and a trip you created that other people are still in, are handed to another organizer of that trip.</li>
          <li>Invite links you created are deleted.</li>
          <li>Your sign-in, your display name, your memberships, your replies, and every phone notification token are removed.</li>
          <li>You are signed out, and the copy of trips on this device is cleared.</li>
        </ul>
        <p>A few things this step does not remove: a waiting-list row, if you joined that way (it still has your email and name); a history copy of a private plan in the change log, which other members cannot read; and a personal file from a trip you can no longer see, or the shared files of a trip that is deleted with your account.</p>
        <p>
          Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>{SUPPORT_EMAIL}</a>
        </p>
      </Section>
    </LegalPage>
  );
}

/** Short terms for a shared group trip. No promises the product does not make. */
export function TermsPage() {
  return (
    <LegalPage title="Terms">
      <p>Hoppin is a shared place for a group's trip: the days, the map, the money, the documents, and posters made on the phone.</p>
      <p>You sign in with your email and a password. There is no other way to sign in.</p>
      <p>What you add is for the people in that trip. Shared notes and files are visible to the trip's approved members. A personal document is visible to you and to the organizers.</p>
      <p>Hoppin does not take a payment. There is nothing to buy in the app.</p>
      <p>
        You can delete the account from Account, then Delete my account. The <Link to="/privacy" className={linkClass}>privacy page</Link> says what that removes, and what it leaves.
      </p>
      <p>
        Questions: <a href={`mailto:${SUPPORT_EMAIL}`} className={linkClass}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalPage>
  );
}
