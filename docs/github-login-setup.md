# Setting up "Log in with GitHub"

The editor's login button needs three things:

1. **a GitHub App** — it asks you which repositories the editor may use;
2. **a login helper** on Cloudflare Workers ([`worker/`](../worker)) — it finishes each login (details below);
3. **the app's public settings** in the GitHub Pages build.

This is a one-time setup, about 15 minutes. Until it's done, the Build tab shows only the token form, which keeps working afterwards too.

## 1. Create the GitHub App

On GitHub: **Settings → Developer settings → GitHub Apps → New GitHub App** (<https://github.com/settings/apps/new>).

| Field | Value |
| --- | --- |
| GitHub App name | anything unique, e.g. `ZMK Editor (ooepi)` |
| Homepage URL | `https://zmkeditor.app/` |
| Callback URL | `https://zmkeditor.app/` (optional second one for development: `http://localhost:5173/`) |
| Expire user authorization tokens | ✅ checked (logins last 8 hours and renew themselves) |
| Request user authorization (OAuth) during installation | ☐ unchecked |
| Enable Device Flow | ☐ unchecked |
| Setup URL | `https://zmkeditor.app/`, with **Redirect on update** ✅ |
| Webhook → Active | ☐ unchecked (no webhook needed) |

Under **Repository permissions**, set:

| Permission | Access |
| --- | --- |
| Actions | Read-only |
| Contents | Read and write |
| Workflows | Read and write |
| Metadata | Read-only (added automatically) |

Set no account permissions.

**Where can this GitHub App be installed?** Choose *Any account* if other people should be able to use your editor, or *Only on this account* for just you.

After you click **Create GitHub App**:

- Note the **Client ID** (it looks like `Iv23li…`).
- Note the app's **URL name**, from its public page `https://github.com/apps/<url-name>`.
- Click **Generate a new client secret** and copy it right away. This is the only secret; it goes to Cloudflare, never into the website.
- You don't need a private key.

## 2. Cloudflare

1. Find your **Account ID**: Cloudflare dashboard → *Workers & Pages* → right-hand column.
2. Create an **API token**: *My Profile → API Tokens → Create Token*. Use the **Edit Cloudflare Workers** template, limited to your account.

## 3. Add the settings to this repository

In `ooepi/zmk-editor`: **Settings → Secrets and variables → Actions**.

**Secrets:**

| Name | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | the API token from step 2 |
| `CLOUDFLARE_ACCOUNT_ID` | your account ID |
| `GH_APP_CLIENT_SECRET` | the client secret from step 1 |

**Variables:**

| Name | Value |
| --- | --- |
| `GH_APP_CLIENT_ID` | the Client ID |
| `GH_APP_SLUG` | the app's URL name only, e.g. `zmk-editor-ooepi` (the full `https://github.com/apps/…` URL also works) |
| `AUTH_HELPER_URL` | set in step 4 |

## 4. Deploy

1. **Actions → Deploy login helper → Run workflow.** The log's "Deploy worker" step prints the helper's address, like `https://zmk-editor-auth.<your-subdomain>.workers.dev`.
2. Set the `AUTH_HELPER_URL` variable to that address.
3. **Actions → Deploy to GitHub Pages → Run workflow.**

The Build tab now shows **Log in with GitHub**.

The first time, GitHub asks you to authorize the app. After that the editor lists the repositories the app may access. If none are listed, use **Add or remove repositories** to pick your zmk-config repo.

**Deploying the helper by hand instead:** `cd worker && npx wrangler deploy`, then `npx wrangler secret put GITHUB_CLIENT_ID` and `npx wrangler secret put GITHUB_CLIENT_SECRET`.

**Other addresses:** if you host the editor somewhere other than `zmkeditor.app` (for example a fork on GitHub Pages), add that origin to `ALLOWED_ORIGINS` in [`worker/wrangler.toml`](../worker/wrangler.toml).

## How it works and why it is safe

1. **The button sends you to GitHub.**
   - The editor makes a random `state` value and a PKCE secret, and keeps both in the tab.
   - GitHub shows its own login page, so the editor never sees your password.
2. **GitHub sends you back with a one-time code.**
   - The editor checks that `state` matches. Another website can't trick it into accepting a login it didn't start.
   - The code is removed from the address bar immediately.
3. **The helper trades the code for a token.**
   - GitHub requires the app's client secret for this step. That's why every website with a GitHub login has a small server part: the secret can't be in a public page.
   - The helper adds the secret, asks GitHub, and passes the token back.
   - The PKCE secret proves the code came from the same browser that started the login, so a stolen code is useless.
   - The helper accepts requests only from the editor's own address, stores nothing, and logs nothing.
4. **The token stays in your browser** and is sent only to `api.github.com`.
   - It works only on the repositories you chose, and only for the permissions above. It can't touch your account settings or other repositories.
   - It expires after 8 hours and is renewed quietly.
   - You can revoke it any time: GitHub → Settings → Applications → *Authorized GitHub Apps*.
   - Untick "Stay logged in" on shared computers.
5. **The site has a Content-Security-Policy.** It only loads its own scripts and may only connect to GitHub and the helper. Even injected code couldn't send a token anywhere else.
