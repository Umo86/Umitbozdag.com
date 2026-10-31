const path = require('path');
const fs = require('fs/promises');
const express = require('express');
const compression = require('compression');
const helmet = require('helmet');

const profile = require('./data/profile');
const { buildWorldMap } = require('./lib/worldmap');

const PORT = process.env.PORT || 3000;
const MESSAGES_FILE = path.join(__dirname, 'data', 'messages.json');

async function start() {
  const app = express();
  const worldMap = buildWorldMap(profile.cities);

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.disable('x-powered-by');
  // Behind Render/Railway/Nginx etc. the real client IP arrives in X-Forwarded-For.
  if (process.env.NODE_ENV === 'production' || process.env.TRUST_PROXY) app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:'],
          scriptSrc: ["'self'"],
        },
      },
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '20kb' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

  app.get('/', (req, res) => {
    res.render('index', { p: profile, map: worldMap, year: new Date().getFullYear() });
  });

  app.get('/api/profile', (req, res) => res.json(profile));

  // Contact endpoint. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (and optionally
  // SMTP_FROM, CONTACT_TO) to have enquiries emailed to you — see README.
  const mailer = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? require('nodemailer').createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 465,
        secure: (Number(process.env.SMTP_PORT) || 465) === 465,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
    : null;
  console.log(mailer ? '[contact] emailing enquiries via ' + process.env.SMTP_HOST : '[contact] SMTP not set; enquiries saved to data/messages.json');
  const recent = new Map();
  app.post('/api/contact', async (req, res) => {
    const { name = '', email = '', company = '', message = '', website = '' } = req.body || {};
    if (website) return res.json({ ok: true }); // honeypot field — bots fill it in

    const ip = req.ip;
    const now = Date.now();
    for (const [k, t] of recent) if (now - t > 60_000) recent.delete(k); // keep the map small
    if (recent.has(ip) && now - recent.get(ip) < 30_000) {
      return res.status(429).json({ ok: false, error: 'Please wait a moment before sending another message.' });
    }

    const clean = (s, n) => String(s).trim().slice(0, n);
    const entry = {
      name: clean(name, 120),
      email: clean(email, 200),
      company: clean(company, 160),
      message: clean(message, 4000),
      receivedAt: new Date().toISOString(),
    };
    if (!entry.name || !/^\S+@\S+\.\S+$/.test(entry.email) || entry.message.length < 5) {
      return res.status(400).json({ ok: false, error: 'Please add your name, a valid email and a short message.' });
    }

    // 1) Email it, if SMTP settings are provided (e.g. a Hostinger mailbox).
    // 2) Otherwise save it to data/messages.json (only where the disk is writable).
    // 3) If neither is possible, tell the browser to open the visitor's email app instead.
    try {
      if (mailer) {
        await mailer.sendMail({
          from: `"umitbozdag.com" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to: process.env.CONTACT_TO || profile.email,
          replyTo: `"${entry.name.replace(/"/g, '')}" <${entry.email}>`,
          subject: `Website enquiry from ${entry.name}${entry.company ? ` (${entry.company})` : ''}`,
          text: `${entry.message}\n\n— ${entry.name}\n${entry.email}${entry.company ? `\n${entry.company}` : ''}\nSent ${entry.receivedAt}`,
        });
      } else if (!process.env.VERCEL) {
        let list = [];
        try { list = JSON.parse(await fs.readFile(MESSAGES_FILE, 'utf8')); } catch { /* first message */ }
        list.push(entry);
        await fs.writeFile(MESSAGES_FILE, JSON.stringify(list, null, 2));
      } else {
        return res.status(503).json({ ok: false, fallback: 'mailto', to: profile.email });
      }
      recent.set(ip, now);
      console.log(`[contact] new message from ${entry.name} <${entry.email}>`);
      res.json({ ok: true });
    } catch (err) {
      console.error('[contact]', err.message);
      res.status(503).json({ ok: false, fallback: 'mailto', to: profile.email });
    }
  });

  app.use((req, res) => res.status(404).render('404', { p: profile }));

  app.listen(PORT, "0.0.0.0", () => console.log(`Umit Bozdag site running at http://localhost:${PORT}`));
}

start();
