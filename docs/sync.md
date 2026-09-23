# Sync — proposal

Step 3 of accounts: your foods, days, weights and goals follow you from one
device to another, and survive a lost phone.

Today everything lives in the phone's own storage. Accounts exist (step 2) but
hold only who you are. This is the step where your food data leaves the device
for the first time, so it decides what is stored, where, and what happens the
first time two devices meet.

**Nothing here is built yet.** It is a plan to argue with.

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

**I recommend merging**, because it is the only one that cannot lose a day, and
duplicates are visible and fixable in Alimentos. The first sign-in on a device
that already has data should say so plainly:

> Este móvil ya tiene datos apuntados. Al entrar se juntarán con los de tu
> cuenta; no se borra nada. Si algún alimento acaba repetido, puedes borrarlo en
> Alimentos.

Settings are the exception: `goals` and `meals` are single-valued, so the most
recently changed one wins, like any other conflict.

## 6. Cost, on the free plan

Each person writes roughly 15–30 rows a day (entries, the odd food, a weight).
Cloudflare's free plan allows 100,000 row writes a day, so the ceiling is a few
thousand daily users. A year of one person's logging is about 2 MB, against a
500 MB database. The first sync of an existing phone is the biggest single
moment, and it is a few thousand rows once.

## 7. Before any of this: where the database lives

**A D1 database can only be pinned to the EU when it is created**, never
afterwards. `bocados-cuentas` was created without that constraint and currently
holds one account, so the cheap moment to fix it is now:

```bash
npx wrangler d1 create bocados-cuentas-eu --jurisdiction=eu
```

Then point `wrangler.jsonc` at the new id and sign in again. Once this table
holds what people eat, it is health data under GDPR, and "it lives in the EU" is
much easier to say if it was built that way. Doing it later means moving
everyone's data.

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

## Questions for you

1. **Merge on first sign-in**, as recommended, or should the account simply win?
2. **Recreate the database in the EU now**, while it holds one row?
3. **Should signing out wipe the device's data?** It is the safe answer for a
   shared phone, and a shock if you expected the app to keep working offline as
   before. My instinct: ask, with "keep it on this device" as the default.
4. **One account per person, or a family account?** Everything above assumes one
   per person. Sharing a plan between people is a different feature.
