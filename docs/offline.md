# Encrypted device storage and queued transaction entry

The next-release build uses Expo SQLite with SQLCipher enabled at native build
time. Every API-origin/user pair has its own database and random 256-bit key in
SecureStore, restricted to this device while unlocked. The code checks
`PRAGMA cipher_version` before storing finance data; a binary without SQLCipher
continues online with an explicit warning and does not create plaintext finance
storage. This needs a new native build, not just a Metro reload.

Previously loaded finance reads are validated against current DTOs before reuse.
Up to 200 query snapshots remain available for 30 days. A cached profile permits
offline reopening for up to seven days, only while local session tokens remain.
Server authorization still controls all online reads/writes. Offline state is not
proof that a server session remains valid. Explicit sign-out removes the active
device vault and key, including unsynced entries; the confirmation says so. Auth
expiry locks local access but retains pending entries for the same user's next
sign-in. Other users and other API origins cannot access that vault.

Only **new transactions** can be queued. Debt mutations, posted-record edits,
deletion, restore and planning changes still need a connection. Queue records
contain the validated input and one stable UUID operation key. Pending entries
are shown separately and never added to posted balances/reports. A network error
or timeout may occur after a server commit: the same key on retry retrieves the
original result instead of posting twice. Successful acknowledgements remove the
local entry. Validation/conflict failures remain as Needs attention; they are
never silently rewritten. Transient/server/auth failures retain pending entries.

Sync runs after verified online login, reconnect/foreground and explicit Sync now.
It stops on session changes. There is no promise of sync while the app is closed.
Queue limit is 100. Retrying a rejected entry keeps the same payload/key; users can
restore its references or discard the local retry with an explicit warning that
an uncertain earlier save might already exist online.

Integration tests exercise the actual Route Handlers and disposable MongoDB with
a lost successful response, persisted queue recreation and a replayed operation.
Other tests cover conflicts, disconnection and account switching. Native cipher
availability, persistence across process death, airplane-mode entry/reconnect,
sign-out cleanup and key/DB privacy require device verification before release.
