import app from "./config";

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";

import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

// ========================================
// Firebase Initialization
// ========================================

const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getFirestore(app);

// ========================================
// Firestore User Profile
// ========================================

// Create or synchronize the Firestore user profile.
export const saveUserProfile = async (user, additionalName = "") => {
  if (!user) return;

  const userRef = doc(db, "users", user.uid);
  const userSnapshot = await getDoc(userRef);

  const profileData = {
    uid: user.uid,
    name: user.displayName || additionalName || "",
    email: user.email || "",
    photo: user.photoURL || "",
    authProvider: user.providerData?.[0]?.providerId || "password",
    updatedAt: serverTimestamp(),
  };

  // Set createdAt only when the profile is first created.
  if (!userSnapshot.exists()) {
    profileData.createdAt = serverTimestamp();
  }

  await setDoc(userRef, profileData, { merge: true });
};

// ========================================
// Google Authentication
// ========================================

export const signInWithGoogle = async () => {
  try {
    const result = await signInWithPopup(auth, provider);

    await saveUserProfile(result.user);

    return result.user;
  } catch (error) {
    console.error("Google sign-in error:", error);
    throw error;
  }
};

// ========================================
// Email Authentication
// ========================================

// Email Signup
export const signupWithEmail = async (email, password, name) => {
  try {
    const result = await createUserWithEmailAndPassword(
      auth,
      email,
      password
    );

    await updateProfile(result.user, {
      displayName: name,
    });

    await saveUserProfile(result.user, name);

    return result.user;
  } catch (error) {
    console.error("Email signup error:", error);
    throw error;
  }
};

// Email Login
export const loginWithEmail = async (email, password) => {
  try {
    const result = await signInWithEmailAndPassword(
      auth,
      email,
      password
    );

    await saveUserProfile(result.user);

    return result.user;
  } catch (error) {
    console.error("Email login error:", error);
    throw error;
  }
};

// ========================================
// Logout
// ========================================

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

// ========================================
// Authentication State Listener
// ========================================

export const listenToAuthChanges = (callback) => {
  return onAuthStateChanged(auth, callback);
};

// ========================================
// Default Export
// ========================================

export default auth;