# Accounts — step 1: does signing in work on the phone?

This step answers one question and nothing else: **when the app is on an iPhone
home screen, does signing in with Google leave the app and come back into it?**

On iOS a home-screen app has its own window and its own storage. Signing in
means going out to `accounts.google.com`, which iOS opens in a browser view on
top of the app, and then coming back to `bocados.org`. If the return landed in
Safari instead of the app, or if the cookie set on the way back didn't reach the
app's storage, accounts would need a different design altogether. Better to know
now than after building sync.

Nothing is stored on the server in this step. There is no database, no account,
and no data leaves the phone: the session is a signed cookie holding an email
address, and the app only shows who signed in.

## What you need to do once

Only you can do this part: it needs a Google account and it creates credentials.

### 1. Create the Google project

1. Go to [console.cloud.google.com](https://console.cloud.google.com) and create
   a project called **Bocados**.
2. Open **Google Auth Platform → Branding** (older consoles call it the OAuth
   consent screen). Choose **External**, app name **Bocados**, and your email
   for both support and developer contact.
3. While the project is in **Testing**, only the people you list can sign in.
   Add your own address and your family's under **Audience → Test users**. That
   is enough for this step; publishing comes later, with the privacy policy.

Asking only for name and email means Google does not require the app to be
verified. Verification only becomes relevant if you want the Bocados name and
logo on Google's own screen.

### 2. Create the credentials

1. **Credentials → Create credentials → OAuth client ID → Web application**,
   named "Bocados web".
2. Under **Authorized redirect URIs** add exactly:
   - `https://bocados.org/auth/callback`
3. Save. Google shows a **client ID** and a **client secret**.

The client ID is public and goes in the repository. **The secret is not**: it
goes straight into Cloudflare and never into git or a chat message.

### 3. Put the secret into Cloudflare

In the Cloudflare dashboard: **Workers & Pages → bocados → Settings → Variables
and Secrets → Add**, as *Secret*, twice:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_SECRET` | the secret Google showed |
| `SESSION_SECRET` | a long random string of your own |

For the random one, this prints a good value:

```bash
openssl rand -base64 32
```

The same thing from the terminal, if you prefer it to the dashboard:

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

### 4. Send me the client ID

It goes into `wrangler.jsonc` as a plain variable, because it is public. Nothing
works until it is there.

## Then, the test itself

On the iPhone, with Bocados **added to the home screen** (not a Safari tab):

1. Open Bocados → **Objetivos → Probar la cuenta**.
2. Tap **Entrar con Google** and choose an account.
3. What matters is where you end up:
   - **Back inside the Bocados app**, showing your name or email → the answer is
     yes, and step 2 can go ahead.
   - **In Safari**, or back in the app but still offering "Entrar con Google" →
     the cookie or the return trip didn't survive, and accounts need another
     approach (a token held by the app instead of a cookie).
4. Close the app fully and open it again. It should still show you as signed in.

Worth trying as well, since families share links:
- Open `bocados.org` from **WhatsApp**. Google blocks sign-in inside apps'
  built-in browsers, so this is expected to fail; what matters is that it fails
  with a message rather than a blank screen.
- The **Android** phone, as a comparison.

## What the Worker does

`worker/auth.js`, four addresses:

| Address | What it does |
|---|---|
| `GET /auth/google` | remembers a one-time value in a short-lived cookie and sends you to Google |
| `GET /auth/callback` | checks that value came back, swaps the code for an identity with the secret, sets the session cookie |
| `GET /auth/yo` | says who is signed in on this device |
| `POST /auth/salir` | signs out |

The session cookie is `HttpOnly`, `Secure` and `SameSite=Lax`, signed with
`SESSION_SECRET` so it cannot be edited on the device, and it holds only the
Google id, the email and the name. The service worker is told to keep its hands
off `/auth/*`, or it would answer the redirect with the app's own page.

## Running it locally

`wrangler` reads `.dev.vars` (kept out of git). With dummy values, `/auth/yo`
answers and `/auth/google` builds its redirect, which is enough to develop
against; a real sign-in needs the real credentials and
`http://localhost:8788/auth/callback` added to the authorised URIs in Google.

```
GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="…"
SESSION_SECRET="cualquier cosa larga"
```
