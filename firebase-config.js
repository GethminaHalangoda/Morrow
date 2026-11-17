/**
 * MORROW — Firebase Authentication & Cloud Firestore Integration
 * 
 * Replace the configuration object below with your Firebase project credentials.
 * Setup Guide:
 * 1. Go to https://console.firebase.google.com/
 * 2. Create a project named "MORROW"
 * 3. Add a Web App (</>) and copy your credentials.
 * 4. Enable Authentication -> Sign-in Method -> Google.
 * 5. Enable Firestore Database in production mode.
 */

const firebaseConfig = {
  apiKey: "AIzaSyCFET39-qDGRHr9GQ3M-8K5XcJxh1vcsCk",
  authDomain: "morrow-1ca90.firebaseapp.com",
  projectId: "morrow-1ca90",
  storageBucket: "morrow-1ca90.firebasestorage.app",
  messagingSenderId: "828621039806",
  appId: "1:828621039806:web:4cb015ab976693cf6416ef",
  measurementId: "G-C0HC7F8N5L"
};

let auth = null;
let db = null;
let isFirebaseInitialized = false;

try {
  if (firebaseConfig.apiKey !== "YOUR_API_KEY_HERE") {
    firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Enable offline persistence
    db.enablePersistence().catch(err => {
      console.warn("Firestore persistence notice:", err.code);
    });

    // Keep users signed in until explicit logout
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    isFirebaseInitialized = true;
    console.log("MORROW: Firebase initialized successfully.");
  } else {
    console.warn("MORROW: Firebase running in Local Storage fallback mode until credentials are inserted.");
  }
} catch (e) {
  console.error("Firebase init error:", e);
}

// Google Authentication
window.signInWithGoogle = async function() {
  if (!isFirebaseInitialized) {
    alert("Please insert your Firebase credentials inside 'firebase-config.js' to enable cloud Google sign-in.");
    return null;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    return result.user;
  } catch (err) {
    console.error("Sign-in failure:", err);
    throw err;
  }
};

window.signOutUser = async function() {
  if (isFirebaseInitialized && auth) {
    await auth.signOut();
  }
};

// Global Presence updater
window.updateCloudPresence = async function(userId, status) {
  if (!isFirebaseInitialized || !db || !userId) return;
  try {
    await db.collection("users").doc(userId).set({
      presenceStatus: status, // 'studying' (green), 'online' (orange), 'offline' (red)
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Presence sync error:", err);
  }
};