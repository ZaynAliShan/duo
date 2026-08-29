# Duo — how the data works (plain English)

Every couple is one `couples` row. Every person is one `profiles` row (created automatically when they first sign in) that may point at a couple. **Every other table carries `couple_id`**, and Row Level Security only ever lets you see rows where `couple_id` matches *your* couple — a third account sees nothing, anywhere.

| Table | What it is | Who can change it |
|---|---|---|
| `profiles` | name, colour, photo, theme, `cycle_shared` | only you edit your row; `couple_id` can only change via the lifecycle functions (trigger-guarded), and a trigger caps a couple at 2 members |
| `couples` | together-since, anniversary, timezone (what "today" means) | either member |
| `invites` | 6-letter codes, 7-day expiry, single use | nobody directly — `create_couple()`, `create_invite()`, `redeem_invite(code)` |
| `categories` | Food, Groceries… + optional `monthly_cap` (soft caps); `archived` instead of delete | either |
| `entries` | the feed — expenses and moments in one table (`kind`) | anyone reads; you edit/delete only your own |
| `hearts` | 💛 taps on entries | add/remove your own |
| `pings` | "thinking of you" | send as yourself |
| `checkins` | daily photo + mood + one line | your own (editable, **never deletable** — posting is what reveals your partner, so a post can't be taken back); reveal is scoped to the *current* couple |
| `questions` / `answers` | question of the day + both answers | partner's answer visible only after you've answered, in *this* couple; answers are editable, never deletable |
| `goals` / `goal_contributions` | jars + who put what in | jars: either; contributions: your own. `completed_at` is kept true by a DB trigger on every contribution/target change |
| `bucket_items` | dreams, not money | either |
| `notes` / `list_items` | corkboard stickies + shared checklists | note text/colour: author only (trigger); pins & position: either; list items: either |
| `facts` | forget-me-nots (`about_profile_id` null = Us) | either |
| `calendar_marks` | bills, trips, birthdays… (source of countdowns), with recurrence | either |
| `cycles` / `cycle_logs` | period starts/ends + daily logs | the logger only; partner can read only while the logger's `profiles.cycle_shared` is on |
| `recaps` | cached monthly envelope payload | either |

## Storage (private buckets, signed URLs)
- `checkins/<couple>/<user>/<YYYY-MM-DD>.jpg` — the blur rule is enforced here too: the partner's object is readable only via `has_checked_in(day)`.
- `moments/<couple>/<user>/<uuid>.jpg` — couple-readable.
- `avatars/<user>/avatar.jpg` — readable by you and your partner.

## Lifecycle functions (SECURITY DEFINER — the only way `couple_id` changes)
`create_couple()` (seeds 7 categories + forget-me-not scaffolding + first invite) · `create_invite()` · `invite_preview(code)` (anon-safe: inviter name + validity) · `redeem_invite(code)` (rejects unknown/used/expired/full/self/already-in-a-couple) · `leave_couple()` (last one out deletes the couple; storage is swept by `/api/cleanup`) · `delete_account()`.

## Realtime
All couple tables are in the `supabase_realtime` publication with **REPLICA IDENTITY FULL** (DELETE events otherwise carry only the primary key, so neither the couple filter nor RLS could evaluate them and removals never reached the partner). RLS applies to live events too, so blur/reveal rules hold there as well.

## Hardening (2026-08-29 review)
- Reveal helpers (`has_checked_in` / `has_answered`) are couple-scoped, and check-ins/answers are unique per `(couple_id, user_id, day)` — a row from a *previous* couple can neither unlock nor block anything in a new one.
- Check-ins and answers cannot be deleted (insert → peek at the partner → delete is closed).
- `invite_preview` answers strangers with just ok/invalid — no enumeration oracle; the inviter's name only comes back for a live code.
- `list_items.added_by`, `bucket_items.added_by`, `calendar_marks.created_by` must be your own uid on insert.
- Internal helper functions aren't anon-callable; `shares_cycle` only answers within your own couple.
- Known, accepted: `recaps.payload` is client-computed and client-writable (couple-internal cache, no cross-couple surface).
