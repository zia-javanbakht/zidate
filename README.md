# Pishi

<img src="public/logo.png" alt="Pishi logo, a pink cat" width="111">

Pishi means cat in Farsi.

A dating app with no swiping. You talk with an AI matchmaker, it builds two profiles for you, and every Monday it introduces you to two people.

- **Hidden profile**: eight traits (social energy, adventure, ambition, family, planning, intellect, spirituality, activity), each with a confidence, plus tags, dealbreakers, values, what you have said you want in a partner, and private notes. Only used for matching. Nobody else ever sees it. You can see it, and correct it with "Not me", which makes the matchmaker ask you directly.
- **Shared profile**: what matches see. The matchmaker *suggests* lines from your answers ("My ideal Sunday", "What makes me laugh", a bio, interests). Nothing appears until you approve it, and contact details are never allowed on it.
- **Two a week**: suggestions come from your city first, respect both people's age ranges, who each wants to meet and dealbreakers, and are ranked by mutual fit. You never see the same person twice, or anyone who already passed on you.
- **It keeps learning**: when you like or pass, the matchmaker asks why, and your answer updates the hidden profile's partner preferences, which changes who you meet next week. Liking someone also nudges preferences toward them.

Also: photos (private until a match by default), live messaging with read receipts and icebreakers, in-app and email notifications, email confirmation and password reset, pause, data export, abuse filtering, reporting and a moderator page. See IMPROVEMENTS.md for the full list.

## Run it

Needs Node 20 or newer. Or with Docker: `docker build -t pishi . && docker run -p 3000:3000 -v pishi:/data pishi`.

```sh
npm install
npm start            # http://localhost:3000
```

On first start it creates 64 demo people (London, Berlin, New York and Toronto), labelled "demo profile", so you can try the whole flow alone. Set `PISHI_SEED=0` to skip them.

### The matchmaker

- With `ANTHROPIC_API_KEY` set, the matchmaker uses Claude (`claude-opus-5-5` by default, override with `PISHI_MODEL`). Claude reads each answer, returns structured updates (traits, preferences, tags, interests, a suggested shared line, a private note, a bio draft) through a strict JSON schema, and phrases the next question.
- Without a key, or if a Claude call fails, a deterministic offline matchmaker does the same job with a keyword analyser. `PISHI_AGENT=offline` forces it.
- Either way, the app (not the model) decides what to ask next, so coverage of every trait, the weekly rhythm and the privacy rules stay predictable.

### Other settings

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `PISHI_DB` | `data/db.json` | Where data is stored (a single JSON file, written atomically) |
| `PISHI_PHOTOS` | `data/photos` | Where uploaded photos are kept |
| `PISHI_OUTBOX` | `data/outbox` | Every outgoing email is also saved here as JSON |
| `PISHI_MAIL_WEBHOOK` | | URL that receives each email as a JSON POST (`from`, `to`, `subject`, `text`), to connect any email service |
| `PISHI_BASE_URL` | `http://localhost:PORT` | Used for links in emails |
| `ADMIN_EMAILS` | | Comma-separated emails that can open the moderator page (You > Settings > Moderation) |
| `PISHI_SEED` | `1` | `0` skips the demo people |
| `PISHI_LOG` | | `1` logs each request (ids masked) |
| `NODE_ENV=production` | | Marks the session cookie `Secure` (use behind HTTPS) |

Backups of the data file are written daily next to it (last 7 kept).

## Tests

```sh
npm test             # 83 unit and API tests
npm run test:e2e     # 2 browser tests (need Playwright with Chromium installed)
node scripts/screenshots.mjs out/   # screenshots of every screen, light and dark
node scripts/turns-to-ready.mjs -v  # how many answers until matching unlocks
```

## Layout

```
src/
  server.js        starts the HTTP server
  app.js           wires services together, serves the API and static files (no framework)
  http.js          tiny router, body parsing, rate limits
  routes/          one file per area: account, chat, profile, week, matches, notifications, admin
  events.js        live updates (server-sent events)
  mailer.js        outgoing email (outbox folder and/or webhook)
  photos.js        photo checks and storage
  moderation.js    abuse filter
  social.js        matches, check-ins, icebreakers, demo replies
  scheduler.js     weekly picks, check-ins, backups
  config.js        settings from the environment
  agent/
    index.js       the conversation loop: what to ask next, applying answers
    questions.js   the question bank (open questions and quick replies)
    analyze.js     offline answer analysis
    mock.js        offline matchmaker
    claude.js      Claude matchmaker (structured outputs, falls back to offline)
  profile.js       hidden/shared profile rules, what is public
  matching.js      eligibility, fit, weekly picks
  traits.js, clock.js, db.js, auth.js, seed.js
public/            the web app (plain JS modules in public/js, no build step; installable)
test/              unit, API and browser tests
IMPROVEMENTS.md    the 70 improvements and how each was checked
```

## Privacy and safety

- Public profile = only approved lines. The API never returns another person's hidden profile, score, email or notes (tested).
- Contact details are filtered from suggestions and rejected on edits.
- Under-18s are stopped at the age question.
- Unmatch and report; reported or unmatched pairs are never suggested again.
- Delete account removes both profiles, conversations, matches and messages.
- Passwords are hashed with scrypt, sessions are HttpOnly cookies, writes must be JSON (CSRF), and sign-in, chat and writes are rate limited.

## Not built yet

Phone push notifications, photo moderation, and a real database for more than a few thousand people. The Claude matchmaker has not been run against the live API in development (no key was available); the offline matchmaker is fully tested.
