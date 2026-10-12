# Improvement cycles

Each cycle: find a problem (from tests, screenshots, or a read-through), fix it, add or update a test, run the full suite.

| # | Problem found | Fix | Verified by |
|---|---|---|---|
| 1 | The browser logged two 401 errors on every visit while signed out, because `/api/me` treated "not signed in" as an error. | `/api/me` returns `{ user: null }` when signed out; protected routes still return 401. | API auth test updated; browser test asserts a clean console. |
