# Browser tests (Chromium via Playwright, no real Firebase)

Real pages (`inbox.html`, `index.html`, `search.html`, `sw.js`) run in Chromium under the **production CSP**;
`www.gstatic.com` is mapped to a local server that serves an in-memory fake of the Firebase SDK
(real-time listeners included). Needs: Node 20+, `npm i -g playwright`, Chromium, `openssl`.

    node tests/browser/inbox.test.mjs        # inbox, push card states, live updates, outage/timeout
    node tests/browser/bell-search.test.mjs  # home bell badge + "send request" payload shape
    node tests/browser/sw-push.test.mjs      # push -> system notification (Chrome's own push simulator)
    node --test tests/sw-click.test.mjs      # notification click behaviour (mocked worker scope)
    node --test tests/api/notify.test.mjs    # api/notify.js (fake Admin SDK)
    (cd tests/rules && npm i && npm test)    # Firestore rules on the real emulator (needs Java)

The fake does NOT enforce security rules — that is what `tests/rules` is for. The two together check that the
client payloads match what the rules accept.
