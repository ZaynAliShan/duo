# Duo 💛 — errors-v1 (audit, 2026-08-29)

> **Fix status (same day):** everything below is **✅ fixed** except **A1 and A2** (deliberately skipped on Zain's call — both need Supabase's recovery/confirmation mailer turned on), plus the handful marked **⏸ deferred** in the "Not fixed" list at the very end. Verification: `npm test` 16/16, `next build` clean, `node scripts/negative-test.mjs` 43 → 59 checks green on the local stack with migration `20260829000002_audit_fixes.sql` applied. **Prod still needs `supabase db push`** (the migration is not applied to `bdwfrhmncmihqdlfzvsf` yet) — `bash scripts/deploy-prod.sh` does it, or push to main after `db push`.

Full read of `duo/` (schema + 3 migrations, RLS, storage policies, middleware, cron routes, provider, every page and component, docker/deploy). Findings are grouped **feature by feature**, and inside each feature ordered **by severity**. A cross-feature severity index is at the top.

Severity scale
- **🔴 Critical** — data loss / full data exposure to a stranger, or a promise the app makes that is broken for real users today.
- **🟠 High** — security weakness or correctness bug a normal user will hit; fix before more people use it.
- **🟡 Medium** — real flaw, bounded impact or needs a specific situation.
- **🟢 Low** — inconsistency, hygiene, polish, docs drift.

Status of what was verified: `npm test` → 16/16 green. Env files (`.env.local`, `.env.prod`, `.vercel`) are git-ignored and not committed ✔. RLS coverage is thorough overall — the couple boundary itself holds; the issues below are mostly *inside* the boundary or in the auth door.

---

## Severity index

| # | Sev | Feature | One-liner |
|---|-----|---------|-----------|
| A1 | 🔴 ⏸ **skipped by request** | Auth | No password reset at all → a forgotten password = permanent loss of the account **and** the couple's shared data |
| A2 | 🟠 ⏸ **skipped by request** | Auth | Anyone can register *any* email (auto-confirm, no verification) → partner's address can be squatted, and there is no recovery path |
| A3 | 🟠 ✅ | Auth | Open redirect via `?next=` on `/login` (and `//host` on `/auth/callback`) |
| T1 | 🟠 ✅ | Today / Check-in | "Blur until you post" is bypassed: the first check-in also writes a **feed moment** carrying the mood emoji + note, visible to the partner immediately |
| I1 | 🟠 ✅ | Invite / Join | 30-bit invite codes + anonymous `invite_preview` RPC + open sign-up → brute-forceable path into a stranger's Duo (all finances, photos, cycle) |
| G1 | 🟠 ✅ | Goals | Cross-couple write: `goal_contributions.goal_id` isn't checked to be in the caller's couple, and the SECURITY DEFINER trigger then flips *another couple's* `completed_at` |
| C1 | 🟠 ✅ | Cycle | Either partner can log the first period; the page then permanently shows *that* person's cycle, and there is **no way to delete/correct** cycles or logs |
| G2 | 🟡 ✅ | Goals | Contributions can't be edited or deleted from the UI (RLS allows it) — a typo'd Rs 50,000 is permanent |
| U1 | 🟡 ✅ | Us / Settings | "Leave this Duo" gives no warning that the leaver loses access to everything they logged; partner keeps it all |
| P1 | 🟡 ✅ | Ping | Pings are only a live toast — if the partner's app isn't open the ping is silently lost, contradicting "sent — they will feel it" |
| T2 | 🟡 ✅ | Today | Partner's check-in streak is computed from RLS-filtered rows → shows wrong (undercounted) streak |
| S1 | 🟡 ✅ | Storage | Avatars are never cleaned up (cleanup only sweeps `checkins`/`moments` of dead couples); `delete_account` RPC exists but no UI calls it |
| R1 | 🟡 ✅ | Realtime / perf | Every event refetches *everything* on the open page; Us/Cal/Mems load the entire `entries` table with no pagination |
| F1 | 🟡 ✅ | Feed | Hard limit of 200 entries, no "load more" — older entries unreachable from the feed |
| K1 | 🟡 ✅ | Calendar | Anniversary is **monthly** on the calendar but **yearly** in Today's countdown; ordinal text produces "1th/2th/3th/21th", and one line hard-codes "the 9th" |
| X1 | 🟡 ✅ | Security hygiene | No security headers/CSP; several helper RPCs still executable by `anon`; cookies set without `Secure`; `next` param unvalidated |
| … | 🟢 ✅ | many | see per-feature sections (a few ⏸ deferred, listed at the end) |

---

## 1. Auth (login, session, middleware)

Files: `app/login/page.jsx`, `lib/supabase/middleware.js`, `app/auth/callback/route.js`, `scripts/deploy-prod.sh` (auth_patch), `supabase/config.toml`

### 🔴 A1 — No password reset / recovery of any kind
- `app/login/page.jsx:69` literally tells the user "there's no reset email". Supabase's `resetPasswordForEmail` is never called anywhere.
- Consequence: forget the password → the account is gone, and with it half of the couple's shared world (the other partner keeps the data, the locked-out one can never rejoin as the same identity; a new account can't be re-linked because the couple is already "full").
- Fix: enable Supabase's built-in mailer for **recovery only** (the decision to skip *confirmation* emails can stand), add a "forgot password" link → `resetPasswordForEmail` → handle `type=recovery` in `/auth/callback` (the route already supports `token_hash`/`type`).

### 🟠 A2 — Any email can be registered by anyone (auto-confirm), no ownership check
- `deploy-prod.sh` sets `mailer_autoconfirm: true`; `config.toml` `enable_confirmations = false`. `signUp()` in `app/login/page.jsx:38` creates a live session for whatever address is typed.
- Squatting: if someone registers your partner's address first, the real owner gets `loginWrongPw` forever and — because of A1 — cannot recover. The app also pre-fills the last email from `localStorage` (`duo-login-email`), so on a shared device it's one tap.
- Fix: at minimum turn on confirmation **or** recovery emails so the true owner can always take the address back.

### 🟠 A3 — Open redirect through `next`
- `app/login/page.jsx:24-25`: `next = params.get("next")` → `router.replace(next)` with no validation. `/login?next=https://evil.example` (or `//evil.example`) redirects after a successful sign-in — a classic phishing primitive ("sign in to Duo" → lands on a look-alike).
- `app/auth/callback/route.js:14`: checks `startsWith("/")` but not `//`, so `next=//evil.example` still escapes. It also builds the origin from `x-forwarded-host` when `NEXT_PUBLIC_APP_URL` is unset (host-header injection in non-prod).
- Fix: accept only `^/(?!/)` paths, ideally an allow-list (`/today`, `/onboarding`, …).

### 🟡 A4 — Weak password policy, no brute-force protection beyond Supabase defaults
- Min length 6, `password_requirements = ""`, no captcha. `sign_in_sign_ups = 30 / 5 min / IP` is the only throttle. Combined with A1/A2 the door is thin for something that guards finances, photos and cycle data.

### 🟡 A5 — Middleware drops `next` for signed-in users
- `lib/supabase/middleware.js:35-40`: a logged-in user hitting `/login?next=/onboarding` (the join flow from `/join/[code]`) is bounced to `/today`, losing the intent. The invite cookie survives, but the user lands on "choose" and must tap "I have an invite" themselves (see I3).

### 🟢 A6 — Dead / drifted auth code and docs
- `/auth/callback` (magic link / OTP) is unreachable now that sign-in is password-only, but still deployed. `supabase/templates/magic_link.html`, README ("emails: Mailpit… magic link + 6-digit code") and HANDOFF ("email link **and** 6-digit code") describe the old flow.
- `profiles.theme` is written by `flipTheme` (`components/DuoProvider.jsx:72`) but never read → theme doesn't follow the user across devices; the column is dead weight.
- Sign-out (`us/page.jsx`, `waiting/page.jsx`) doesn't clear `localStorage` (`duo-login-email`, `duo-nux-v2`) or the IndexedDB offline queue — on a shared device the next person sees the previous email pre-filled and any queued rows get replayed under their session (they're rejected by RLS and dropped, but noisy).
- Service worker (`app/sw.js`, `cacheOnNavigation`) caches authenticated documents; after sign-out an offline reload can show the previous user's last page from cache.

---

## 2. Onboarding, Invite & Join

Files: `supabase/migrations/…duo_schema.sql` (`gen_invite_code`, `invite_preview`, `redeem_invite`, `create_invite`), `app/join/[code]/page.jsx`, `app/(app)/onboarding/page.jsx`, `app/(app)/waiting/page.jsx`

### 🟠 I1 — Invite codes are guessable and previewable anonymously
- `gen_invite_code()`: 6 chars from a 32-symbol alphabet = 2^30 ≈ 1.07 B combinations; valid for 7 days.
- `invite_preview(text)` is `GRANT … TO anon` (schema line 667) and returns `ok:true` + the inviter's display name for a valid code. There is no rate limit on RPCs beyond the PostgREST/API defaults. An attacker can enumerate; a hit + open sign-up (A2) → `redeem_invite` → **full membership** in a stranger's couple (every expense, photo, note, and the cycle if shared).
- Realistically slow at API rate limits, but the payoff (entire private life of two people) justifies hardening: ≥ 10 chars or a UUID in the link (keep a short code only for manual typing but require the link's secret too), shorter TTL (24–48 h), lockout after N failed previews per IP, and don't return the inviter's name until authenticated.

### 🟡 I2 — Unused invite remains redeemable after the inviter leaves and comes back / after "new code"
- `create_invite` expires old unused codes ✔, but `create_couple` invites are only invalidated by `leave_couple` when the couple isn't empty. OK in practice; just note that a screenshot of the QR is a live key for 7 days with no way to revoke *without* generating a new one (the "new code" button is the only revoke).

### 🟡 I3 — Join flow friction/edge cases
- `join/[code]/page.jsx:15`: cookie is written even for **invalid** codes; the cookie has no `Secure` flag.
- `onboarding/page.jsx:47-48` uses `me.couple_id` from the *pre-reload* closure after `await reload()`; harmless for a brand-new user, wrong if the profile changed underneath.
- Onboarding's auto-join effect (`:78`) only fires when `step` becomes `"join"` via `saveProfile`; a user who already has a name lands on `"choose"` with the code pre-filled but has to click through (see A5).
- A signed-in user who is already in a couple and opens someone else's invite gets no message at all — the cookie sits for 7 days.

### 🟢 I4 — Hygiene
- `seed_person_facts` runs again on every `redeem_invite`; leave → rejoin duplicates the nine scaffold facts.
- Lifecycle RPCs (`create_couple`, `create_invite`, `redeem_invite`, `leave_couple`, `delete_account`, `couple_members`) keep Postgres' default `EXECUTE` for `anon`. They all guard on `auth.uid()` so it's safe, but `REVOKE … FROM anon` would match the pattern the security migration already applied to the helpers.
- `couple_today()` is defined but never used.

---

## 3. Today (check-in, QOTD, ping, countdowns, glance)

Files: `app/(app)/today/page.jsx`, checkins/answers RLS

### 🟠 T1 — Blur-until-you-post is defeated by the feed moment
- RLS hides the partner's `checkins` row until you've checked in (`checkins_select`) ✔, and the storage policy hides the photo ✔.
- But `CheckInSheet.save()` (`today/page.jsx:275`) inserts an **`entries` row** `{kind:"moment", moment_emoji: mood, moment_tag:"checked in", note}` on the first check-in of the day. `entries` is fully visible to both partners → the mood emoji and the one-line note show up in **Feed**, **Memories**, **Calendar** and the Today "spent" list *before* the other person has checked in. Only the photo stays hidden.
- Fix: either don't mirror the check-in into `entries` until both have posted (a trigger could do it), or mirror it *without* mood/note, or gate the feed row with the same `has_checked_in(day)` rule.

### 🟡 T2 — Partner's check-in streak is wrong
- `ciStreak(partner.id)` (`:61`) counts rows the client can *see*, which for the partner is only the days *you also* checked in. Their 🔥 streak is undercounted whenever you skipped a day.
- Fix: compute streaks in SQL (a SECURITY DEFINER function returning just the number) or accept only showing your own streak.

### 🟡 T3 — A check-in can't be edited or redone
- The sheet only opens when `!view.myCi` (`:118`, `:137`); the `existing` branch and the `upsert` are dead in practice. Wrong mood / accidental photo is stuck for the day. Also the `mood` key is sent as `null` on a re-save path, which would wipe an earlier mood if that path were ever reached.

### 🟡 T4 — Silent failures show zeros
- All ten queries use `x.data || []` with no error handling (`:41-42`). A failed fetch (RLS, network) renders "Rs 0 spent · 0 streak · no jars" as if true. `fetchFeed` does throw, but `useLive` just `console.error`s and leaves the page blank forever.

### 🟢 T5 — Smaller
- `since` (`:25`) is recomputed on every render (new ISO string), which is fine only because it isn't in `useLive`'s deps — fragile.
- QOTD: `hashDay(today) % questions.length` — no "already asked" memory, so with ~45 questions repeats come quickly; and there is no history view of past Q&As even though `answers` keeps them.
- Countdown horizon is 400 days; a yearly mark whose next occurrence is 401+ days out disappears silently.
- Greeting uses **device** hour while "today" uses the **couple's** timezone.

---

## 4. Add entry (AddSheet), Feed, Entry edit

Files: `components/AddSheet.jsx`, `components/EntryEditSheet.jsx`, `components/FeedPost.jsx`, `lib/queries/feed.js`, `lib/offline-queue.js`, `app/(app)/feed/page.jsx`

### 🟡 F1 — Feed is capped at 200 rows, no pagination
- `fetchFeed(limit=200)` and the page never asks for more. After a few months the feed silently truncates; hearts on older entries become unreachable (Us/Calendar still show the money).

### 🟡 F2 — Entry edit can't change the date, category integrity not enforced
- `EntryEditSheet` has no date field; a backdated-wrong entry can only be deleted and re-added.
- `parseInt(amt)` on a `type="number"` input truncates "12.5" → 12 and "1e5" → 1 silently.
- `entries_insert` / `entries_update` don't check `category_id` belongs to the couple (FK only). Not exploitable across couples for reading, but a foreign UUID can be stored.

### 🟡 F3 — Realtime `hearts` upsert with `ignoreDuplicates` relies on `couple.id` from context
- Fine functionally; note that `hearts` RLS also doesn't verify `entry_id` is in the couple, so a heart can be attached to a foreign entry id (invisible to its owner, harmless, but sloppy).

### 🟢 F4 — Smaller
- Offline: a moment with a photo taken offline is saved **without** the photo and the photo is discarded (toast says so, but there's no retry). Consider queuing the blob.
- `isNetworkError` regex matches any message containing "failed" — a Postgres error text like "…failed…" without a `code` would be misclassified as transient and retried forever (`flush` breaks the loop on it).
- `uploadPhoto` falls back to the original file (possibly **HEIC**) when compression fails; browsers can't render HEIC → broken `<img>` for the partner.
- `relTime` uses device time; the feed timestamp can disagree with the calendar day (couple tz) for entries near midnight.

---

## 5. Goals (jars, contributions, bucket list)

Files: `app/(app)/goals/page.jsx`, `lib/queries/goals.js`, migration `20260829000000_review_fixes.sql`

### 🟠 G1 — Cross-couple write via `goal_contributions.goal_id`
- `gc_insert` only checks `couple_id = current_couple_id() and user_id = auth.uid()`; **`goal_id` is not constrained to the same couple.** A signed-in user who knows (or guesses — UUIDs leak in realtime payloads / URLs / support screenshots) another couple's goal id can insert a contribution pointing at it.
- The AFTER trigger `goal_contribution_changed` → `recompute_goal_completion` is SECURITY DEFINER and sums `goal_contributions where goal_id = p_goal` **regardless of couple_id**, so the victim's jar gets `completed_at` set (confetti/"DONE" on their side) even though they never see the row.
- Fix: add `and goal_id in (select id from goals where couple_id = current_couple_id())` to the insert/update policies (same pattern for `list_items.note_id`, `notes.goal_id`, `facts.about_profile_id`, `hearts.entry_id`), and make `recompute_goal_completion` filter `and couple_id = g.couple_id`.

### 🟡 G2 — No way to fix a contribution
- RLS grants own edit/delete on `goal_contributions`, but the UI has none (History is read-only). One fat-fingered zero permanently inflates "saved together", the jar %, the Us story and the recap.

### 🟡 G3 — Deleting a jar silently deletes its history
- `goals.delete()` cascades to contributions → "saved together" (Us Story sums contributions) drops, while "goals completed" only counts *existing* completed goals. Two-tap confirm exists but doesn't say history goes with it.

### 🟢 G4 — Smaller
- `BUCKET_EMOJIS[bucket.length % 6]` — the array has 10 entries; only the first 6 are ever auto-assigned.
- `sort: count` — sorting by creation count with no reorder UI; deleting a jar leaves gaps (harmless).
- `parseInt` truncation as in F2.
- Confetti check in `ContributeSheet` uses the *client's* stale `g.saved`; if the partner contributed a second ago, either nobody or both get confetti. Cosmetic.

---

## 6. Us (story, money picture, soft caps, recap, settings)

Files: `app/(app)/us/page.jsx`, `lib/recap.js`

### 🟡 U1 — "Leave this Duo" under-explains a destructive action
- `leave_couple()` sets your `couple_id = null`; every entry/photo/note you created stays in the couple and remains fully visible to the ex-partner, while you lose access to all of it (RLS is couple-scoped, not author-scoped). The button copy is "really leave? tap again 🥺" — nothing about data. No export either.
- If both leave, the couple row is deleted (cascade) and photos are swept by cron — irreversible with no confirmation of *that* consequence.

### 🟡 U2 — Two different "saved" numbers
- Goals hub "Saved toward our dreams" = Σ contributions. Us Story "saved together" = Σ contributions **+** every finished month's `max(0, cap − spent)` per capped category. Two headline numbers that disagree; the explanation lives only in the Soft-caps hint.

### 🟡 U3 — Recap "written on the 1st" isn't
- Copy (Us + landing) says Duo writes the recap on the 1st. It is generated client-side when someone opens Us, and **re-generated** whenever an entry from that month is edited later, so the "cached envelope" is neither stable nor scheduled. (HANDOFF acknowledges this.)

### 🟢 U4 — Smaller
- Soft-cap input: `Number(e.target.value)` with no lower bound; negative caps are accepted (no CHECK constraint on `categories.monthly_cap`).
- Categories: only `monthly_cap` is editable anywhere. No UI to add/rename/archive/reorder categories even though the schema has `archived`/`sort`; the landing mock shows a "Petrol" category that doesn't exist (default is "Transport").
- Changing the couple timezone re-buckets every historical entry's day (streaks, day totals) with no warning.
- `Settings` `useState(me.display_name)` + `useEffect([me])` — typing while a realtime `profiles` event arrives resets the field mid-edit.
- `Recap` upsert runs from whichever partner opens Us first; both partners can race and overwrite `payload` (no realtime on `recaps`, guarded only by a local `wrote` ref).

---

## 7. Cycle (page, log sheet, sharing) & Cycle calendar

Files: `app/(app)/cycle/page.jsx`, `lib/queries/cycle.js`, `lib/cycle.js`, `app/(app)/cal/[[...view]]/page.jsx` (CycleCal)

### 🟠 C1 — Wrong person can claim the cycle, and nothing can be undone
- Empty state shows **"Log today 🌸"** to *both* partners (`cycle/page.jsx:944`). `useCycleOwner` prefers "my rows if I have any" — so if Z taps it once (curiosity, mis-tap), the page, the calendar hub and the Today card all switch to *Z's* "cycle" and H's is hidden from him, permanently.
- There is **no delete/edit** for `cycles` or `cycle_logs` anywhere in the UI (RLS allows the owner to). A wrong start date, a period logged on the wrong day, or the mis-tap above can't be corrected. Predictions (`buildModel`) are poisoned by bad rows (it filters 15–60-day gaps but a bogus single start still shifts `nextStart`).
- Fix: an explicit "this rhythm belongs to …" choice (or infer from a profile flag), owner-only log button, and edit/delete on history rows.

### 🟡 C2 — History can only be entered 4 days back
- `off` chips are 0–4 days (`:1062`). A couple who already knows their last 6 months of dates can't seed them, so predictions run on defaults (28/5) for months. "period ended" is only offered when the open cycle is < 12 days old; after that the only button is "started", so a forgotten end is unrecoverable.

### 🟡 C3 — Privacy is all-or-nothing and labels lie in the solo case
- Sharing exposes `cycle_logs` **notes and symptoms**, not just phase/dates. Consider a "phase only" tier.
- For Z with no logs and H not sharing, `useCycleOwner` returns `{owner: me, isMe: true}` → headings read "My cycle 🌸 / My cycle calendar" on *his* screen. Cosmetic but confusing.

### 🟢 C4 — Smaller
- `PHASES` copy is medical-adjacent ("not contraception" disclaimer exists ✔) but the fertile-window text "plan accordingly 👀" is shown to the partner; fine by product intent, just flagging tone.
- `cycleInfo` returns `null` beyond two predicted cycles → the ring shows "Day — of ~28" while the prediction chips still print dates; OK but inconsistent.
- Realtime: partner's `cycles`/`cycle_logs` INSERT events are filtered by `couple_id`, but visibility depends on `shares_cycle()`; a toggle of sharing triggers `load()` via `profiles`, but open `useLive` pages don't re-fetch cycle data until another event/tick.

---

## 8. Corkboard (notes, lists, forget-me-nots)

Files: `app/(app)/notes/page.jsx`, `components/Editable.jsx`, `notes_guard` trigger

### 🟡 N1 — Destructive taps with no confirm
- Peel (`✕`) deletes a note after a 400 ms animation with no undo; a list's items cascade. Forget-me-not `✕` (`:1291`) deletes immediately — these hold birthdays/sizes/allergies.

### 🟡 N2 — Integrity gaps in RLS (same family as G1)
- `list_items.note_id`, `notes.goal_id`, `facts.about_profile_id` aren't checked to be inside the couple. Not a read leak, but foreign UUIDs can be stored and `facts.about_profile_id` could point at a stranger's profile (visible only as an orphan tab if their id ever matched).
- `notes_guard` compares `auth.uid()` to `old.user_id` but skips the check when `auth.uid()` is null (service role) — fine; just note that `notes_update` lets either partner change **color/tilt/position/pins** *and* the guard allows `kind` changes only by the author — consistent with intent.

### 🟢 N3 — Smaller
- Drag uses pointer events with `touch-action:none` on the note ✔ but a long note body inside can't be scrolled on touch.
- Board filter "Both/Me/Partner" resets on navigation; new note when partner filter is active shows a toast instead of switching.
- `note.updated_at !== created_at` → any pin/move by the partner marks the note "edited" though the words didn't change.

---

## 9. Calendars (hub, Our calendar, marks)

Files: `app/(app)/cal/[[...view]]/page.jsx`

### 🟡 K1 — Anniversary semantics disagree and ordinals are wrong
- Calendar: `isAnnivDay` uses `recursHits(couple.anniversary, "monthly", k)` — a *monthly* "our day" with "happy monthiversary" copy. Today: anniversary countdown is **yearly** ("N years of us"). Same field, two meanings.
- `:1569` renders "the {N}th" → "the 1th", "2th", "3th", "21th", "22th", "23th", "31th". `ANNIV_LINES[2]` hard-codes "the 9th never goes unnoticed" regardless of the actual day.

### 🟢 K2 — Smaller
- Mark `✕` deletes with no confirm; recurring marks (bills) go for every month at once.
- `created_by` on `calendar_marks` allows `null` in the insert policy — fine, but `kind`/`emoji` are independent fields; UI keeps them in sync, DB doesn't.
- Day cells show at most 3 dots; no indication of overflow.
- `future` styling excludes days with marks — intentional — but a future day with only a **pinned note** still renders as "future/empty" in the grid (panel shows the note).

---

## 10. Memories

Files: `app/(app)/mems/page.jsx`, `components/Photo.jsx`, `lib/photos.js`

### 🟢 M1 — Smaller
- Loads **all** moments ever, then filters client-side (see R1).
- Lightbox has no keyboard close (`Esc`) or focus management; `role="dialog"` without focus trap.
- Signed URL cache is per-tab and per-path; an avatar/check-in re-uploaded to the **same path** (`avatar.jpg`, `<day>.jpg`) with `cacheControl: 3600` can show the old image to the partner for up to an hour (CDN) and until reload (in-memory cache keyed by path only).

---

## 11. Provider / Realtime / Shell / PWA

Files: `components/DuoProvider.jsx`, `components/AppShell.jsx`, `app/sw.js`, `next.config.mjs`, `middleware.js`

### 🟡 R1 — Refetch storms and unbounded queries
- `useLive` re-runs the *whole* fetcher (Today = 10 queries; Us/Cal = full `entries` + `goal_contributions` history) on **every** realtime event for any listed table, debounced 120 ms. Both phones open + one person logging → each keystroke of activity refetches years of rows. Fine for two people today; will get slow and eat the free-tier egress as data grows. Add ranges (Us/Cal already know the visible month) or incremental updates from the payload.
- Solo-mode polling (`setInterval(load, 4000)`) runs indefinitely for anyone without a couple/partner, including a user parked on `/waiting` for days.

### 🟡 R2 — DELETE subscription is unfiltered
- Deliberate (`DELETE` payloads only carry `old`), relying on RLS + `REPLICA IDENTITY FULL`. Correct, but it means every couple's delete event is *evaluated* against every socket; at scale this is the classic Realtime hot-spot. Consider a `deleted_at` soft-delete or a per-couple `broadcast` instead.

### 🟢 R3 — Smaller
- `AppShell` shows "opening Duo…" forever if the `profiles` row is missing (trigger failure) — with the 4 s poll running underneath; no error state.
- `who()` returns `"him"` for the partner regardless — CSS-only, but the naming leaks the assumption into `wt-him`, `c-you`, etc.
- Pings (`P1`, 🟡): `pings` are only surfaced as a toast inside `fanOut`; nothing persists or notifies (no push, no badge). "sent — H will feel it 💛" is untrue when their app is closed, which is most of the time.
- `manifest.json` `start_url: /today` + middleware redirect to `/login` works; `scope: /` includes the marketing landing.
- `experimental.serverActions.bodySizeLimit` is set but no server actions exist.

---

## 12. Storage, cron & ops

Files: `supabase/migrations/…` (storage policies), `app/api/cleanup/route.js`, `app/api/keepalive/route.js`, `vercel.json`, `docker-compose.yml`, `scripts/deploy-prod.sh`

### 🟡 S1 — Orphaned objects & missing account deletion
- Cleanup sweeps `checkins` and `moments` for couples that no longer exist ✔, but **never `avatars`**, and never a *leaver's* objects while the couple survives (arguably wanted). `delete_account()` exists in SQL (deletes `auth.users` → cascades) but **no UI calls it**, so users can't delete their account or data at all.
- Cleanup lists with `limit: 1000` at each level and no pagination — silently skips beyond 1000 folders/files.

### 🟢 S2 — Smaller
- Storage `checkins read` reveals the partner photo for `day` only via `has_checked_in(storage_day(name))` — correct. `moments read` is couple-wide ✔. `avatars read` is couple-wide ✔.
- `uploadPhoto` trusts client `contentType`; bucket `allowed_mime_types` filters by declared type only. Not exploitable (served as image, private bucket), just noting.
- `deploy-prod.sh` writes API responses (incl. bucket/auth config) to `/tmp/duo-*.json` and echoes secrets into shell history-adjacent files; `set -a; . ./.env.prod` exports every secret into the environment of `npx` children (Vercel/Supabase CLIs) — expected for a deploy script, keep it off shared machines.
- `docker-compose.yml` mounts the Docker socket (documented, local-only ✔) and bakes the well-known local demo JWTs (fine).
- No `headers()` in `next.config.mjs`: no CSP, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`. Fonts load from Google (third-party request per page view).

---

## 13. Landing / copy consistency

Files: `app/page.jsx`, `lib/copy.js`, `README.md`, `HANDOFF.md`

### 🟢 L1 — Claims that don't match the app
- "Five rooms, one house" — the app has 8 tabs.
- Currency glyph "₨" on the landing vs "Rs " everywhere in the app.
- "Petrol" category in the hero mock doesn't exist.
- "Every photo you kept, as a polaroid wall" is listed under **Us**; it's the **Memories** tab.
- "On the 1st, Duo writes a recap letter" — see U3.
- "sent — {name} will feel it" — see P1.
- README/HANDOFF still describe magic-link + OTP auth and Mailpit; HANDOFF's "Verified" section predates the password switch.

---

## Suggested fix order

1. **A1/A2** — turn on recovery (and ideally confirmation) email; add "forgot password". Everything else is moot if a partner gets locked out.
2. **T1** — stop leaking mood/note through the check-in feed moment.
3. **G1 (+ N2/F3 family)** — tighten insert/update policies to check child→parent couple membership; scope `recompute_goal_completion` by couple.
4. **I1** — longer invite secret, shorter TTL, no anon name preview.
5. **A3** — validate `next`.
6. **C1/G2** — edit/delete for cycles, logs and contributions; owner-only "Log today".
7. **K1, T2, U1 copy, P1 copy** — quick correctness/copy fixes.
8. **R1/F1** — range queries + feed pagination before the data grows.


---

## What was done about each (2026-08-29)

| Item | Fix |
|------|-----|
| A3 | `safeNext()` (`lib/format.js`) gates every `?next=`: login page, middleware (which now also *honours* a safe `next` for signed-in users → A5), `/auth/callback` (rejects `//host`, only trusts `x-forwarded-host` when it looks like a hostname and `NEXT_PUBLIC_APP_URL` is unset). |
| A6 | `profiles.theme` now read on first load for a device with no local choice; `signOutClean()` (`lib/session.js`) clears the IndexedDB queue, `duo-login-email`, NUX state and SW caches on every sign-out (Us, waiting, stuck-shell); docs (README/HANDOFF) rewritten for password auth. `/auth/callback` kept for a future recovery mail. |
| I1 | Codes are 10 chars (50 bits), invites default to **48 h** (existing unused ones clamped), `invite_preview` returns no inviter name to anonymous callers; join page only stores the cookie for a *valid* code, with `Secure` on https. |
| I3 | Cookie only for valid codes; onboarding decides from a fresh `profiles` read (not the stale closure), a named user with an invite lands straight on the join step and auto-redeems; an already-linked user opening an invite gets one toast and the cookie is cleared (AppShell). |
| I4 | `seed_person_facts` idempotent; **all** helper/lifecycle functions had EXECUTE stripped from `PUBLIC` (a plain `revoke … from anon` never worked — anon inherited PUBLIC) and re-granted to `authenticated`/`service_role` (+ `supabase_storage_admin` for the storage-policy helpers); `couple_today()` now used by `checkin_streaks()`. |
| T1 | The first-check-in feed moment is now a plain `📸 checked in` with **no mood and no note** — those stay behind the blur (RLS on `checkins`) until the partner posts. |
| T2 | New SECURITY DEFINER RPC `checkin_streaks()` computes both streaks server-side; Today uses it. |
| T3 | Your own frame is always tappable; the sheet prefills mood/note and says "Update my check-in"; `mood` is only sent when set (or on a first post), so a re-save can't null it; a replaced photo gets a fresh object name and the old file is removed. |
| T4 | `useLive` now returns `[data, refresh, error]` and keeps the last good data; `must()` throws on any Supabase error; every page renders `<LoadError>` ("couldn't load … try again") instead of zeros. |
| T5 | `since` memoised per day; QOTD picks by **day number** (a rotation — no repeats until the pool wraps); greeting uses the couple's timezone. |
| P1 | Copy now says "they'll see it when they open Duo"; Today shows the partner's last ping from the past 36 h ("💛 H was thinking of you · 2h ago"); failed sends are reported. |
| F1 | Feed pages 100 at a time with "show older entries"; `fetchFeed` reports `hasMore`, chunks the hearts `IN()` list. |
| F2 | Entry edit has a **date** field (moved days land at couple-tz noon, same rule as a backdated add); all money inputs go through `parseAmount()` (whole rupees, 1–9 digits, no `12.5`/`1e5`); `entries.category_id` must be a couple category (RLS). |
| F3 | `hearts.entry_id` must be in the couple (RLS). |
| F4 | Offline moments queue **with their photo** (File stored in IndexedDB, uploaded first on replay); `isNetworkError` no longer matches any message containing "failed"; a raw HEIC fallback is refused with a friendly message instead of uploading an unrenderable file. |
| G1 | RLS on `goal_contributions` insert/update requires `goal_in_couple(goal_id)`; `recompute_goal_completion` sums only the goal's own couple. Same family: `list_items.note_id`, `notes.goal_id`, `facts.about_profile_id`, `entries.category_id`, `hearts.entry_id` — all verified by the new negative-test checks. |
| G2 | History rows you own are tappable → **ContribEditSheet** (change amount/note, two-tap remove). |
| G3 | Jar delete's second tap says how many contributions and how much money go with it. |
| G4 | `BUCKET_EMOJIS` cycles through all 10; confetti asks the DB whether the trigger just set `completed_at` instead of trusting a stale client sum. |
| U1 | "leave this Duo" second tap shows `copy.leaveWarn` (you lose access to everything, partner keeps it, irreversible); account section split out. |
| U2 | Story stat relabelled "saved together · jars + what stayed under the soft caps"; goals hub says "In the jars". |
| U3 | Recap hint (and landing) now say it's written from last month's entries the first time Us is opened in a new month. |
| U4 | Caps: `parseAmount` + `min=0` + DB CHECK `monthly_cap >= 0` (existing negatives nulled); **Categories manager** in Settings (add, rename, re-emoji, archive/unarchive — history kept); timezone change asks for confirmation and explains the re-bucketing; the name field ignores realtime overwrites while focused. |
| C1 | Empty state: first log needs a second tap after "This starts tracking YOUR cycle on this account…"; "Log today" stays owner-only; new **"fix or remove a logged period"** sheet (edit start/end dates, remove a period, remove today's log). |
| C2 | Start date picker goes back **120 days**; "period ended" is offered whenever a cycle is open (not only < 12 days); an open cycle is closed sensibly when a new start is logged. |
| C3 | Headings are neutral ("Cycle 🌸") when nobody has logged; sharing shows exactly what the partner will see. Phase-only sharing tier ⏸ deferred (schema change). |
| N1 | Peel (✕) and forget-me-not ✕ are two-tap ("sure?"), auto-disarm after 3.5 s; list peel warns items go too. |
| N2 | RLS (see G1). |
| N3 | "edited" tag removed (it lit up for pins/moves); every write reports its error. Touch-scroll inside a note / filter persistence ⏸ deferred (cosmetic). |
| K1 | Anniversary is **monthly "our day"** in both Calendar and Today; the yearly one is labelled "N years of us"; `ordinal()` gives 1st/2nd/3rd/21st; the hard-coded "the 9th" line uses the real day. |
| K2 | Mark ✕ is two-tap ("every time?" for recurring marks); inserts report errors. |
| M1 | Memories fetches only the picked stretch; lightbox closes on Esc, is focusable/`inert` when hidden, polaroids are keyboard-openable. |
| R1 | Memories range-limited; solo/waiting polling only while the tab is visible and backs off to 20 s after 5 min. Full incremental realtime for Us/Cal ⏸ deferred. |
| R3 | "opening Duo…" shows the actual error + retry/sign-out after 8 s; `serverActions` config removed. |
| S1 | Cleanup cron pages every listing (DB and storage), sweeps `avatars/` of deleted accounts, and reports errors; **"delete my account"** in Settings (two-tap, `delete_account()` RPC). |
| S2 | `next.config.mjs` ships `X-Frame-Options`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` and a **report-only** CSP (flip to enforcing once clean); deploy script writes API responses to a `mktemp` dir that is removed on exit. |
| L1 | Landing: "Rs", Transport instead of Petrol, "eight rooms — here are five", polaroid wall attributed to Memories, recap copy; README/HANDOFF updated. |

### Not fixed (on purpose)
- **A1, A2** — skipped by request. **A4** (password policy/captcha) travels with them: raising the minimum would lock out existing 6-char passwords while there is no reset path.
- **R2** — unfiltered DELETE realtime subscription is the correct Supabase pattern until a soft-delete/broadcast redesign; noted, not changed.
- **C3** phase-only sharing tier, **N3** touch-scroll/filter persistence, **K2** overflow indicator for >3 dots, **U4** recap write race between partners, **F4** feed `relTime` using device tz, **T5** a Q&A history view — all cosmetic or feature-sized; left as backlog.
