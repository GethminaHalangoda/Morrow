/**
 * MORROW — Firebase Authentication & Cloud Firestore Integration
 * Collection: 'users' (Keyed by Google account UID)
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
    // Prevent duplicate app initialization
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
    }
    auth = firebase.auth();
    db = firebase.firestore();

    // Enable multi-tab offline cache safely
    db.enablePersistence({ synchronizeTabs: true }).catch(err => {
      console.warn("Firestore persistence notice:", err.code);
    });

    // Keep users signed in locally across browser reopens
    auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    isFirebaseInitialized = true;
    console.log("MORROW: Firebase initialized with 'users' collection.");
  }
} catch (e) {
  console.error("Firebase initialization error:", e);
}

// ---------------------------------------------------------------------------
// AUTH STATE OBSERVER (Safe profile bootstrap — Never overwrites existing data)
// ---------------------------------------------------------------------------
if (auth) {
  auth.onAuthStateChanged(async (user) => {
    if (user && db) {
      const userId = user.uid;
      const userRef = db.collection("users").doc(userId);

      try {
        const docSnap = await userRef.get();

        if (!docSnap.exists) {
          // Brand New User: create new document using Google account info
          await userRef.set({
            uid: userId,
            email: user.email || "",
            displayName: user.displayName || "Scholar",
            avatar: user.photoURL || null,
            bio: "Focusing deeply.",
            dailyPoints: 0,
            weeklyPoints: 0,
            allTimePoints: 0,
            weeklyHours: 0,
            todaySeconds: 0,
            totalSeconds: 0,
            streak: 0,
            weekDaysDone: [],
            lastStudyDate: null,
            presence: "online",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastActive: firebase.firestore.FieldValue.serverTimestamp()
          });
          console.log(`[MORROW] Created new user document in 'users/${userId}'`);
        } else {
          // Existing User: DO NOT touch points, streak, or stats! Only bump lastActive
          await userRef.set({
            email: user.email || "",
            lastActive: firebase.firestore.FieldValue.serverTimestamp(),
            presence: "online"
          }, { merge: true });
          console.log(`[MORROW] Existing profile verified for 'users/${userId}' (No data overwritten).`);
        }
      } catch (err) {
        console.error("Error setting up user document in Firestore:", err);
      }
    } else {
      console.log("[MORROW] User signed out.");
    }
  });
}

// ---------------------------------------------------------------------------
// GLOBAL METHODS EXPOSED FOR APP.JS
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
    if (auth.currentUser) {
      await window.updateCloudPresence("offline");
    }
    await auth.signOut();
  }
};

// 3. Save / Sync Study Session (Uses atomic increment and merge: true)
window.recordStudySession = async function(sessionMinutes, earnedPoints) {
  if (!isFirebaseInitialized || !db || !auth.currentUser) {
    console.warn("Cannot record session: No authenticated user.");
    return;
  }

  const userId = auth.currentUser.uid;
  const userRef = db.collection("users").doc(userId);
  const hoursToAdd = sessionMinutes / 60;

  try {
    await userRef.set({
      dailyPoints: firebase.firestore.FieldValue.increment(earnedPoints),
      weeklyPoints: firebase.firestore.FieldValue.increment(earnedPoints),
      allTimePoints: firebase.firestore.FieldValue.increment(earnedPoints),
      weeklyHours: firebase.firestore.FieldValue.increment(hoursToAdd),
      todaySeconds: firebase.firestore.FieldValue.increment(sessionMinutes * 60),
      totalSeconds: firebase.firestore.FieldValue.increment(sessionMinutes * 60),
      lastActive: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    console.log(`[MORROW] Added +${sessionMinutes}m and +${earnedPoints}pts to 'users/${userId}'`);
  } catch (err) {
    console.error("Error updating study session:", err);
  }
};

// 4. Update Profile Details (Without overwriting stats)
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
    console.log("[MORROW] User profile successfully merged.");
  } catch (err) {
    console.error("Error updating user profile:", err);
  }
};

// 5. Update Presence (online / studying / offline)
window.updateCloudPresence = async function(status) {
  if (!isFirebaseInitialized || !db || !auth.currentUser) return;
  const userId = auth.currentUser.uid;

  try {
    await db.collection("users").doc(userId).set({
      presence: status,
      lastSeen: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } catch (err) {
    console.error("Presence sync error:", err);
  }
};