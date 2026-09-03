# Cloudflare Access login and app roles

Use **https://orgchart.dalvi.cloud** for this application. Leave the existing `ubiqedge.dalvi.cloud` website and `supabase.dalvi.cloud` API unchanged. This guide applies to the standalone CasaOS build, not the old local/Sites preview.

Cloudflare Access signs people in. The app validates the signed Access token and assigns permissions using exact email lists on your server. In Cloudflare mode there is **no app-password prompt and no fallback to the old password**. Do not switch modes until you have completed the Access setup below.

## Roles

| Server setting        | Initial example               | Permissions                                                                                                                                             |
| --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_EDITOR_EMAILS`   | `abdallah.dalvi@ubiqedge.com` | View, export, import, edit employees/functions, restore a chart; no validation, approvals or reviewer-list changes                                      |
| `APP_HR_EMAILS`       | `hr@ubiqedge.com`             | View/export, validate as HR, maintain required reviewers, record genuine external approvals; directly approve only an entry assigned to their own email |
| `APP_APPROVER_EMAILS` | Empty initially               | View/export and directly approve only required stakeholder entries assigned to their own email                                                          |
| `APP_VIEWER_EMAILS`   | Empty initially               | View/export only                                                                                                                                        |

List multiple emails with commas. Permissions combine if an email is in more than one role list. For example, add HR to the editor list too only if HR should also edit employee data. Unlisted emails are denied by the app, even if Cloudflare lets them through. Roles are not read from browser input or Excel and do not require Supabase user/admin accounts. Server administrators maintain these lists; the HR reviewer list in the app cannot grant login or editor permissions.

A shared mailbox such as `hr@ubiqedge.com` identifies that mailbox, not which individual used it. Use individual work emails when you need person-specific accountability. Approval actions are authenticated confirmations with an audit trail, not qualified electronic signatures.

## 1. Create the Access application first

In your existing Cloudflare account:

1. Open **Cloudflare One / Zero Trust → Access controls → Applications** and add a **Self-hosted** application (the current interface may say **Self-hosted and private**).
2. Name it `Organization chart`. Add the public hostname `orgchart.dalvi.cloud`. Leave the path blank so the whole app, assets and `/api/*` are protected.
3. Enable **One-time PIN** as a login method, or reuse your existing trusted work identity provider. With One-time PIN, users receive a code by email. Never send codes to the app developer.
4. Add an **Allow** policy with **Include → Emails** containing only the exact permitted addresses. Initially these are `abdallah.dalvi@ubiqedge.com` and `hr@ubiqedge.com` if those are the accounts you want to activate.
5. Do not add `Everyone`, an unrestricted email domain, `Bypass`, `Service Auth`, or an Include rule for `Login Methods: One-time PIN`. That last Include rule would allow any valid email, rather than your chosen list. Do not modify policies for other apps.
6. A session duration of eight hours is a reasonable starting point; shorten it if your organization requires it.
7. Save the app and copy its **Application Audience (AUD) Tag**, a 64-character value. Also find your team hostname, such as `your-team.cloudflareaccess.com`, in the account's team-domain settings.

The team hostname and AUD identify the login configuration; they are not passwords. Do not supply your Cloudflare API key, tunnel token, app password or Supabase secret. [Access application guide](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/), [email PIN login](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/) and [policy safety](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/).

## 2. Connect the existing tunnel to the app

Reuse the healthy tunnel already serving CasaOS. Add only the new published application route for `orgchart.dalvi.cloud`.

- If `cloudflared` runs directly on the CasaOS host or with Docker host networking, use service **HTTP**, URL **`127.0.0.1:3080`**, and keep `BIND_IP=127.0.0.1`.
- If `cloudflared` runs in a separate Docker bridge network, its `localhost` is not the CasaOS host. Put the app and connector on a suitable shared private Docker network and route to **`http://org-chart:3080`**. Inspect their actual networks first and persist network membership in their Compose configurations. Do not guess container names or disconnect existing services.
- Do not expose port 3080 on the router or change it to a public HTTP listener. The public browser address is HTTPS; HTTP between containers on the same private host is the origin connection.

Enable **Protect with Access** for this hostname in the tunnel's Access settings, selecting the exact app/AUD when requested. The app also validates the token itself. Never create a bypass rule to fix an authentication problem. If a hostname or DNS record already exists, inspect it rather than replacing another app.

Read-only diagnostics (no token output):

```sh
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Networks}}'
systemctl is-active cloudflared
```

[Tunnel routing](https://developers.cloudflare.com/tunnel/setup/#publish-an-application) and [origin token validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/).

## 3. Update source and configure CasaOS

Save a JSON master backup first. In the repository on CasaOS:

```sh
cd /home/abdallah2/org-chart-manager
git status --short
git pull --ff-only origin main
```

Stop if Git reports conflicting tracked changes. Do not reset or overwrite them.

Edit `.env.selfhost` on the server. Replace existing entries instead of creating duplicate keys. Preserve your existing Supabase settings and secret; do not copy the example file over your filled-in file.

```dotenv
APP_ORIGIN=https://orgchart.dalvi.cloud
APP_AUTH_MODE=cloudflare
CF_ACCESS_TEAM_DOMAIN=YOUR-TEAM.cloudflareaccess.com
CF_ACCESS_AUD=YOUR-64-CHARACTER-APPLICATION-AUDIENCE-TAG
APP_EDITOR_EMAILS=abdallah.dalvi@ubiqedge.com
APP_HR_EMAILS=hr@ubiqedge.com
APP_APPROVER_EMAILS=
APP_VIEWER_EMAILS=
```

Replace both `YOUR-...` placeholders with the actual Cloudflare values. Keep `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and the private network binding unchanged. You can remove `APP_USERNAME` and `APP_PASSWORD` once Cloudflare mode is active; they are completely ignored in that mode. Do not remove the Supabase service-role key—the backend still needs it for storage. No new SQL migration is required for this role update if the original schema is installed.

```sh
chmod 600 .env.selfhost
sudo docker compose --env-file .env.selfhost -f compose.casaos.yaml up -d --build
sudo docker compose --env-file .env.selfhost -f compose.casaos.yaml ps
curl --fail http://127.0.0.1:3080/healthz
```

Invalid/missing team configuration stops startup; it never silently falls back to password access. Installations that have not yet added `APP_AUTH_MODE` retain their existing password login to avoid unexpected lockout during an ordinary code update. Do not publish the `.env.selfhost` file or print it in screenshots.

## 4. Verify before sharing

1. Open the new HTTPS domain in a private/incognito window. It should show Cloudflare sign-in, not the chart or an app-password prompt.
2. Sign in as the editor. Confirm the top bar shows the correct email and editor role. Import/edit should be available; **Review & approval** should be read-only.
3. Sign in as HR using a separate browser session. HR should see validation and reviewer settings, but employee editing remains unavailable unless explicitly granted the editor role.
4. An email outside both the Cloudflare policy and app role lists must not reach employee data.
5. Direct `http://127.0.0.1:3080/api/document` on the server should return **401** without a valid Access token. The public `/healthz` response reveals only process health, not records or database credentials.

The app's sign-out link uses Cloudflare logout. Cloudflare currently logs the user out across Access applications, not just this app; the UI includes that warning. [Cloudflare session/logout behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/).

## 5. Approve a chart

- Editors resolve hierarchy issues and save a draft.
- HR opens **Review & approval**, reviews the version, checks the confirmation box and chooses **Validate this version as HR**. The server records the verified mailbox and time.
- Under **HR settings**, HR can assign each required stakeholder's email using `Full name | Role | Email`. This changes the requirements and starts a fresh draft, so configure reviewers before validating.
- Each direct stakeholder must also be in `APP_APPROVER_EMAILS` (or `APP_HR_EMAILS`) and the Cloudflare Allow policy. Adding an email to the reviewer list alone cannot grant permissions.
- Assigned approvers sign in and can approve only their own entry, after HR validation. The server rejects attempts to approve as anyone else.
- Alternatively, HR may record genuine original email/signature evidence using **Record stakeholder approval received outside the app**. These are clearly marked as externally obtained evidence recorded by HR, not direct sign-ins by the named stakeholder.
- The chart becomes approved only when every required stakeholder is recorded. HR validation alone does not stand in for executive/department approval. New edits clear the current approval state and preserve earlier evidence as history. Editor restores cannot replace HR's required reviewer list.

## Status and troubleshooting

The code and local tests do not create your Cloudflare application, change DNS, or install the server. Those steps require your signed-in Cloudflare account and the actual team hostname/AUD.

- **Startup stops:** verify mode, exact team hostname and the application's 64-character AUD. Use this application's AUD, not a tunnel ID or account ID.
- **401 at the app:** ensure Access protects the entire hostname and the tunnel forwards `Cf-Access-Jwt-Assertion`. The app validates its signature, issuer, audience and expiry; copying a plain email header is not sufficient.
- **403 / no role:** add the exact email to the intended server role list and rebuild/recreate the app container. Keep the Cloudflare Allow policy aligned.
- **No approval button for a stakeholder:** HR must assign that signed-in email to the required stakeholder entry; an approver role alone does not let someone approve as everybody.
- **Save fails after being idle:** reload the HTTPS app to sign in again. A stale version is rejected rather than overwriting another person's work.
- **502 tunnel error:** verify app health and connector networking. Do not disable Access or expose the HTTP port as a workaround.
- Do not remove Access protection as a rollback. Diagnose the configuration while leaving the application private.
