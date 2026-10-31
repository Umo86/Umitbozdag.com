# Umit Bozdag — personal website

A single-page promotional site for Umit Bozdag, Senior Operations Manager (exhibitions & events, London).
Node.js + Express + EJS, vanilla CSS/JS, no build step. Dark "show floor" theme with a door-opening
preloader, lanyard badge, LED ticker, timeline "halls", an animated world map and a registration-desk
contact form.

## Run it

```bash
npm install
npm start          # http://localhost:3000
npm run dev        # same, restarts on file changes (Node 18+)
PORT=8080 npm start
```

## Edit the content

Everything shown on the page lives in **`data/profile.js`** — name, title, intro, stats, the
experience "halls", map cities, ticker items, expertise cards, credentials and contact links.
Edit that file and restart; no HTML changes are needed.

- To show the phone number publicly, uncomment the `phone` line in `data/profile.js`.
- Map cities need `lat`/`lon`; the one marked `hq: true` is the origin of the animated routes.
- Styling lives in `public/css/style.css`, behaviour in `public/js/main.js`, markup in `views/index.ejs`.
- The world map dots are generated once at startup from Natural Earth data (`lib/worldmap.js`).

## Contact form

`POST /api/contact` validates the message (name, valid email, message of 5+ characters), ignores
submissions that fill the hidden honeypot field, rate-limits to one message per IP every 30 seconds,
and appends the message to **`data/messages.json`** (git-ignored). Check that file for new enquiries.

For production you will probably want email delivery instead of a JSON file: replace the
"store" step in `server.js` with Nodemailer, Resend, Postmark, SendGrid, etc. Note that on hosts
with an ephemeral filesystem (Render free tier, Railway, Heroku-style dynos) `messages.json` is
wiped on every deploy/restart, so email delivery is recommended there.

## Deploy on Hostinger

Needs a Hostinger plan with **Node.js Web Apps** (Business or Cloud web hosting, or a VPS).

1. hPanel → **Websites** → **Add website** → **Node.js Web App** → **Import Git repository**.
2. Connect GitHub and pick `Umo86/Umitbozdag.com`, branch `master` (or `new-website` until it is merged).
3. Build settings: framework **Express** (or "Other"), Node version **20 or 22**,
   install/build command `npm install`, entry file `server.js`, start command `npm start`.
4. Environment variables: `NODE_ENV=production`. Hostinger provides `PORT` automatically.
5. Deploy, then attach `umitbozdag.com` / `www.umitbozdag.com` under the app's **Domains** and enable SSL.

Every push to the chosen branch can redeploy automatically (toggle in the app's deployment settings).
Messages from the contact form are saved to `data/messages.json`, which is overwritten on each
redeploy, so read them often or switch to email (see above).

**On a Hostinger VPS instead:** `git clone` the repo, `npm install --omit=dev`, then
`NODE_ENV=production pm2 start server.js --name umit-site`, and put Nginx in front for the domain and SSL.

## Deploy elsewhere

Any Node host works. The app reads `PORT` from the environment and listens on `0.0.0.0`.

- **Render / Railway / Fly.io / Heroku**: build command `npm install`, start command `npm start`.
  Set `NODE_ENV=production` (enables `trust proxy` so rate limiting sees real client IPs).
- **VPS**: run under `pm2` or a systemd unit behind Nginx/Caddy for TLS; set `NODE_ENV=production`.
- Point the `www.umitbozdag.com` DNS at the host and enable HTTPS.

Security headers (incl. a Content-Security-Policy that only allows same-origin scripts and Google
Fonts) are set by Helmet in `server.js`; keep scripts in `public/js/` rather than inline.
