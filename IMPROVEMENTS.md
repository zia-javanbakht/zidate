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
| 72 | Matching | Passing now opens a short conversation about why: the main reason as quick replies (only the ones that fit), then a follow-up for that reason. Answers steer partner preferences, set age or distance limits, or favour fuller profiles. The other person's hidden profile is never shown, only neutral labels. | Unit, API and browser tests |
| 73 | Profile | Five more hidden traits (affection, disagreements, tidiness, independence, humour) with deeper questions; how someone feels cared for and how fast they like things to move; marriage and vegan tags. Readiness still uses the first eight traits, so nobody waits longer. | Unit tests |
| 74 | Profile | Shared-profile facts (work, education, languages, height, looking for, kids, drinking, smoking, diet, pets), suggested from the conversation and shown only once approved; five more prompts. | Unit and API tests; screenshots |

## Rebrand (75)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 75 | Brand | ziDate is now Pishi ("cat" in Farsi): name everywhere, a flat vector cat logo (logo.svg) in the header, welcome page, favicon and app icons, a rose accent colour matching it, and `PISHI_*` environment variables (were `ZIDATE_*`). | Full suite; screenshots |

## Round 3: guided profiles, matching signals, five review cycles (76–87)

Asked for: guide people to complete both profiles; keep a much more detailed record per person that is not shown to them, to improve matching; then five cycles of critical analysis, suggestions and fixes.

| # | Area | What changed | Verified by |
|---|---|---|---|
| 76 | Profile | "Finish your profile" card: progress for the shared and hidden profile, the next step with a button straight to it, and two more to-dos. "I have none" settles dealbreakers. | Unit and API tests; screenshots |
| 77 | Matchmaker | Once matching has started, every six answers the matchmaker points at the most useful gap on the profiles (photo, bio, lines, suggestions waiting, facts, interests, dealbreakers), never the same one twice in a row. | Unit test |
| 78 | Matching | Matching signals, kept per person apart from the user record and never shown in the app: answer pace and length, skips, likes and passes by what the other person showed, revealed trait preferences, who answers their matches, active hours, how often people like them, and Claude's private observations. Included in the data export, deleted with the account, disclosed on the About page. | Unit and API tests (no app response contains them) |
| 79 | Matching | Ranking adds a small behaviour-based adjustment from those signals: revealed preferences, like chance, responsiveness, reports, spreading attention, overlapping hours. | Unit tests |
| 80 | Cycle 1, privacy | The "which part of their life" follow-up listed the traits where the other person's hidden profile differed most, so it hinted at their hidden stance. It now offers a fixed list. | Unit test |
| 81 | Cycle 1, safety | Someone paused, suspended or blocked mid-week stayed in the picks and could still be liked into a match. They now drop out at once. | API tests |
| 82 | Cycle 2, signals | One person reporting someone three times counted three times, and dismissed reports kept counting. Reports now count once per reporter and only while they stand. | Unit test |
| 83 | Cycle 2, signals | The export now carries the raw signals record, and the matchmaker's private observations are fed back to it as context instead of only being collected. | API and unit tests |
| 84 | Cycle 3, matching | Every like raised the learned partner preference until it outweighed everything the person said. Likes now stop at a modest confidence. Widening a short week tops it up instead of rerolling it, is refused on a full week, and also lifts the city and age limits learned from passes. | Unit tests |
| 85 | Cycle 4, robustness | A pass landing while Claude was answering could overwrite the "why did you pass" question. Chat, decisions, widening and "Not me" now run one at a time per person. The store is written only after changes, suggested-before is an index instead of a scan, and sessions are pruned hourly. | API tests |
| 86 | Cycle 5, profile | Interests heard in the conversation went public without approval. They are now suggestions ("You mentioned hiking, films. Show them?"), still used for matching but never named to others until approved. | Unit and API tests |
| 87 | Cycle 5, matchmaker | Nudges could stall on a step only the interview covers, and an automatic contradiction check opened with "You said I got something wrong" when the person had said no such thing. Both fixed. | Unit tests |

## Photos (88–89)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 88 | Profile | Photos on a profile are shown one at a time, full width: swipe, tap the left or right edge, use the arrows (on devices with a mouse) or the dots, or the arrow keys. A "2 / 3" counter shows where you are. | Browser test |
| 89 | Profile | People are asked for at least three photos (not required): empty slots and a short tip on the Photos card, a "you have 1" step in the profile guide, and a matchmaker nudge that changes once there is one. | Unit and browser tests; screenshots |

## Logo (90)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 90 | Brand | The logo is now an 80s-style pixel cat, hand-drawn on a 32 x 32 grid: a sitting cat whose raised tail curls over its head into a question mark. Same rose palette plus a pale pink for whiskers and eye glints, a one-colour version (logo-mono.svg), and the favicon and app icons rendered at whole-pixel multiples so they stay crisp. The header and welcome page show it at 32 and 128 px for the same reason. | Rendered at 512, 192, 128, 64 and 32 px |

## Distance (91)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 91 | Matching | Distance now counts, not just "same city or not". About 130 cities have coordinates, so the matchmaker knows Reading is next to London and Berlin is not. It asks early whether long distance is an option (only near me, up to a few hours away, distance is no problem), also changeable in Settings. Both people's answers must allow the distance between them, people nearby rank first unless the person is open to long distance, and the reason says how far away someone is ("About 930 km away, in Berlin."). "Too far away" on a pass now means your area rather than your exact city, and the private like/pass record uses the same nearby rule. Demo people have a mix of answers and some live in the next town over. | Unit, API and browser tests |

## Round 4: features from the top five apps (92–114)

Asked for: analyse the app, suggest what is missing compared with the five apps in research/dating-app-features.md (Hinge, Coffee Meets Bagel, Tinder, OkCupid, Bumble), and apply the improvements, for at least 20 cycles. Photo verification, photo looks and the temperament questionnaire were left to the threads already working on them. Each cycle: compare, pick the gap, build it, test it.

| # | Cycle | Area | What changed | Verified by |
|---|---|---|---|---|
| 92 | 1 | Likes (Hinge) | Like one particular line or photo of a suggestion, with an optional note. Notes are checked like messages and may not carry contact details. Only photos the person could see can be liked. | API tests |
| 93 | 2 | Likes | Hearts on each line and "Like this photo" under the gallery. The other person sees "Ana liked your line" with the quote and the note on their card before they decide; a plain like stays private. Once matched, the note opens the conversation, quoted. A pass drops the note. | API and browser tests |
| 94 | 3 | After a match (Hinge "We Met") | A week after matching the matchmaker asks "Did you meet?" with quick replies: met and want to again, once was enough, still talking, did not really talk. "Again" pulls partner preferences toward that person a little more than a like does. | API test |
| 95 | 4 | After a match | "Once was enough" asks why: no spark, did not look like their photos, lives felt different, did not feel safe (also a report to moderators, with an emergency-number line), or something else. Each feeds the same follow-ups as a pass. "Still talking" is asked once more two weeks later. | API tests |
| 96 | 5 | Matching | Answers about a person, counted across everyone who met them, nudge their ranking: wanted again lifts, "not like their photos" lowers. One review alone never moves anything. Reviews are filed under a one-way key, never naming who said it. | Unit tests |
| 97 | 6 | After a match | "Did you meet?" is also in the conversation itself, any time, and the matchmaker's why-question comes first. | API and browser tests |
| 98 | 7 | Conversations (CMB) | Close a conversation kindly: pick one of three polite last messages or write your own. The thread stays readable but quiet; the other person is told, nobody is blocked, and nothing is left hanging. | API and browser tests |
| 99 | 8 | Conversations (Hinge "Your Turn Limits") | Next week's two wait while anyone has been waiting two days or more for your reply: the week page lists who, and the weekly job says so once. Answering or closing kindly releases them. Demo people, and people who are suspended or paused, never hold a week. | API tests |
| 100 | 9 | Conversations | Reminders: one "Ben is waiting for your reply" per waiting message after three days, one "Say hello?" for a silent new match. "Your turn" on the matches list. | API test |
| 101 | 10 | Weekly two (CMB) | The day before a week ends, people who have not decided get one "last day" reminder, and the week page says undecided suggestions go when the next pair arrives. | API test |
| 102 | 11 | Safety (Bumble Share Date) | Trusted contact in Settings. From a conversation, share who you are meeting (name, age, city), where and when; the contact gets an email that says plainly Pishi cannot see where anyone is and does not call emergency services. Changing the plan sends an update. | API and browser tests |
| 103 | 12 | Safety | Three hours after the start: "Are you home safe?". Five hours after with no answer: one email to the contact asking them to check in. "I am home safe" and "Call off" both tell the contact. | API test |
| 104 | 13 | Safety | Limits: a confirmed email is required, three shares a day, not yourself as the contact, never about demo profiles, at most two months ahead. The match is never told. | API tests |
| 105 | 14 | Safety, review | Unmatching mid-date hid the "home safe" button; open plans now show on the Matches page whatever happened to the match. If the server was down for two days, an old date no longer sends a late alarm. | API test |
| 106 | 15 | Dates (Tinder events) | Once both have written twice, "Ideas for a first date" from interests both show: short, public, easy-to-end plans. A tap fills the message box. | API test |
| 107 | 16 | Openers (Bumble Opening Moves, CMB) | Up to three opening questions on the shared profile, from a list or your own. They show on your card, and a match sees "You asked: …" as their first way to start. | API and browser tests |
| 108 | 17 | Profile (Hinge Prompt Feedback) | Lines you write yourself get "Great answer", "Go a little deeper" or "Try a small change" with one tip: too short, a cliché with no detail, or a list of don'ts. Shown when you add or edit a line and under your own lines. | Unit test |
| 109 | 18 | Weekly two (OkCupid) | "Why we picked them" also names facts both chose to show (both want kids, neither smokes, both looking for something long-term, a language other than English). Hidden tags are never named. | Unit test |
| 110 | 19 | Identities (OkCupid) | Non-binary people can be sought on their own, or together with women or with men, not only under "everyone"; the matchmaker understands it typed. Pronouns are a shared-profile fact. | Unit test |
| 111 | 20 | Privacy, review | Notes you sent and your date plans are in your data export; your own meeting answers are in the signals summary. What others said about you is only counted, never shown. Deleting an account removes what that person said about people they met, and their held-week records. | API test |
| 112 | 21 | Demo, review | Demo people answer a note straight away, never hold your week or trigger "waiting for your reply" (they always have the last word), and cannot be the subject of a shared date. | API test |
| 113 | 22 | Guide | The profile guide and the matchmaker's nudges suggest an opening question; the About page covers likes with notes, your turn, after you meet and Share Date. | Unit tests |
| 114 | 23 | Review | Browser test of the whole flow at phone size (likes with a note, quote, opener, Share Date, home safe, did you meet, closing kindly, trusted contact, opening questions). It found that opening questions disappeared once a note had opened the conversation; they now show until you have written yourself. | Browser test |

## Photo verification (115)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 115 | Safety | Photo verification with a Verified badge. On the You page, people take a live selfie (camera in the browser, or the phone camera as a fallback) in a pose picked at random, such as "Cover one eye with your hand". With an API key, Claude compares it with their photos and checks it is a live photo in the right pose: a clear match verifies at once, a wrong pose or a photo of a screen asks for another try, a mismatch can go to a moderator, and anything unsure goes to the moderators' new queue (selfie next to the profile photos, Same person or Does not match). Without a key a moderator checks every selfie. The badge shows on the profile card only while every photo has been checked; a new photo is compared with the stored selfie the same way. The selfie is never shown on the profile, is in the data export as a status only, and is deleted with the verification or the account. Five tries a day. | API and unit tests; browser test with a fake camera |

## Pishi Plus looks (116–117)

| # | Area | What changed | Verified by |
|---|---|---|---|
| 116 | Pishi Plus, matching | Looks: with Pishi Plus, the matchmaker learns which styles someone goes for from the photos of people they like and pass on (only when those photos were visible before deciding). Claude vision describes each photo once, on upload, in a fixed list of style words (hair, glasses, style of dress, tattoos, expression, setting); the list has no words for ethnicity, skin colour, body shape or size, age or attractiveness, and group photos only describe the scene. Leanings live in the matching signals, never shown in the app, and add at most ±0.06 to the ranking after four decisions. No key means no descriptions and no effect. | Unit and API tests (fake vision engine) |
| 117 | Accounts | A `plan` flag for Pishi Plus, set by moderators (`POST /api/admin/users/:id/plan`) until there is billing, or for everyone with `PISHI_PLUS_ALL=1`. Photo descriptions are in the owner's export and deleted with the photo or account; the About page explains the feature. | API tests |
