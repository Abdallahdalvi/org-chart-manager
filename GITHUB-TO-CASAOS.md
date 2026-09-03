# GitHub → CasaOS deployment

Repository: [Abdallahdalvi/org-chart-manager](https://github.com/Abdallahdalvi/org-chart-manager), **private**. Deploy the `main` branch.

The direction is: **push code to GitHub → pull code on the server → rebuild the app container**. Excel uploads and employee edits save to Supabase; they do not require a GitHub push or a rebuild.

**For the current Cloudflare-only login with editor/HR/approver roles:** complete the repository and initial database setup in sections 1–3, then follow [CLOUDFLARE-ACCESS.md](CLOUDFLARE-ACCESS.md). Sections 4–5 below describe the optional legacy shared-password mode only. The new `.env.selfhost.example` defaults to Cloudflare mode; do not overwrite a filled-in environment file with that example.

## 1. Save your current chart

In the local app, choose **Backup & restore → Save master backup**. Keep this JSON safely on your computer. It contains your latest edits and history. Do not put it in GitHub.

## 2. Give the server read-only GitHub access

Log in to your CasaOS Ubuntu terminal as `abdallah2`. Check the tools:

```sh
git --version
docker compose version
```

If you already have a working key for this repository, reuse it. Otherwise create a **new, dedicated** key. Do not overwrite an existing key with the same name:

```sh
mkdir -p /home/abdallah2/.ssh
chmod 700 /home/abdallah2/.ssh
ssh-keygen -t ed25519 -C "org-chart-casaos-readonly" -f /home/abdallah2/.ssh/org_chart_manager
```

You can use a passphrase and an SSH agent for interactive deployments. Display the **public** key:

```sh
cat /home/abdallah2/.ssh/org_chart_manager.pub
```

Copy it to GitHub → this repository → **Settings → Deploy keys → Add deploy key**. Name it `CasaOS read-only`. Leave **Allow write access unchecked**. Never share the private key. [GitHub deploy-key guide](https://docs.github.com/en/authentication/connecting-to-github-with-ssh/managing-deploy-keys).

Clone into a new folder:

```sh
GIT_SSH_COMMAND='ssh -i /home/abdallah2/.ssh/org_chart_manager -o IdentitiesOnly=yes' git clone --branch main git@github.com:Abdallahdalvi/org-chart-manager.git /home/abdallah2/org-chart-manager
cd /home/abdallah2/org-chart-manager
git config core.sshCommand 'ssh -i /home/abdallah2/.ssh/org_chart_manager -o IdentitiesOnly=yes'
```

On the first SSH connection, verify GitHub's host fingerprint against [GitHub's published fingerprints](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/githubs-ssh-key-fingerprints) before accepting it. If the destination folder exists, inspect it first; do not delete or overwrite another project.

## 3. Install the app tables in your existing Supabase

Open your Supabase SQL editor, then copy and run the contents of [supabase/001_org_chart.sql](supabase/001_org_chart.sql).

This creates only the organization-chart tables and save function. It does **not** reinstall Supabase or change your other apps. The person installing the schema needs database-management access once; HR and approvers do not.

## 4. Legacy option: configure shared-password login

From the project folder:

```sh
umask 077
cp -n .env.selfhost.example .env.selfhost
chmod 600 .env.selfhost
nano .env.selfhost
```

Fill in these values **on the server only**:

| Setting                     | What to enter                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `APP_AUTH_MODE`             | `basic` for this legacy procedure; use the Cloudflare guide instead for email roles |
| `APP_ORIGIN`                | Exact app address, e.g. your own HTTPS subdomain; no path                           |
| `APP_USERNAME`              | A shared login name for the people maintaining the chart                            |
| `APP_PASSWORD`              | A new random password, at least 16 characters                                       |
| `SUPABASE_URL`              | `https://supabase.dalvi.cloud`                                                      |
| `SUPABASE_SERVICE_ROLE_KEY` | Your existing Supabase `SERVICE_ROLE_KEY`, not its anon key                         |

Keep `SUPABASE_ALLOW_HTTP=false`. Keep `BIND_IP=127.0.0.1` when your reverse proxy runs on the host. Keep secrets out of GitHub, browser variables, screenshots and command history. `.env.selfhost` is ignored by Git and by the Docker build. Single-quote values containing `$` or `#` in that file.

For a first test without a domain, leave `APP_ORIGIN=http://localhost:3080`. After starting the container, run this **on your computer**, replacing `YOUR_SERVER_IP` with the working server address:

```sh
ssh -L 3080:127.0.0.1:3080 abdallah2@YOUR_SERVER_IP
```

Keep that terminal open and visit `http://localhost:3080` on your computer. The SSH tunnel protects the connection. Port 3080 must be unused on your computer.

## 5. Build and start the container

```sh
docker compose --env-file .env.selfhost -f compose.casaos.yaml up -d --build
docker compose --env-file .env.selfhost -f compose.casaos.yaml ps
curl --fail http://127.0.0.1:3080/healthz
```

If your account requires `sudo` for Docker, prefix the Docker commands with `sudo`; do not change global socket permissions. This starts only this project's app container. The health response checks the app process, not Supabase connectivity; open the app and confirm employee records load too. [Docker build/start reference](https://docs.docker.com/reference/cli/docker/compose/up/).

For regular team access, point your existing HTTPS reverse proxy at this app, set `APP_ORIGIN` to that exact HTTPS address, and rerun the build/start command. A proxy in another container needs a shared private Docker network or deliberate private-interface binding; its own `localhost` is not the CasaOS host. Do not expose plain HTTP to the internet. The app rejects non-local HTTP origins.

Your browser asks for the configured app username/password. This is separate from your Supabase dashboard login.

## 6. Restore the latest chart

In the server app, choose **Backup & restore → Restore master** and select your JSON. Check the employee count, reporting lines and change log. Restoration creates a fresh draft and keeps imported evidence as historical references.

The initial dataset does not include recent edits from the old local app. Local preview and Supabase are separate databases until you restore that backup. Old database snapshots stay in the old workspace; download additional ones if needed before retiring it.

## 7. Deploy future code updates

After code has been pushed to GitHub, run **on the server**:

```sh
cd /home/abdallah2/org-chart-manager
git status --short
git pull --ff-only origin main
docker compose --env-file .env.selfhost -f compose.casaos.yaml up -d --build
docker compose --env-file .env.selfhost -f compose.casaos.yaml ps
```

If `git status` shows tracked-file edits, or `git pull` fails, stop and reconcile them first. Do not use a hard reset or delete the project to bypass a conflict. `.env.selfhost` remains local, and Supabase data survives app rebuilds. Do not delete Supabase volumes.

Apply a new migration only when a later release explicitly includes one. Routine code updates do not require rerunning the initial schema. Keep a master backup before updates.

## Who approves, and who needs admin rights?

**Cloudflare mode now supports authenticated HR validation and assigned stakeholder approvals.** The signed-in email is verified and permissions are enforced on the server. See [login and roles](CLOUDFLARE-ACCESS.md). The following describes legacy shared-password mode only:

1. Marketing prepares the chart and shares an export with HR.
2. HR validates the data and provides an email or signed confirmation for the exact version.
3. Executives and relevant department heads approve their areas. HR should confirm the required people in the app's stakeholder list.
4. Marketing records the actual references under **Change log → HR validation & approvals**, including person, date and version.

The app marks that version approved only after its required evidence is recorded. It does not send requests, authenticate the named approver, or prove the evidence is genuine. Anyone with the shared app login can record evidence; restrict it to the people maintaining the official master. Give reviewers exports instead.

No approver should be made a PostgreSQL/Supabase administrator or receive the service-role key. A database administrator installs the schema; that technical role is not the business approver.

To let people sign in and approve themselves, switch deliberately to Cloudflare mode using the linked guide. The server email lists control who can edit or approve, and HR assigns emails to required stakeholder entries. Do not add database administrators or distribute a service-role key to business approvers.

## Troubleshooting

- **Repeated password prompts:** check the app username/password, not Supabase dashboard credentials.
- **Chart cannot load / `PGRST205`:** run the app schema in the correct database; check the Supabase endpoint and server-only key.
- **Same-origin requests required:** visit the exact address in `APP_ORIGIN`, including scheme and port.
- **SSH timeout:** confirm the reachable address, port, SSH service and network. Both previously supplied private addresses timed out during setup.
- **App logs:** `docker compose --env-file .env.selfhost -f compose.casaos.yaml logs --tail=100 org-chart`. Redact secrets before sharing logs or environment output.

These instructions are not evidence that the CasaOS installation has been performed. The source is ready; the server installation remains to be carried out.
