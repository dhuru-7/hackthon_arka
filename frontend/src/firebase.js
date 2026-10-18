import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Firebase credentials for soup-97c76
const firebaseConfig = {
  apiKey: "AIzaSyC11a5YqlpWCrIrNgM26qQmXedC-7erfEc",
  authDomain: "soup-97c76.firebaseapp.com",
  projectId: "soup-97c76",
  storageBucket: "soup-97c76.firebasestorage.app",
  messagingSenderId: "1076262381764",
  appId: "1:1076262381764:web:9876ea91c1d12bf5910191",
  measurementId: "G-WTHL9Y1JG8"
};

// Initialize Firebase App singleton
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const db = getFirestore(app);

// Fallback dummy auth object so legacy references do not crash
const auth = {
  currentUser: null
};

export { app, db, auth, firebaseConfig };
