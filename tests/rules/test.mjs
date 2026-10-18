import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import firebase from 'firebase/compat/app'; import 'firebase/compat/firestore';
import fs from 'fs';
const FV = firebase.firestore.FieldValue, TS = firebase.firestore.Timestamp;
const env = await initializeTestEnvironment({ projectId: 'demo-sondhan', firestore: { rules: fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8'), host: '127.0.0.1', port: 8085 } });
let pass = 0, fail = 0;
const t = async (name, p, want = 'ok') => { try { await (want === 'ok' ? assertSucceeds(p) : assertFails(p)); pass++; console.log('  PASS', name); } catch (e) { fail++; console.log('  FAIL', name, '—', String(e.message).slice(0, 140)); } };
const seed = async () => { await env.clearFirestore(); await env.withSecurityRulesDisabled(async c => { const d = c.firestore();
  await d.doc('donors/donorA').set({ uid: 'donorA', name: 'A', blood: 'O+' }); await d.doc('donors/donorB').set({ uid: 'donorB', name: 'B', blood: 'A+' });
  await d.doc('donorsPrivate/donorA').set({ phone: '01711111111' }); await d.doc('donorsPrivate/donorB').set({ phone: '01722222222' });
  await d.doc('users/seeker1').set({ uid: 'seeker1' }); await d.doc('users/seeker2').set({ uid: 'seeker2' }); }); };
const S = () => env.authenticatedContext('seeker1').firestore(), D = () => env.authenticatedContext('donorA').firestore(), X = () => env.authenticatedContext('stranger').firestore(), ANON = () => env.unauthenticatedContext().firestore();
const base = (o = {}) => ({ donorId: 'donorA', seekerUid: 'seeker1', seekerName: 'Rahim', msg: 'Need O+ at DMCH', status: 'pending', createdAt: FV.serverTimestamp(), ...o });
const seedReq = async (status = 'pending', ageMs = 0) => env.withSecurityRulesDisabled(async c => { const d = c.firestore();
  await d.doc('donorRequests/seeker1_donorA').set({ donorId: 'donorA', seekerUid: 'seeker1', seekerName: 'Rahim', msg: 'm', status, createdAt: TS.fromMillis(Date.now() - ageMs), ...(status !== 'pending' && status !== 'cancelled' ? { respondedAt: TS.now() } : {}) });
  await d.doc('donorRequests/seeker1_donorA/contact/phone').set({ phone: '01933333333' }); });
const DAY = 25 * 3600 * 1000;

console.log('CREATE'); await seed();
await t('seeker creates valid request', S().doc('donorRequests/seeker1_donorA').set(base()));
await seed(); await t('anonymous cannot create', ANON().doc('donorRequests/seeker1_donorA').set(base()), 'fail');
await t('wrong doc id', S().doc('donorRequests/random').set(base()), 'fail');
await t('request to self', env.authenticatedContext('donorA').firestore().doc('donorRequests/donorA_donorA').set(base({ donorId: 'donorA', seekerUid: 'donorA' })), 'fail');
await t('spoofed seekerUid', S().doc('donorRequests/seeker1_donorA').set(base({ seekerUid: 'seeker2' })), 'fail');
await t('donor profile does not exist', S().doc('donorRequests/seeker1_ghost').set(base({ donorId: 'ghost' })), 'fail');
await t('extra field rejected', S().doc('donorRequests/seeker1_donorA').set({ ...base(), phone: '017' }), 'fail');
await t('status=accepted at creation', S().doc('donorRequests/seeker1_donorA').set(base({ status: 'accepted' })), 'fail');
await t('msg too long (501)', S().doc('donorRequests/seeker1_donorA').set(base({ msg: 'x'.repeat(501) })), 'fail');
await t('empty msg', S().doc('donorRequests/seeker1_donorA').set(base({ msg: '' })), 'fail');
await t('client-supplied createdAt (backdated)', S().doc('donorRequests/seeker1_donorA').set(base({ createdAt: TS.fromMillis(1000) })), 'fail');

console.log('RATE LIMIT'); await seed();
{ const db = S(); const b = db.batch();
  b.set(db.doc('donorRequests/seeker1_donorA'), base()); b.set(db.doc('users/seeker1'), { lastDonorRequestAt: FV.serverTimestamp() }, { merge: true });
  b.set(db.doc('donorRequests/seeker1_donorA/contact/phone'), { phone: '01933333333' });
  await t('batch: request + stamp + contact phone', b.commit()); }
await t('2nd request to another donor within 10s blocked', S().doc('donorRequests/seeker1_donorB').set(base({ donorId: 'donorB' })), 'fail');
await env.withSecurityRulesDisabled(c => c.firestore().doc('users/seeker1').set({ lastDonorRequestAt: TS.fromMillis(Date.now() - 60000) }, { merge: true }));
await t('after 60s it is allowed', S().doc('donorRequests/seeker1_donorB').set(base({ donorId: 'donorB' })));

console.log('READ / LIST'); await seed(); await seedReq();
await t('donor reads own', D().doc('donorRequests/seeker1_donorA').get()); await t('seeker reads own', S().doc('donorRequests/seeker1_donorA').get());
await t('stranger cannot read', X().doc('donorRequests/seeker1_donorA').get(), 'fail');
await t('donor inbox query', D().collection('donorRequests').where('donorId', '==', 'donorA').limit(50).get());
await t('seeker sent query', S().collection('donorRequests').where('seekerUid', '==', 'seeker1').limit(50).get());
await t('stranger cannot query someone else', X().collection('donorRequests').where('donorId', '==', 'donorA').limit(50).get(), 'fail');
await t('unfiltered list denied', D().collection('donorRequests').limit(50).get(), 'fail');
await t('anonymous cannot read', ANON().doc('donorRequests/seeker1_donorA').get(), 'fail');

console.log('DONOR RESPONDS'); await seed(); await seedReq();
await t('stranger cannot accept', X().doc('donorRequests/seeker1_donorA').update({ status: 'accepted', respondedAt: FV.serverTimestamp() }), 'fail');
await t('seeker cannot accept own', S().doc('donorRequests/seeker1_donorA').update({ status: 'accepted', respondedAt: FV.serverTimestamp() }), 'fail');
await t('donor cannot edit msg', D().doc('donorRequests/seeker1_donorA').update({ msg: 'hack', status: 'accepted', respondedAt: FV.serverTimestamp() }), 'fail');
await t('donor cannot set status=cancelled', D().doc('donorRequests/seeker1_donorA').update({ status: 'cancelled', respondedAt: FV.serverTimestamp() }), 'fail');
await t('donor accepts', D().doc('donorRequests/seeker1_donorA').update({ status: 'accepted', respondedAt: FV.serverTimestamp() }));
await t('donor cannot flip an answered request', D().doc('donorRequests/seeker1_donorA').update({ status: 'declined', respondedAt: FV.serverTimestamp() }), 'fail');

console.log('SEEKER CANCEL / RENEW'); await seed(); await seedReq();
await t('seeker cancels pending', S().doc('donorRequests/seeker1_donorA').update({ status: 'cancelled' }));
await seed(); await seedReq('declined', 3600 * 1000);
await t('renew within 24h blocked', S().doc('donorRequests/seeker1_donorA').set(base()), 'fail');
await seed(); await seedReq('declined', DAY);
await t('renew after 24h allowed (clears respondedAt)', S().doc('donorRequests/seeker1_donorA').set(base({ msg: 'again' })));
await seed(); await seedReq('declined', DAY);
await t('renew cannot keep old respondedAt', S().doc('donorRequests/seeker1_donorA').set({ ...base(), respondedAt: FV.serverTimestamp() }), 'fail');
await seed(); await seedReq('accepted', DAY);
await t('seeker cannot self-accept via renew', S().doc('donorRequests/seeker1_donorA').set(base({ status: 'accepted' })), 'fail');

console.log('SEEKER PHONE (contact/phone)'); await seed(); await seedReq('pending');
await t('donor cannot read phone while pending', D().doc('donorRequests/seeker1_donorA/contact/phone').get(), 'fail');
await t('seeker can read own phone doc', S().doc('donorRequests/seeker1_donorA/contact/phone').get());
await t('stranger cannot read phone', X().doc('donorRequests/seeker1_donorA/contact/phone').get(), 'fail');
await t('donor cannot write phone doc', D().doc('donorRequests/seeker1_donorA/contact/phone').set({ phone: '01800000000' }), 'fail');
await t('phone doc cannot hold extra fields', S().doc('donorRequests/seeker1_donorA/contact/phone').set({ phone: '01933333333', x: 1 }), 'fail');
await t('contact list denied', S().collection('donorRequests/seeker1_donorA/contact').get(), 'fail');
await seed(); await seedReq('accepted');
await t('donor reads phone after accept', D().doc('donorRequests/seeker1_donorA/contact/phone').get());

console.log('DONOR CONTACT SHARED ONLY AFTER ACCEPT'); await seed(); await seedReq('pending');
await t('seeker cannot read donor private while pending', S().doc('donorsPrivate/donorA').get(), 'fail');
await seed(); await seedReq('declined', DAY);
await t('...nor after decline', S().doc('donorsPrivate/donorA').get(), 'fail');
await seed(); await seedReq('accepted');
await t('seeker reads donor private after accept', S().doc('donorsPrivate/donorA').get());
await t('...but not a different donor', S().doc('donorsPrivate/donorB').get(), 'fail');
await t('stranger still cannot read donor private', X().doc('donorsPrivate/donorA').get(), 'fail');
await t('donorsPrivate list still denied', S().collection('donorsPrivate').get(), 'fail');

console.log('FCM TOKENS'); await seed();
await t('owner saves 1 token', S().doc('fcmTokens/seeker1').set({ tokens: ['t1'], updatedAt: FV.serverTimestamp() }));
await t('owner cannot save 6 tokens', S().doc('fcmTokens/seeker1').set({ tokens: ['1','2','3','4','5','6'], updatedAt: FV.serverTimestamp() }), 'fail');
await t('owner cannot add extra fields', S().doc('fcmTokens/seeker1').set({ tokens: ['t1'], admin: true }), 'fail');
await t('other user cannot read tokens', X().doc('fcmTokens/seeker1').get(), 'fail');
await t('other user cannot write tokens', X().doc('fcmTokens/seeker1').set({ tokens: ['evil'], updatedAt: FV.serverTimestamp() }), 'fail');
await t('tokens list denied', S().collection('fcmTokens').get(), 'fail');
await t('owner reads own tokens', S().doc('fcmTokens/seeker1').get());
await t('owner deletes own tokens', S().doc('fcmTokens/seeker1').delete());

console.log('HEALTH RECORDS'); await seed();
const hr = (o = {}) => ({ ownerUid: 'seeker1', category: 'prescription', docDate: '2026-01-01', createdAt: FV.serverTimestamp(), pageCount: 1, pages: [{ path: 'x', name: 'a.jpg', type: 'image/jpeg', size: 100 }], ...o });
await t('owner creates own record', S().collection('healthRecords').add(hr()));
await t('cannot create for someone else', S().collection('healthRecords').add(hr({ ownerUid: 'seeker2' })), 'fail');
await t('anonymous cannot create', ANON().collection('healthRecords').add(hr()), 'fail');
await t('bad category rejected', S().collection('healthRecords').add(hr({ category: 'xray' })), 'fail');
await t('pageCount/pages mismatch rejected', S().collection('healthRecords').add(hr({ pageCount: 2 })), 'fail');
await t('extra field rejected', S().collection('healthRecords').add({ ...hr(), note: 'x' }), 'fail');
await t('title too long rejected', S().collection('healthRecords').add(hr({ title: 'x'.repeat(101) })), 'fail');
{ let ref;
  await env.withSecurityRulesDisabled(async c => { ref = c.firestore().collection('healthRecords').doc('rec1'); await ref.set(hr()); });
  await t('owner reads own record', S().doc('healthRecords/rec1').get());
  await t('stranger cannot read record', X().doc('healthRecords/rec1').get(), 'fail');
  await t('anonymous cannot read record', ANON().doc('healthRecords/rec1').get(), 'fail');
  await t('owner query (filtered) works', S().collection('healthRecords').where('ownerUid', '==', 'seeker1').limit(100).get());
  await t('stranger filtered query for own uid returns nothing, not denied', X().collection('healthRecords').where('ownerUid', '==', 'stranger').limit(100).get());
  await t('stranger cannot query someone else\'s uid', X().collection('healthRecords').where('ownerUid', '==', 'seeker1').limit(100).get(), 'fail');
  await t('unfiltered list denied', S().collection('healthRecords').limit(100).get(), 'fail');
  await t('update is always rejected (MVP)', S().doc('healthRecords/rec1').update({ title: 'new' }), 'fail');
  await t('stranger cannot delete', X().doc('healthRecords/rec1').delete(), 'fail');
  await t('owner deletes own record', S().doc('healthRecords/rec1').delete());
}

console.log('LEGACY / UNCHANGED'); await seed();
await t("legacy 'requests' collection still closed", S().collection('requests').add({ donorId: 'donorA' }), 'fail');
await t('donors still publicly readable', ANON().doc('donors/donorA').get());
await t('donorsPrivate still closed to anon', ANON().doc('donorsPrivate/donorA').get(), 'fail');
console.log(`\n${pass} passed, ${fail} failed`); await env.cleanup(); process.exit(fail ? 1 : 0);
