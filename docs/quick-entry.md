# Quick transaction entry

The existing Duplicate transaction action opens a new draft with today's date.
Quick entry now also supports up to 50 named favourites stored only in the user's
encrypted device vault. Saving a favourite never creates a transaction. Using one
copies its editable details, resets the date to today and requires explicit Save.
Archived or deleted account/category references still need correction; the server
revalidates ownership, active references and base currency when posting.

Successful or durably queued saves remember the last-used account/category per
transaction type. New expense forms use the last active expense references, with
an active-account fallback. A preference-write failure never turns an already
successful financial save into a failed operation or creates another operation key.

Favourites are device-local, excluded from server JSON backups and removed on
explicit sign-out with the rest of the vault. The Quick entry screen allows removal
without touching transaction history. Device sync across installations is future
scope. Native regression coverage verifies today's date and no automatic posting.
