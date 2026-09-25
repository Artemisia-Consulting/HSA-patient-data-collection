# How to Run This App on Your Computer

This guide assumes **no programming experience whatsoever**. If you can follow a
recipe, you can do this. There are five steps: one big one-time installation,
one short one-time setup, and after that starting the app is a single step.

Expect the one-time setup to take about 15–20 minutes, most of it waiting.

---

## What you need before starting

- The folder you downloaded (cloned) that contains this file's sibling project
- An internet connection
- That's it

---

## Step 1 — Install Node.js (one time only)

Node.js is the engine this app runs on. Your computer almost certainly doesn't
have it yet — that's why nothing worked so far.

1. Go to <https://nodejs.org>
2. Click the big green button that says **LTS** — *not* the one that says "Current"
3. Open the file you downloaded and click **Next / Install** through every screen
   (the default options are all fine)
4. When it's done, **close any black/terminal windows you had open** — they need
   to be reopened to see the new software

> How to check it worked: open a new black window (see Step 2) and type
> `node -v` then press Enter. A version number like `v22.x.x` means success.

---

## Step 2 — Open the "black window" in the right folder

These steps assume Windows. (On a Mac: open the **Terminal** app, then drag the
folder from Finder onto the window and press Enter.)

1. Open the **folder you cloned** in File Explorer — the one containing a file
   called `package.json` (you should see it in the file list)
2. Click **once** in the address bar at the top of the window (where the folder
   path is shown) — the path should turn blue
3. Type `cmd` and press **Enter**

A black window opens, already pointed at the right folder. Everything in the
rest of this guide is typed into windows like this one, pressing **Enter** after
each line, and waiting for it to finish before typing the next.

> **Am I in the right folder?** Type `dir` and press Enter. If the list includes
> `package.json`, yes. If not, close the window and repeat this step from the
> correct folder.

---

## Step 3 — Create the settings file (one time only)

The app needs a small settings file that isn't included in the download.
In the black window, type exactly:

```
copy .env.example .env
```

(On a Mac, use `cp .env.example .env` instead.)

---

## Step 4 — The one-time setup (three commands)

Type each of these lines into the black window, pressing **Enter** and letting
it finish before starting the next:

```
npm install
npx prisma db push
npm run db:seed
```

What each one does, so you know what success looks like:

| Command | What it's doing | Roughly how long |
| --- | --- | --- |
| `npm install` | Downloads all the app's parts | 5–10 minutes |
| `npx prisma db push` | Creates the app's database | under a minute |
| `npm run db:seed` | Loads the list of medical conditions | under a minute |

**A wall of scrolling text is normal, not an error.** `npm install` in
particular prints a lot. It's only a problem if it stops and the word
**error** appears near the bottom — see the troubleshooting table at the end
if that happens.

---

## Step 5 — Start the app (this is the everyday step)

In the black window, from the app folder:

```
npm run dev
```

Wait until you see a line containing **Ready** (takes a few seconds), then open
your web browser and go to:

<http://localhost:3000>

That's the app. Happy logging!

### Two things to remember

- **Keep the black window open** while using the app — closing it stops the app.
  You can minimise it.
- **To use it again tomorrow:** repeat Step 2 (open the black window in the app
  folder), then type `npm run dev`. That's all — Steps 1, 3 and 4 never need to
  be done again.

### To stop the app

Click on the black window and press **Ctrl + C**. It's safe to do this at any
time; nothing is lost.

---

## Getting back into your own log

You sign up once. After that there are three ways back in, and you never need
a password:

1. **Open your reminder link** (`…/log?k=…`) on the phone or computer you want
   to use. Fastest, and the one the reminders are built around.
2. **Go to <http://localhost:3000/signin>** and paste that same link into the
   box. Useful when the link is in an email you can't tap, e.g. on a desktop.
3. **"Continue with Google"** on that same page — but only once Google
   sign-in has been switched on. See the optional section below.

---

## Optional: the researcher dashboard

The dashboard at <http://localhost:3000/dashboard> shows the collected data as
charts, a filterable table and a CSV download. It needs a researcher account,
which the ordinary setup doesn't create. Two extra commands:

```
npm run db:researcher
npm run db:demo
```

| Command | What it's doing | Needed? |
| --- | --- | --- |
| `npm run db:researcher` | Creates the research account that can open the dashboard | Yes, to see the dashboard at all |
| `npm run db:demo` | Fills the database with made-up practitioners and entries so the charts have something to draw | Only if you want to see it populated |

Then go to <http://localhost:3000/researcher-signin> and enter the code
**`hsa-dev-researcher`**.

That code is a development stopgap, not a real login — anyone who knows it can
read the dashboard. Before this goes live on the internet, set `RESEARCHER_CODE`
in the `.env` file to something private. (On a real deployment the app refuses
to accept the code at all until you do.)

To remove the made-up data again:

```
npm run db:demo -- --clear
```

---

## Optional: "Continue with Google"

Off by default, and the app works perfectly without it. Turning it on lets a
practitioner get back into their log by proving to Google that they own the
email address they signed up with — no link to find, no password to remember.

It never creates an account on its own. If Google confirms an address that
isn't signed up, the app sends that person to the sign-up form with their name
and email filled in, so the consent tick is still made by a human. That is
deliberate: ticking the box *is* the consent record for the study.

To switch it on:

1. **Create a project.** Go to
   <https://console.cloud.google.com/projectcreate>, name it anything
   (`HSA Daily Log` will do) and create it. Make sure it's the selected
   project in the dropdown at the top of the page from here on.

2. **Tell Google who may sign in.** Open
   <https://console.cloud.google.com/auth/overview>. Google will ask for an
   app name (`HSA Daily Patient Log`), a support email (your own) and a
   contact email (your own again). For **Audience**, choose **External**.

   This leaves the app in *Testing* mode, which is what you want: only
   addresses you list can sign in. On the **Audience** page, under **Test
   users**, click **Add users** and add your own Gmail address. Skip this and
   Google answers your sign-in attempt with `access_denied`, which looks like
   a bug in the app but isn't.

3. **Create the credentials.** Go to
   <https://console.cloud.google.com/auth/clients>, click **Create client**,
   and choose **Web application**. Under **Authorised redirect URIs**, add
   exactly:

   ```
   http://localhost:3000/api/oauth/callback/google
   ```

   Note it is `/api/oauth/`, not `/api/auth/`. One wrong character here is the
   single most common reason the flow fails — Google rejects it with
   `redirect_uri_mismatch` before the app is ever reached.

4. **Paste the two values into `.env`.** Google shows a **Client ID** and a
   **Client secret** once you click Create:

   ```
   GOOGLE_CLIENT_ID="….apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="…"
   ```

   There is a third setting, `BETTER_AUTH_SECRET`, which is what stops someone
   tampering with the sign-in handshake. It is already filled in. If you ever
   need a new one, any long random string works — `openssl rand -base64 32` in
   Git Bash prints a suitable one.

5. **Restart the app.** Stop it with Ctrl + C and run `npm run dev` again.
   `.env` is read once at startup, so the button won't appear until you do.
   **Continue with Google** then shows on the sign-in and sign-up screens.

Leave any of those three blank and the button simply doesn't appear — nothing
breaks.

---

## If something goes wrong

Find the last few lines of text in the black window (often red) and match it to
this table:

| What the window says | What it means | What to do |
| --- | --- | --- |
| `'npm' is not recognized` or `command not found` | Node.js isn't installed, or the window was open during installation | Redo Step 1, then close and reopen the black window |
| `Could not read package.json` or `ENOENT ... package.json` | The window is opened in the wrong folder | Redo Step 2 — the folder must contain `package.json` |
| A long list of file paths ending in `better_sqlite3.node` | A downloaded part didn't wire itself up | Run `npm rebuild better-sqlite3`, then redo Step 4 |
| `Environment variable not found: DATABASE_URL` | Step 3 was skipped or done in the wrong folder | Redo Step 3, from the app folder |
| `access_denied` on a Google page | Your address isn't on the app's test-user list | Add it under **Test users** at <https://console.cloud.google.com/auth/audience> |
| `redirect_uri_mismatch` on a Google page | The URI in the Google console doesn't match the app | It must be `http://localhost:3000/api/oauth/callback/google` — check `oauth`, not `auth` |
| `Google sign-in is not configured on this deployment` | The three Google settings aren't filled in | See "Optional: Continue with Google", then restart the app |
| The dashboard says the area is for the research team | You're signed in as a practitioner, not a researcher | Run `npm run db:researcher`, then sign in at `/researcher-signin` |

If your problem isn't in the table: copy the **last few lines of red text**
exactly as they appear and send them along — they say precisely what went
wrong, and the fix is usually one line.

---

## Good to know

- The app runs **entirely on your own computer** — nothing you type into it
  goes anywhere else.
- The reminder emails aren't configured on a home setup, so they won't send —
  that's expected and doesn't affect anything else (sign-up, daily logging,
  and the dashboard all work).
