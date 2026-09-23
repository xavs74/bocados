# Sync — proposal

Step 3 of accounts: your foods, days, weights and goals follow you from one
device to another, and survive a lost phone.

Today everything lives in the phone's own storage. Accounts exist (step 2) but
hold only who you are. This is the step where your food data leaves the device
for the first time, so it decides what is stored, where, and what happens the
first time two devices meet.

**Nothing here is built yet.** The decisions at the end are agreed; the rest is
the plan they came from.

## What has to be true

- **Offline first, still.** The app keeps working with no connection, exactly as
  now. Sync is something that happens afterwards, never something you wait for.
- **No silent loss.** No merge rule may throw away a day someone logged.
- **Optional.** Someone who never signs in keeps today's app, unchanged.
- **Reversible.** Deleting the account deletes what was synced, and the export
  includes it.

## 1. The identifiers, and why they come first

Every food, entry, recipe and planned item is numbered by the device: `++id` in
`src/db.ts`. Two phones both hand out id 5, to different foods. Entries point at
foods by that number (`entries.foodId`), recipes carry ingredients that do the
same, and a recipe and its food point at each other. Sync cannot start until an
id means the same thing everywhere.

Two ways:

**A. Add a second identifier.** Each row keeps its number and gains a `uid`
(random, unique everywhere). Sync speaks `uid`; the app keeps speaking numbers.
Nothing existing is rewritten, so the migration is nearly free. The cost is
permanent: every reference has to be translated on the way out and back in
(`foodId` → that food's `uid` → the other phone's number), and anything that
arrives before the food it points at has to wait.

**B. Make the identifier a random string everywhere.** `id` becomes a `uid`, in
every table and every reference. One migration rewrites what exists, and after
that sync is dumb: an entry says `foodId: "e3b0c442…"` and that is the same food
on every device, for ever.

**I recommend B**, despite the riskier migration, because A pays a translation
tax on every future feature, and translation bugs are exactly the kind that lose
data quietly. The migration is a one-off that can be tested hard: the tests now
run against a real IndexedDB (`fake-indexeddb`) and a real SQLite, and a copy of
everything is written to a file before it runs, so a bad migration is
recoverable rather than fatal.

## 2. Tracking what changed

Each row gains `updatedAt` (when it last changed, in milliseconds). Deletions
become **tombstones**: deleting a row writes its `uid` and the time into a
`tombstones` table, through Dexie's `deleting` hook so nothing can forget.
Without them, a day deleted on the phone comes back from the laptop at the next
sync.

Tombstones are dropped after 90 days, by which point every device has caught up.

## 3. What the server stores

One table, on top of the accounts already there:

```sql
CREATE TABLE items (
  seq       INTEGER PRIMARY KEY AUTOINCREMENT, -- the order changes happened
  user_id   TEXT NOT NULL,
  kind      TEXT NOT NULL,   -- food | entry | recipe | mealSet | planned | weight | setting
  uid       TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted   INTEGER NOT NULL DEFAULT 0,
  data      TEXT,            -- the row as JSON, or null when deleted
  UNIQUE (user_id, kind, uid)
);
```

The server never looks inside `data`. It stores rows, hands back what changed,
and nothing else. That keeps every future field a client-side change, and it
keeps the server ignorant of what you eat in any structured way.

## 4. The protocol

One address: `POST /sync`.

```
→ { since: 1234, items: [ { kind, uid, updatedAt, deleted, data }, … ] }
← { cursor: 1290, items: [ … everything for this account after `since` … ] }
```

- **Sending:** the device sends what changed since its last successful sync.
- **Receiving:** the server replies with everything newer than the device's
  cursor, which the device writes into its own database.
- **Conflicts:** last write wins, by `updatedAt`, with the `uid` breaking a tie
  so both devices decide the same way. For a food edited in two places, that is
  the right answer. For a day's entries it barely arises: different entries are
  different rows.
- **The clock:** devices disagree about the time. The server stamps what it
  receives and refuses timestamps far in the future, so a phone with a wrong
  clock can't pin a row permanently ahead of everything else.
- **Batching:** a first upload of a year's logging is a few thousand rows, sent
  in batches of, say, 200, resumable if the connection drops.

**When it runs:** when the app opens, a few seconds after a change (so a burst
of typing is one sync), and on a "Sincronizar ahora" button. Never blocking a
screen.

## 5. The first sign-in, which is the real decision

Your iPhone has months of real logging. Your Android has an imported copy. Your
mother's phone has her own. What happens when a device with data signs into an
account that also has data?

1. **Merge** — both sets are kept. Because `uid`s are unique per device, nothing
   overwrites anything; the union is simply everything. The cost is duplicates:
   if both phones have their own "Pan blanco", the account ends up with two.
2. **The account wins** — the device's data is replaced. Simple, and it quietly
   destroys whatever was only on that phone.
3. **The device wins** — the account is replaced with this phone's data. Same
   problem, pointing the other way.

**Agreed: the account wins, with a way out.**

- **An empty account** takes whatever the device has, with nothing asked. This is
  every first sign-in today.
- **When both sides have data**, one screen, with the real counts:

  > Tu cuenta ya tiene **312 días apuntados**. Este móvil tiene **7 días** que no
  > están en tu cuenta.
  >
  > [Usar los de la cuenta] [Juntarlos]

  "Usar los de la cuenta" is the main button and replaces what the device holds.
  "Juntarlos" is plain syncing, which costs nothing to offer and is the only
  answer that cannot lose a day.
- **Before anything is replaced**, the device exports a copy of itself to a file,
  so a wrong tap is recoverable.

Settings are the exception: `goals` and `meals` are single-valued, so the most
recently changed one wins, like any other conflict.

## 6. Cost, on the free plan

Each person writes roughly 15–30 rows a day (entries, the odd food, a weight).
Cloudflare's free plan allows 100,000 row writes a day, so the ceiling is a few
thousand daily users. A year of one person's logging is about 2 MB, against a
500 MB database. The first sync of an existing phone is the biggest single
moment, and it is a few thousand rows once.

## 7. Where the database lives — done

A D1 database can only be pinned to the EU when it is created. The first one was
not, and sat in Western North America, so it was replaced by
`bocados-cuentas-eu`, created with `--jurisdiction=eu`, while it still held a
single account. Once these tables hold what people eat, that is health data
under GDPR, and it now lives where it should.

## 8. What could go wrong

- **The migration.** Rewriting every identifier is the single riskiest change in
  the app's history. Mitigations: a copy exported to a file automatically before
  it runs, tests over a real IndexedDB including the reference rewriting, and it
  ships on its own, with nothing else in the release.
- **Duplicate foods after a merge**, as above: visible, and fixable by hand.
- **A shared phone.** Two people, one device, one account: the second person's
  data would merge into the first's. Signing out must clear the device's data,
  and that needs a confirmation that says so.
- **Half-synced state.** A connection that drops mid-upload must be safe to
  retry; the `UNIQUE (user_id, kind, uid)` plus last-write-wins makes sending
  the same row twice harmless.
- **A silent stop.** If sync fails repeatedly, the app has to say so, quietly but
  visibly, instead of pretending. Accounts already have the pattern: the screen
  says what the server cannot see.
- **Health data on a server** changes what the app is, legally. Step 4 (privacy
  policy, consent, the wording at sign-in) stops being optional the moment this
  ships, even for family use.

## 9. Order of work

1. **Identifiers and tombstones**, client only, no server: the migration, the
   automatic copy before it, `updatedAt`, the tombstones table, and tests. The
   app behaves exactly as before; nothing syncs.
2. **The server side**: the `items` table, `POST /sync`, and its tests.
3. **Sync in the app**: the queue, the cursor, batching, when it runs.
4. **The account screen**: the first-sign-in message, sync state, "Sincronizar
   ahora", and what signing out does to the device's data.
5. **Two real devices**, your iPhone and the Android, deliberately made to
   disagree: edits while offline, a deletion on one side, the same food added on
   both.

Steps 1 and 2 can be built and merged safely because neither changes what anyone
sees. Step 3 is where data starts moving.

## Decisions

1. **The account wins on first sign-in**, as in §5: silent upload into an empty
   account, and a screen with counts when both sides have data, offering
   "Juntarlos" and exporting a copy before replacing anything.
2. **The database is in the EU**, recreated for it (§7).
3. **Signing out asks** what to do with the device's data, and keeping it is the
   default. Wiping is for a shared phone, and says so.
4. **One account per person.** A family account is not planned.

## Later, not now

A **trainer or nutritionist** who follows someone else's plan: their own account,
granted access to another person's data by invitation, rather than two people
sharing one account. Nothing in this design blocks it — the rows already belong
to a person, so access is a question of who may read them. It needs permissions,
invitations and a way to take access back, so it is its own piece of work.
