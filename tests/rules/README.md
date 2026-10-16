# Firestore rules tests

Runs the real Firestore emulator against `/firestore.rules` (needs Java 11+).

    cd tests/rules && npm install && npm test

Run this **before publishing rules in the Firebase Console**. 57 checks cover donorRequests,
the seeker-phone subdocument, consent-based donor contact sharing, fcmTokens and a few
regression checks on existing collections. (Vercel ignores this folder: only the root
package.json is installed during deploys.)
