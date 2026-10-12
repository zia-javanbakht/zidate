# Improvement cycles

Each cycle: find a problem (from tests, screenshots, or a read-through), fix it, add or update a test, run the full suite.

| # | Problem found | Fix | Verified by |
|---|---|---|---|
| 1 | The browser logged two 401 errors on every visit while signed out, because `/api/me` treated "not signed in" as an error. | `/api/me` returns `{ user: null }` when signed out; protected routes still return 401. | API auth test updated; browser test asserts a clean console. |
| 2 | The interview asked almost only open questions, so getting to matching meant typing 8 paragraphs. Writing the test also exposed a bug: when the last answer was a quick-reply tap, the "you're ready" message never appeared. | Questions now alternate a quick tap with an open question. Readiness is measured before the tap is applied. | New pacing test; `scripts/turns-to-ready.mjs` went from 8 typed answers to 7 answers with only 3 typed; ready-announcement test passes again. |
| 3 | Replies felt robotic: "Good to know." after every tap, sometimes twice in a row. | Each quick reply has its own short reaction ("A quiet night in is underrated."), and generic acknowledgements never repeat back to back. "Backpacking" now counts as travel. | New test checks no two consecutive replies open the same way. |
| 4 | Screenshots showed a London user being offered people in New York and Berlin while London people were available. | Suggestions now come from the person's own city first, and only widen when the city runs out; those cards say "A little further away, in Berlin." | New test: a Berlin user gets Berlin picks; a Lisbon user (no local people) gets labelled picks. |
| 5 | A 31-year-old was offered a 44-year-old: the only age rule was a 15-year cap. | The interviewer asks "How close in age would you like them to be?" (quick reply: 5, 10 or 15 years). Both people's ranges must hold; default 8 years. | Matching test covers a tight range on either side. |
