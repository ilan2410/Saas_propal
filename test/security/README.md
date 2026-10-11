# Organization access checks

Run the application regression tests with `npm test` and the type check with
`npx tsc --noEmit`.

`organization-access.sql` creates a small Supabase-compatible fixture and applies
the actual repository migrations. Run it **only in an empty disposable PostgreSQL
database**, using:

```sh
psql -v ON_ERROR_STOP=1 -f test/security/organization-access.sql
```

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
