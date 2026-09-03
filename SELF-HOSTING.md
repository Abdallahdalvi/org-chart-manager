# Ubiqedge on CasaOS + your Supabase

For deployment from the private GitHub repository, use [GITHUB-TO-CASAOS.md](GITHUB-TO-CASAOS.md). This page remains the general configuration reference.

**Current requested setup:** use [CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md) for Cloudflare-only sign-in and email-based editor, HR and approver permissions at `orgchart.dalvi.cloud`. The remainder of this page documents the optional legacy shared-password mode; set `APP_AUTH_MODE=basic` explicitly to use it. The new example environment defaults to Cloudflare mode and must not replace your filled-in secrets file.

The app runs in its own container on CasaOS. Records and saved versions live in your existing Supabase at `https://supabase.dalvi.cloud`. It does not depend on Sites, Cloudflare, or a ChatGPT login. Your other Supabase apps and authentication settings do not need to change.

## Before moving

1. In the current local tool, choose **Backup & restore → Save master backup**. This includes your recent edits, not just the original CSV data. Keep a separate safe copy.
2. Decide the app's HTTPS address, for example a subdomain you own. Do not use the existing Supabase API address as the app address.
3. Keep the source and build private: the server includes the initial employee dataset. The browser bundle does not include that dataset or any server keys.

## Install the database tables

Open your own Supabase SQL editor and run `supabase/001_org_chart.sql` once. This adds only:

- `public.org_chart_documents`
- `public.org_chart_snapshots`
- `public.org_chart_save(...)`

The tables have row-level security enabled and no anonymous or regular-user grants. Only the server's service-role credential can access them. The save function locks the current revision and saves its history in one transaction. Do not add public read/write policies. [Supabase guidance on securing server keys](https://supabase.com/docs/guides/database/secure-data) and [database functions](https://supabase.com/docs/guides/database/functions).

If you prefer your server terminal, after copying the project to the server, run the SQL against your existing Supabase PostgreSQL container. Use the actual container name shown by your own Docker setup; do not guess or replace any existing tables.

## Configure the app

Copy `.env.selfhost.example` to `.env.selfhost` beside `compose.casaos.yaml`, then fill in:

| Setting                     | Value                                                                                  |
| --------------------------- | -------------------------------------------------------------------------------------- |
| `APP_ORIGIN`                | The exact HTTPS app address, without a path                                            |
| `APP_USERNAME`              | Your chosen shared login name                                                          |
| `APP_PASSWORD`              | A new random password, at least 16 characters                                          |
| `SUPABASE_URL`              | `https://supabase.dalvi.cloud`                                                         |
| `SUPABASE_SERVICE_ROLE_KEY` | The `SERVICE_ROLE_KEY` from your existing Supabase configuration, **not** the anon key |

Leave `SUPABASE_ALLOW_HTTP=false` when using your HTTPS Supabase address. No `VITE_` secret is needed. Never use the Supabase dashboard password as the app password. The template contains no real credentials. Your pasted setup also contained unrelated credentials; rotate exposed secrets separately with care for the apps that depend on them.

For local testing only, `APP_ORIGIN=http://localhost:3080` is allowed. Non-local access requires HTTPS. Protect `.env.selfhost` with restrictive file permissions and do not include it in source control or shared archives. If a value contains `$` or `#`, single-quote it in the environment file to prevent Compose interpolation.

## Start on the CasaOS machine

Copy this project to a **new folder** on the server, for example `/home/abdallah2/ubiqedge-org-chart`, then run there:

```sh
docker compose --env-file .env.selfhost -f compose.casaos.yaml up -d --build
```

The container runs as a non-root user with a read-only filesystem. It appears in Docker on the CasaOS host; pinning an app tile in CasaOS is optional. No database volume is required for this app because Supabase stores the records. [Docker Compose environment-file reference](https://docs.docker.com/compose/how-tos/environment-variables/variable-interpolation/).

By default, port 3080 is bound only to the CasaOS machine's loopback address. Configure your existing HTTPS reverse proxy to reach that port. If your proxy is in a separate container, connect it to the app's Docker network and route to `org-chart:3080`, or configure an appropriate private interface binding. Do not expose an unencrypted port to the internet. Set proxy login rate limits too; the app also limits failed login attempts.

Visit the exact `APP_ORIGIN`. Your browser will ask for the configured username/password using its normal login prompt. Everyone with this shared login can edit, so share exports with read-only reviewers. Editor names and approval evidence are still manually recorded, not independently authenticated signatures.

## Bring over the current chart

Once connected, choose **Backup & restore → Restore master** and select the JSON backup from the old local tool. Restoration creates a new draft and keeps the imported change log and approval references as historical records. Check the employee count and recent changes before retiring the old setup. The first view in an empty Supabase database uses the original supplied dataset; it is not a substitute for migrating your recent local edits.

Excel imports also work, but JSON is the format that carries the full chart, change log and evidence together. Old database snapshots remain in the old local workspace; copy any additional historical snapshots you need before retiring it.

## Updates and recovery

Rebuild only the app container with the same command after updating source. The database stays in Supabase. Do not remove your existing Supabase storage or reinstall its stack. Keep regular Supabase backups and independent JSON master backups.

`npm run build:selfhost` builds the standalone app. `npm run start:selfhost` runs it with `.env.selfhost` on a machine with Node 22.13+. `npm run test:selfhost` validates the schema, access rules, concurrent saves, snapshots and server locally; it does not use your production credentials. Build first. The UI/export checks use `npm test` with the existing local app running.

## Current setup status

The Supabase API responded to a read-only check on 3 September 2026. It reported that the app's new table was missing (`PGRST205`); no production data was changed. SSH to both supplied private addresses timed out. The exact app address and working SSH access are still needed to install and start the app on your server. A successful code build is not a completed server deployment.
