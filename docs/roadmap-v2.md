# Aside v2 roadmap — accounts, profiles, context-gathering

Not built yet. This maps everything from your message onto phases, and flags
the two decisions that change the architecture depending on the answer.

## The two decisions that come first

**1. Local profiles, or a real hosted account system?**
Today Aside is 100% local — no server, no accounts, one settings file on your
disk. "Ask for an email, build a history of the user, support two emails for
business vs. personal" can mean two very different things:

- **(A) Local profile switcher.** Email is just a label for a local profile
  (like switching macOS user accounts). Business/personal each get their own
  settings file on the same machine. No server, no new privacy exposure,
  buildable in isolation.
- **(B) Real accounts with a backend.** Emails + resumes + business info +
  meeting history stored centrally so "your other computer" picks up the same
  profile automatically. This needs a server, a database, auth, and a privacy
  policy — and directly contradicts the "no accounts, no telemetry" promise
  the README currently makes. It's also the actual shape of a sellable SaaS
  product, which connects back to the GPL/business-model conversation from
  earlier — a hosted backend is exactly the "open-core" piece you could
  legitimately charge for even though the client app stays open source.

These aren't a small implementation detail — they're different products.
**(A) is a weekend of work. (B) is a real infrastructure project** (hosting,
a database, an auth flow, and — the moment it holds other people's resumes —
a genuine responsibility to handle that data carefully). I'd want an explicit
answer on this before writing a line of it.

**2. How deep does calendar integration go?**
"Check your calendar for availability" needs either macOS EventKit access (a
native permission + a small native helper, since Electron doesn't read the
system Calendar app on its own) or Google Calendar OAuth (if the calendar
lives in Google). Different permission model, different code, pick one to
start.

## Phase 1 — Onboarding wizard (buildable now, no architecture decision needed)

Replaces the current 5-step tutorial with a real intake flow, all still local:

- What's this for: **Personal / Business / Fun**, and **Meetings / Interviews /
  Both** — stored as a `useCase` setting, used to pick which system-prompt
  language shows by default (the "candidate/interviewer" framing vs. a
  general "conversation copilot" framing — this is also where the app can
  fully separate interview-specific prompts from general personal/business use)
- If Business: **industry picker** (Consulting, Freelancing, Sales, Real
  estate, Photography, Other — free text) — feeds a small set of tailored
  talking-point prompts per industry, same pattern as the résumé context
  already wired in
- Résumé/background — already exists (Profile tab), just needs to move into
  the wizard flow instead of being buried in Settings
- **Job-post link** — paste a URL, Aside fetches and extracts the posting
  text into the existing "Target job description" field. New, but small:
  one `fetch()` + HTML-to-text, no new permission needed.

## Phase 2 — Local multi-profile (the (A) path above)

- A profile picker on first launch and via the logo menu: "Personal" /
  "Business" (or custom names), each its own local settings file
  (`cue-data-<profile>.json`) — meetings/flashcards/usage stay scoped per
  profile too
- Switching profiles reloads Settings instantly, no restart
- This is the piece that makes "email" meaningful without needing a server —
  the email is just how you'd label/recognize a profile, not an account

## Phase 3 — Live "what to say" for non-interview conversations

This is the photographer-with-a-client example, generalized:

- A configurable **"quick facts" panel per business type** — pricing,
  typical turnaround, calendar links — that Aside can pull into an answer
  the same way it already pulls in résumé context
- **Calendar read access** (the decision above) so "do you have availability
  Thursday" can get a real answer instead of a guess
- This reuses 100% of the existing Assist/Say pipeline — it's really a
  content problem (what context is available to inject) more than a new
  feature

## Phase 4 — Only if you go with (B), hosted accounts

- Auth (email + magic link is the simplest defensible option)
- A database for profiles/history
- Sync across devices
- At this point you're also answering the GPL business-model question for
  real, since a hosted backend is the natural place to put a paid tier

---

**My recommended order:** Phase 1 → Phase 2, both local, both don't touch the
licensing/hosting questions. Decide (B) only once you know if you actually
want to run and maintain a server long-term — that's a standing cost and
commitment, not a code change.
