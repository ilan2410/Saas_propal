# Organization access checks

Run the application regression tests with `npm test` and the type check with
`npx tsc --noEmit`.

`organization-access.sql` creates a small Supabase-compatible fixture and applies
the actual repository migrations. Run it **only in an empty disposable PostgreSQL
database**, using:

```sh
psql -v ON_ERROR_STOP=1 -f test/security/organization-access.sql
```

Repeat in a second empty database with `-v rollback_without_helpers=true` to
exercise rollback when none of the hardening helpers previously existed.
After that second variant, run `test/security/organization-rollback-failure.sql`
in the same fixture database. It deliberately produces two errors and verifies
atomic refusal when a later object depends on a new helper or the snapshot has
already been consumed; its final assertions must still pass.

It checks tenant isolation, owner/commercial/admin access, inactive accounts,
template restrictions, catalogue writes, private columns, payment records and
Storage access. The fixture is not a production migration.

## Release migration

Deploy the application changes together with
`supabase/migrations/2026-10-11_organization_access_hardening.sql`. Apply the SQL
using the database administrator/migration account, after the prior repository
migrations (including organization members, allowed templates and storage_org_id).

The migration is transactional and can be reapplied. It replaces permissive
policies, removes direct access to private columns, reserves payment writes and
credit RPCs for the service role, and makes document/template/output buckets
private. Existing canonical object URLs stay in the database; the application
uses authorized, short-lived URLs for previews, downloads and AI extraction.

Complete JSON and detailed XLSX history exports are reserved for the organization
owner. Commercial billing access still permits the normal billing views; it does
not grant a complete export of colleagues' dossiers. Prompts and AI models are
server-owned; field/merge editing continues to update the prompt on the server.

These checks were run against a disposable local database. No remote migration or
deployment is performed by the test suite.

## Rollback

Use the **updated** hardening migration: it now saves the actual pre-migration
policies, table/column/function grants, existing helper functions and triggers,
and bucket visibility in the restricted `organization_access_backup` schema.
Repeated applications keep the first snapshot. Do not delete that schema before
the rollback window ends.

To revert, run `supabase/rollbacks/rollback_14_organization_access_hardening.sql`
as the same migration administrator and restore the previous application release
(`main` before the hardening commit). Both scripts run in transactions. The
rollback restores previous security rules, including their former weaknesses and
public bucket settings; it does not delete business rows or stored files.

The rollback requires the saved snapshot and stops without making changes if it
is missing. It is not a fallback for a database that already ran the older version
of this migration without snapshot capture. Run it before making subsequent
policy/grant/schema changes: it restores the captured access state of the affected
objects. After rollback the snapshot is consumed; a new rollout captures a fresh
baseline. The integration fixture verifies migration, reapplication, exact access
restoration, data preservation and a fresh rollout.
