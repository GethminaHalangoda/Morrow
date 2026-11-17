/**
 * MORROW — Firebase Authentication & Cloud Firestore Integration
 * Collection: 'users'
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
  if (firebaseConfig.apiKey) {
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();

    // Enable multi-tab persistence safely
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      console.warn("Firestore persistence notice:", err.code);
    });

    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    isFirebaseInitialized = true;
    console.log("MORROW: Firebase initialized with 'users' collection.");
  }
} catch (e) {
  console.error("Firebase initialization error:", e);
}

// ---------------------------------------------------------------------------
// GLOBAL AUTH & SYNC METHODS
// ---------------------------------------------------------------------------

// 1. Google Authentication Popup
window.signInWithGoogle = async function() {
  if (!isFirebaseInitialized) {
    alert("Firebase is not initialized. Please verify your credentials.");
    return null;
  }
  const provider = new firebase.auth.GoogleAuthProvider();
  try {
    const result = await auth.signInWithPopup(provider);
    return result.user;
  } catch (err) {
    console.error("Google sign-in error:", err);
    throw err;
  }
};

// 2. Sign Out
window.signOutUser = async function() {
  if (isFirebaseInitialized && auth) {
    if (auth.currentUser && window.updateCloudPresence) {
      await window.updateCloudPresence("offline");
    }
    await auth.signOut();
  }
};

// 3. Atomically Record Study Session (Writes both 'points' and 'weeklyPoints' for 100% compatibility)
window.recordStudySession = async function(sessionMinutes, earnedPoints) {
  if (!isFirebaseInitialized || !db || !auth.currentUser) return;

  const userId = auth.currentUser.uid;
  const userRef = db.collection("users").doc(userId);
  const hoursToAdd = sessionMinutes / 60;
  const secondsToAdd = sessionMinutes * 60;

  try {
    await userRef.set({
      points: firebase.firestore.FieldValue.increment(earnedPoints),
      weeklyPoints: firebase.firestore.FieldValue.increment(earnedPoints),
      dailyPoints: firebase.firestore.FieldValue.increment(earnedPoints),
      allTimePoints: firebase.firestore.FieldValue.increment(earnedPoints),
      totalStudyTime: firebase.firestore.FieldValue.increment(sessionMinutes),
      weeklyHours: firebase.firestore.FieldValue.increment(hoursToAdd),
      todaySeconds: firebase.firestore.FieldValue.increment(secondsToAdd),
      totalSeconds: firebase.firestore.FieldValue.increment(secondsToAdd),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[MORROW] Incremented +${sessionMinutes}m and +${earnedPoints}pts in 'users/${userId}'`);
  } catch (err) {
    console.error("Error recording study session:", err);
  }
};

// 4. Update Profile Info
window.updateUserProfile = async function(profileData) {
  if (!isFirebaseInitialized || !db || !auth.currentUser) return;
  const userId = auth.currentUser.uid;

  try {
    await db.collection("users").doc(userId).set({
      displayName: profileData.displayName || "Scholar",
      avatar: profileData.avatar || null,
      bio: profileData.bio || "",
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Error updating profile:", err);
  }
};

// 5. Update Live Presence
window.updateCloudPresence = async function(status) {
  if (!isFirebaseInitialized || !db || !auth.currentUser) return;
  const userId = auth.currentUser.uid;

  try {
    await db.collection("users").doc(userId).set({
      presence: status,
      presenceStatus: status,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp(),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Presence sync error:", err);
  }
};