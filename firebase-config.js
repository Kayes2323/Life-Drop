import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBpw6cXNgXNxnWNOn2IQ0IhfXzQv2Qoqxk",
  authDomain: "life-drop-d4784.firebaseapp.com",
  projectId: "life-drop-d4784",
  storageBucket: "life-drop-d4784.firebasestorage.app",
  messagingSenderId: "671053363784",
  appId: "1:671053363784:web:825fa9afa4f58a3ec2f67d"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence).catch(() => {});