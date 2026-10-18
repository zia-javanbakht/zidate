# Improvement cycles

Each cycle: find a problem (from tests, screenshots, or a read-through), fix it, add or update a test, run the full suite.

| # | Problem found | Fix | Verified by |
|---|---|---|---|
| 1 | The browser logged two 401 errors on every visit while signed out, because `/api/me` treated "not signed in" as an error. | `/api/me` returns `{ user: null }` when signed out; protected routes still return 401. | API auth test updated; browser test asserts a clean console. |
| 2 | The interview asked almost only open questions, so getting to matching meant typing 8 paragraphs. Writing the test also exposed a bug: when the last answer was a quick-reply tap, the "you're ready" message never appeared. | Questions now alternate a quick tap with an open question. Readiness is measured before the tap is applied. | New pacing test; `scripts/turns-to-ready.mjs` went from 8 typed answers to 7 answers with only 3 typed; ready-announcement test passes again. |
| 3 | Replies felt robotic: "Good to know." after every tap, sometimes twice in a row. | Each quick reply has its own short reaction ("A quiet night in is underrated."), and generic acknowledgements never repeat back to back. "Backpacking" now counts as travel. | New test checks no two consecutive replies open the same way. |
| 4 | Screenshots showed a London user being offered people in New York and Berlin while London people were available. | Suggestions now come from the person's own city first, and only widen when the city runs out; those cards say "A little further away, in Berlin." | New test: a Berlin user gets Berlin picks; a Lisbon user (no local people) gets labelled picks. |
| 5 | A 31-year-old was offered a 44-year-old: the only age rule was a 15-year cap. | The interviewer asks "How close in age would you like them to be?" (quick reply: 5, 10 or 15 years). Both people's ranges must hold; default 8 years. | Matching test covers a tight range on either side. |
| 6 | Nothing stopped an answer like "find me on insta @zia" from being suggested for the public profile, or typed into it, which lets people bypass mutual consent. | Contact details (emails, phone numbers, links, handles, messaging apps) are filtered from agent suggestions and rejected on manual edits with a friendly message. | Unit test for the detector (including false positives like "10 km in 2019") and API test for edits. |
| 7 | No protection against password guessing or a scripted flood of chat messages (each could cost a Claude call), and write endpoints accepted form posts, which is the classic CSRF route. | Per-client rate limits (sign-in 10/min, chat 40/min, other writes 120/min) and all writes must be JSON, which a cross-site form cannot send. | New security tests: 415 for form posts, 429 after the limit, security headers on pages. |
| 8 | The Claude interviewer had no tests, and an empty reply from it would have been shown as a blank message. | The Claude client is injectable; an empty or malformed reply now counts as a failure and falls back to the offline interviewer. | Three tests with a fake client: results go through the same profile rules (unknown traits dropped, max one shared suggestion, nothing public), bad JSON / network errors / empty replies fall back, the schema stays strict. |
| 9 | A half-written or hand-edited data file would crash the server on start, and expired sessions piled up forever. | A damaged data file is moved aside (kept for recovery) and the app starts clean; expired sessions are pruned on load. | New store tests: restart keeps data, corrupt file handled, expired sessions dropped. |
| 10 | There was no way to skip a question: "skip" was analysed as an answer and got "Could you say a little more?". The new test also caught a real bug: typing "skip" at the city question set the city to "Skip". | Interview questions can be skipped (typed, or a quiet Skip chip) without touching the profile. Basics stay required, with a reason, and words like "skip", "no" or "hello" are no longer accepted as a city. | Two new agent tests. |
| 11 | Between two real people, a like could be wasted: the other person might never be shown them, and when a match did happen later the first person was not told. | Anyone who already liked you gets a lift in your next suggestions. A new match lights the Matches dot and shows "New"; the weekly card says "It is mutual. Say hello". The dot refreshes on every navigation. | New two-person API test: Ana likes Ben, Ben is shown Ana, both like, Ana is notified. |
| 12 | With only two slots a week, showing someone who has already passed on you wastes half the week. Unmatched or reported people could also come back. | Passes and unmatches are recorded; a person who passed on you, or a pair that unmatched or reported, is never suggested. Account deletion clears these records too. | New API test: Ana passes on Ben, Ben is not shown Ana. |
| 13 | The hidden profile was visible to its owner but not correctable: if the interviewer misread someone, the only fix was hoping later answers outweighed it. | Each trait has a "Not me" link. It discards most of what was inferred and the interviewer immediately asks a direct three-way question about that trait; the answer is applied exactly. | New API test covers the full loop. |
| 14 | Profile review was tedious (one tap per suggested line), "Hidden profile" wrapped badly on phones, every trait dot looked equally certain, and tags showed as raw slugs ("wants-kids"). | "Show all N suggestions" button, wrapping section headers, dot opacity follows confidence, readable tag labels. | API test for approve-all; reviewed light/dark phone screenshots. |
| 15 | The moment matching unlocked was a long sentence buried mid-reply ("…They are waiting under This week…"), easy to miss. | It is now its own card in the chat with a "Meet this week's two" button; the conversation carries on below it. The chat API returns every new message, not just the last. | Updated API test (one notice, conversation continues); screenshot reviewed. |
| 16 | A solo tester's matches were all demo people who never replied, so messaging felt broken, and nothing said they were demo profiles. | Demo profiles are labelled "demo profile" on every card and send a few short scripted replies (ending by saying the demo ends there). Replies shown in the open thread do not count as unread. | New API test: labels present, reply arrives, unread stays 0. |
| 17 | A contrast check found the accent (used for "why this person" text and the Like button) at 4.46:1, just under WCAG AA, and the red "Delete my account" link at 2.8:1 in dark mode. | Darker accent (5.4:1), danger and success colours became theme tokens with dark-mode values (7.4:1 and 7.9:1). | Ratios computed for every text/background pair; the browser test now fails if any button, link or field lacks an accessible name. |
| 18 | The core promise ("tell me why you passed and I'll update your hidden profile") was not measurable, and a simulation showed it did nothing: after "too quiet, I want someone outgoing", the next two weeks brought exactly the same four people. The preference was recorded but weighted too weakly to change a ranking. | Stated partner preferences count more than inferred ones (higher confidence, stronger pull on the target, and that trait weighs more in the score). One comment shifts the picks without overriding everything else. | New simulation test over 200 demo people: average sociability of the next 4 suggestions rises from 0.52 to 0.63, and one new, more outgoing person appears. |
| 19 | Before matching unlocked, "This week" just said "Not yet", with no idea how far off it was; after deciding on both people, the page still read as if there was something to do. | The page lists what is still to talk about in plain words ("faith and spirituality; how active you are…"), and once both decisions are made it says the week is done and when the next two arrive. | New API test for the missing-topics list. |
| 20 | On a 320px phone the nav ran 15px off-screen ("You" was cut off), and switching tabs kept the chat's scroll position, so "This week" opened halfway down a card. | Tighter nav below 360px; each screen opens at the top (Talk still jumps to the latest message). | Browser test now fails if the nav overflows at 320px; screenshots re-checked. |

## Round 2: missing features (21–70)

Asked for: complete the missing components and features, with up to 50 suggestions pre-approved. Each item has a test, or was checked in screenshots where noted. Totals: 83 unit and API tests, 2 browser tests.

| # | Area | What changed | Verified by |
|---|---|---|---|
| 21 | Accounts | Email confirmation by link, with a reminder and resend in Settings. | API test (verify, bad token, resend) |
| 22 | Accounts | Forgot password: emailed one-hour link, same reply whether or not the account exists. Resetting signs you in and signs out other devices. | API test; browser test does the whole flow |
| 23 | Accounts | Change password (other devices signed out) and "Sign out other devices". | API test |
| 24 | Security | Per-account lockout after 8 wrong passwords in 15 minutes, on top of the per-address limit. | API test |
| 25 | Settings | Name, age, gender, who you want to meet, age range and city can be changed after onboarding. | API test; browser test saves "nyc" and gets "New York" |
| 26 | Settings | Pause: you stop getting suggestions and are hidden from others; matches stay. "This week" says you are paused, with Resume. | API test; browser test |
| 27 | Photos | Up to 4 photos, resized in the browser, checked by file signature (JPEG/PNG/WebP), 3 MB cap. | API test; browser upload test |
| 28 | Photos | Photos only after a match by default (a setting). Photo URLs are permission-checked: owner, matches, or this week's suggestions when allowed. | API test for each viewer |
| 29 | Photos | Choose the main photo, remove photos; cards show a swipeable gallery; match list shows avatars. | Screenshots |
| 30 | Profile | Write your own lines from 14 prompts (contact details still blocked). | API test; browser test |
| 31 | Profile | Add or remove interests from a list. | API test; browser test |
| 32 | Profile | Dealbreakers can be added and removed by hand. | API test |
| 33 | Profile | The hidden profile opens with a plain-words summary ("So far you come across as…"). | Unit test |
| 34 | Notifications | In-app notifications with a bell and unread dot: new match, new message, weekly picks, check-ins. | API test; browser test opens a match from the bell |
| 35 | Notifications | Emails for picks, matches and messages, each switchable, only sent when you do not have the app open, and one per unread conversation. | API test |
| 36 | Messaging | Messages arrive live (server-sent events), no refresh needed. | API stream test; browser test |
| 37 | Messaging | "Seen" read receipts. | API test; browser test |
| 38 | Messaging | Icebreaker suggestions built from shared interests and profile lines. | API test; browser test |
| 39 | Messaging | Message times; match list shows when the last message was. | Screenshots |
| 40 | Safety | Hurtful messages are blocked with a clear reason; three blocks create an automatic report. | Unit and API tests; browser test |
| 41 | Safety | Report someone straight from a weekly suggestion; they never come back. | API test |
| 42 | Safety | Unmatch and report in an in-page dialog; reports carry the last 10 messages for the moderator. | Browser test |
| 43 | Moderation | Moderator page (ADMIN_EMAILS): dismiss, suspend (signed out everywhere, emailed), restore. Suspended accounts cannot sign in. | API test; browser test dismisses a report |
| 44 | Moderation | Stats: people, ready, paused, suspended, matches, messages this week, open reports. | API test |
| 45 | Matching | When a week comes up short, "Widen my age range" refills it. | API test |
| 46 | Matching | An hourly job prepares Monday's picks and sends one "your two people are here" notification. | API test |
| 47 | Matchmaker | A week after a match, the matchmaker asks how it went and learns from the answer. | API test |
| 48 | Matchmaker | 16 deeper follow-up questions after the core interview, two per trait. | Unit test |
| 49 | Matchmaker | Spots contradictions (for example "homebody" after "life of the party") and asks once to clarify. | Unit test |
| 50 | Matchmaker | "Welcome back" with the open question after a day away. | Unit test |
| 51 | Matching | City names are cleaned up ("nyc", "München", "london, uk"), so same-city matching works. | Unit test |
| 52 | Privacy | Download all your data as JSON. | API test |
| 53 | Privacy | Deleting your account also removes photos, links and notifications. | API test |
| 54 | Ops | Daily backups of the data file, last 7 kept. | Unit test |
| 55 | Ops | All settings from environment variables, with warnings at start for risky gaps. | Unit test |
| 56 | Ops | /api/health and optional request logging with ids masked. | API test |
| 57 | Ops | Graceful shutdown saves data and closes live connections. | Manual start/stop |
| 58 | Code | Server split into one file per area with a small router; same behaviour (all 57 earlier tests still pass). | Full suite |
| 59 | Client | In-page dialogs replace browser prompt() and confirm() everywhere. | Browser test |
| 60 | Client | Light, dark or automatic theme. | Browser test; screenshots |
| 61 | Client | Talk keeps a half-written answer across reloads; character counter near the limit; a failed send puts the answer back. | Manual check |
| 62 | Client | Offline banner, and friendly errors with "Try again". | Manual check |
| 63 | Client | Loading placeholder, shown only when a screen is slow. | Manual check |
| 64 | Client | Real "Nothing here" page for unknown links. | Browser test |
| 65 | Client | "How ziDate works" page covering the two profiles, privacy and safety. | Screenshots |
| 66 | Client | Installable app (manifest) with offline shell caching; the API is never cached. | Manual check |
| 67 | Ops | Dockerfile with a /data volume and health check. | Not built here (no Docker daemon); runs the same command as `npm start` |
| 68 | Ops | GitHub Actions workflow: unit, API and browser tests, plus a Docker build. | Not run (no repository yet) |
| 69 | Bug | Pausing mid-week still showed the week's picks. Paused now always wins. | Found by the new browser test |
| 70 | Bug | Dialog dropdowns started empty, so "Add a line" always failed. Also: match messages now have their own bubble, and the forgot-password page keeps the email you typed. | Found by the new browser test; screenshots |
| 71 | Feature | Pick the day your weekly two arrive (Settings), at midnight in your own time zone (taken from the browser at sign-up). Changing the day keeps the current pair, so a week is never repeated or skipped. | Unit tests for day/time-zone weeks and day changes; API test; screenshots |

## Rebrand (72)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 72 | Brand | ziDate is now Pishi ("cat" in Farsi): name everywhere, a flat vector cat logo (logo.svg) in the header, welcome page, favicon and app icons, a rose accent colour matching it, and `PISHI_*` environment variables (were `ZIDATE_*`). | Full suite; screenshots |
