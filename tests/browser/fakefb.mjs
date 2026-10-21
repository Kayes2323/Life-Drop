// In-memory fake of the Firebase web SDK modules (served in place of www.gstatic.com), with real-time listeners.
export const stubs = {
 'firebase-app.js': `export const getApps=()=>[globalThis.__app||(globalThis.__app={})];export const initializeApp=()=>(globalThis.__app={});`,
 'firebase-auth.js': `
  const A=globalThis.__authState||(globalThis.__authState={user:null,cbs:[]});
  export const getAuth=()=>({get currentUser(){return A.user}});
  export const onAuthStateChanged=(a,cb)=>{A.cbs.push(cb);setTimeout(()=>cb(A.user),0);return()=>{}};
  globalThis.__setUser=(u)=>{A.user=u?{...u,getIdToken:async()=>'u:'+u.uid,
    // reload() re-reads emailVerified/email from the FA.byUid store below, when the uid is
    // registered there — harmless no-op for tests (inbox/bell/push) that never touch FA.byUid.
    reload:async()=>{const fresh=FA.byUid.get(u.uid);if(fresh){A.user.emailVerified=fresh.emailVerified;A.user.email=fresh.email;}}}:null;A.cbs.forEach(cb=>cb(A.user))};

  // ── email/phone/Google auth fake (login.html / signup.html / verify-email.html tests) ──
  // Separate from __setUser above (left untouched for existing inbox/bell/push tests):
  // this models actual accounts (password, uid, emailVerified, oobCodes) so the real
  // Sondhan auth pages can be exercised end-to-end against a believable backend.
  const FA=globalThis.__fakeAuth||(globalThis.__fakeAuth={
    byEmail:new Map(), byUid:new Map(), nextUid:1,
    oobToUid:new Map(), usedOob:new Set(), lastOobByUid:new Map(), sentVerifications:[],
    phoneCode:'123456',
    failCreate:null, failSignIn:null, failGoogle:null, failSendVerification:null,
    failPhoneSend:null, failPhoneVerify:null, failReauth:null, failUpdateEmail:null,
    failRecaptchaInit:false, recaptchaInstances:0, recaptchaCleared:0,
  });
  globalThis.__fakeAuth = FA;
  // একটা client-side navigation (window.location.replace) পুরো JS global state মুছে দেয়,
  // তাই navigate-away হওয়ার ঠিক আগের মুহূর্তের state in-memory রাখলে পরে দেখা যায় না।
  // এই events টেস্ট-সার্ভারে (একই origin, /__test-event) পাঠিয়ে রাখা হয় যাতে সাইনআপ/লগইন
  // ফ্লো আসলেই redirect-এর আগে sendEmailVerification/setDoc ইত্যাদি ডেকেছে কিনা, নেভিগেশনের
  // পরেও node টেস্ট স্ক্রিপ্ট থেকে যাচাই করা যায়।
  const report=(type,data)=>{ try{ fetch('/__test-event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,data})}).catch(()=>{}); }catch(_){} };
  const err=(code)=>Object.assign(new Error(code||'fake-auth-error'),{code:code||'auth/internal-error'});
  function wrapUser(rec){
    const u={uid:rec.uid,email:rec.email||'',displayName:rec.displayName||'',phoneNumber:rec.phoneNumber||'',
      photoURL:rec.photoURL||'',emailVerified:rec.emailVerified,providerData:rec.providerData||[],
      getIdToken:async()=>'u:'+rec.uid,
      reload:async()=>{const fresh=FA.byUid.get(rec.uid);if(fresh){u.emailVerified=fresh.emailVerified;u.email=fresh.email;u.displayName=fresh.displayName;}}};
    return u;
  }
  function signIn(rec){ const u=wrapUser(rec); A.user=u; A.cbs.forEach(cb=>cb(A.user)); return {user:u}; }
  export const createUserWithEmailAndPassword=async(auth,email,pass)=>{
    if(FA.failCreate) throw err(FA.failCreate);
    if(FA.byEmail.has(email)) throw err('auth/email-already-in-use');
    const rec={uid:'uid'+(FA.nextUid++),email,password:pass,displayName:'',emailVerified:false,providerData:[{providerId:'password'}]};
    FA.byEmail.set(email,rec); FA.byUid.set(rec.uid,rec);
    return signIn(rec);
  };
  export const sendPasswordResetEmail=async(auth,email)=>{
    if(FA.failPasswordReset) throw err(FA.failPasswordReset);
    if(!FA.byEmail.has(email)) throw err('auth/user-not-found');
    report('sendPasswordResetEmail',{email});
  };
  export const signInWithEmailAndPassword=async(auth,email,pass)=>{
    if(FA.failSignIn) throw err(FA.failSignIn);
    const rec=FA.byEmail.get(email);
    if(!rec||rec.password!==pass) throw err('auth/invalid-credential');
    return signIn(rec);
  };
  export const updateProfile=async(user,{displayName})=>{
    const rec=FA.byUid.get(user.uid); if(rec) rec.displayName=displayName;
    user.displayName=displayName;
  };
  export const sendEmailVerification=async(user,settings)=>{
    if(FA.failSendVerification) throw err(FA.failSendVerification);
    const oob='oob-'+user.uid+'-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    FA.oobToUid.set(oob,user.uid); FA.lastOobByUid.set(user.uid,oob);
    FA.sentVerifications.push({uid:user.uid,email:user.email,settings});
    report('sendEmailVerification',{uid:user.uid,email:user.email});
  };
  export const applyActionCode=async(auth,oobCode)=>{
    if(FA.usedOob.has(oobCode)) throw err('auth/invalid-action-code');
    const uid=FA.oobToUid.get(oobCode);
    if(!uid) throw err(oobCode==='__expired__'?'auth/expired-action-code':'auth/invalid-action-code');
    FA.usedOob.add(oobCode);
    const rec=FA.byUid.get(uid); if(rec) rec.emailVerified=true;
    if(A.user&&A.user.uid===uid) A.user.emailVerified=true;
    report('applyActionCode',{uid,oobCode});
  };
  export const checkActionCode=async(auth,oobCode)=>{
    const uid=FA.oobToUid.get(oobCode); if(!uid||FA.usedOob.has(oobCode)) throw err('auth/invalid-action-code');
    const rec=FA.byUid.get(uid); return {data:{email:rec?rec.email:''},operation:'VERIFY_EMAIL'};
  };
  export class GoogleAuthProvider{ setCustomParameters(){} }
  export const signInWithPopup=async(auth,provider)=>{
    if(FA.failGoogle) throw err(FA.failGoogle);
    let rec=FA.byUid.get('google-uid');
    if(!rec){ rec={uid:'google-uid',email:'googleuser@example.com',displayName:'Google User',emailVerified:true,providerData:[{providerId:'google.com'}]}; FA.byUid.set(rec.uid,rec); FA.byEmail.set(rec.email,rec); }
    return signIn(rec);
  };
  export class RecaptchaVerifier{
    constructor(auth,containerId,opts){ if(FA.failRecaptchaInit) throw new Error('recaptcha-init-failed'); FA.recaptchaInstances++; this._cleared=false; }
    render(){ return Promise.resolve(0); }
    clear(){ if(!this._cleared){ this._cleared=true; FA.recaptchaCleared++; } }
  }
  export const signInWithPhoneNumber=async(auth,phone,verifier)=>{
    if(FA.failPhoneSend) throw err(FA.failPhoneSend);
    return { confirm: async(code)=>{
      if(FA.failPhoneVerify) throw err(FA.failPhoneVerify);
      if(code!==FA.phoneCode) throw err('auth/invalid-verification-code');
      const uid='phone-'+phone;
      let rec=FA.byUid.get(uid);
      if(!rec){ rec={uid,phoneNumber:phone,email:'',displayName:'',emailVerified:false,providerData:[{providerId:'phone'}]}; FA.byUid.set(uid,rec); }
      return signIn(rec);
    }};
  };
  export class EmailAuthProvider{ static credential(email,password){ return {email,password,__cred:true}; } }
  export const reauthenticateWithCredential=async(user,cred)=>{
    if(FA.failReauth) throw err(FA.failReauth);
    const rec=FA.byUid.get(user.uid);
    if(!rec||rec.password!==cred.password) throw err('auth/wrong-password');
  };
  export const updateEmail=async(user,newEmail)=>{
    if(FA.failUpdateEmail) throw err(FA.failUpdateEmail);
    if([...FA.byUid.values()].some(r=>r.email===newEmail&&r.uid!==user.uid)) throw err('auth/email-already-in-use');
    const rec=FA.byUid.get(user.uid);
    if(rec){ FA.byEmail.delete(rec.email); rec.email=newEmail; FA.byEmail.set(newEmail,rec); }
    user.email=newEmail;
  };`,
 'firebase-messaging.js': `export const getMessaging=()=>({});export const getToken=async()=>'fcm-token-123';export const deleteToken=async()=>true;`,
 'firebase-firestore.js': `
  const F=globalThis.__fake||(globalThis.__fake={docs:new Map(),listeners:new Set(),log:[],failListen:null,hangListen:false});
  const ts=(ms)=>({__ts:ms,toMillis:()=>ms,toDate:()=>new Date(ms)});
  const rev=v=>JSON.parse(JSON.stringify(v));
  const SERVER={__server:true};
  const resolve=(v)=>{const o={};for(const k in v){o[k]=(v[k]&&v[k].__server)?ts(Date.now()):v[k]}return o};
  const hydrate=(v)=>{const o={};for(const k in v){const x=v[k];o[k]=(x&&typeof x==='object'&&'__ts' in x)?ts(x.__ts):x}return o};
  export const initializeFirestore=()=>({});export const getFirestore=()=>({});export const persistentLocalCache=()=>({});
  export const serverTimestamp=()=>SERVER;
  // পেজ navigate হয়ে গেলে F.log হারিয়ে যায় — setDoc-কে একই /__test-event চ্যানেলে
  // (firebase-auth.js-এর মতোই) রিপোর্ট করাও হয়, যাতে redirect-এর ঠিক আগে "ঠিক একবার
  // profile তৈরি হয়েছে / আগের প্রোফাইল ওভাররাইট হয়নি" নেভিগেশনের পরেও যাচাই করা যায়।
  const report=(type,data)=>{ try{ fetch('/__test-event',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({type,data})}).catch(()=>{}); }catch(_){} };
  export const doc=(db,...p)=>({path:p.join('/'),id:p[p.length-1]});
  export const collection=(db,...p)=>({col:p.join('/')});
  export const where=(f,op,v)=>({f,op,v});export const limit=n=>({limit:n});
  export const query=(c,...cs)=>({col:c.col,cs});
  const match=(q)=>[...F.docs.entries()].filter(([p])=>{const parts=p.split('/');return p.startsWith(q.col+'/')&&parts.length===q.col.split('/').length+1}).filter(([p,d])=>q.cs.every(c=>!c.f||(c.op==='=='&&d[c.f]===c.v))).map(([p,d])=>({id:p.split('/').pop(),data:()=>hydrate(d),__d:d}));
  const snapOf=(q,prev)=>{const docs=match(q);const prevMap=prev||new Map();const changes=[];
    docs.forEach(x=>{const old=prevMap.get(x.id);if(!old)changes.push({type:'added',doc:x});else if(JSON.stringify(old)!==JSON.stringify(x.__d))changes.push({type:'modified',doc:x})});
    return {docs,size:docs.length,docChanges:()=>changes,_map:new Map(docs.map(x=>[x.id,rev(x.__d)]))}};
  export const onSnapshot=(q,next,err)=>{
    if(F.failListen){setTimeout(()=>err&&err({code:F.failListen}),0);return()=>{}}
    if(F.hangListen)return()=>{};
    const L={q,prev:null,next};F.listeners.add(L);
    const fire=()=>{const s=snapOf(q,L.prev);L.prev=s._map;L.next(s)};L.fire=fire;setTimeout(fire,0);return()=>F.listeners.delete(L)};
  const notify=()=>setTimeout(()=>F.listeners.forEach(L=>L.fire()),0);
  const put=(path,data,merge)=>{const cur=F.docs.get(path);F.docs.set(path,merge&&cur?{...cur,...rev(resolveRaw(data))}:rev(resolveRaw(data)))};
  const resolveRaw=(d)=>{const o={};for(const k in d){const v=d[k];o[k]=(v&&v.__server)?{__ts:Date.now()}:v}return o};
  export const getDoc=async(r)=>{const d=F.docs.get(r.path);return{exists:()=>!!d,data:()=>hydrate(d||{}),id:r.id}};
  export const setDoc=async(r,d,o)=>{F.log.push(['set',r.path]);report('setDoc',{path:r.path,merge:!!(o&&o.merge)});put(r.path,d,o&&o.merge);notify()};
  export const updateDoc=async(r,d)=>{F.log.push(['update',r.path,Object.keys(d).join(',')]);if(!F.docs.has(r.path))throw Object.assign(new Error('nf'),{code:'not-found'});put(r.path,d,true);notify()};
  export const deleteDoc=async(r)=>{F.log.push(['delete',r.path]);F.docs.delete(r.path);notify()};
  export const writeBatch=()=>{const ops=[];return{set:(r,d,o)=>ops.push(()=>put(r.path,d,o&&o.merge)),commit:async()=>{if(F.failCommit)throw Object.assign(new Error('x'),{code:F.failCommit});ops.forEach(f=>f());F.log.push(['batch',ops.length]);notify()}}};
  export const arrayUnion=(...a)=>a;export const arrayRemove=(...a)=>a;
  export const getDocs=async()=>({docs:[]});export const addDoc=async()=>({});export const runTransaction=async()=>{};
  export const getAggregateFromServer=async()=>({data:()=>({totalDonors:0,totalDonations:0})});export const sum=()=>0;export const count=()=>0;
  export const orderBy=()=>({});export const onSnapshotsInSync=()=>{};export const writeBatchStub=0;export const deleteField=()=>({});
  export const getCountFromServer=async()=>({data:()=>({count:0})});export const startAfter=()=>({});`
};
