
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

const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"
).replace(/\/+$/, "");

// Save or synchronize user profile in MongoDB.
export const saveUserProfile = async (user, additionalName = "") => {
  if (!user) return;

  const token = await user.getIdToken();

  const profileData = {
    name: user.displayName || additionalName || "",
    photo: user.photoURL || "",
    authProvider:
      user.providerData?.[0]?.providerId || "password",
  };

  const response = await fetch(
    `${API_BASE_URL}/api/auth/profile`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(profileData),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.success) {
    throw new Error(data.error || "Unable to save user profile");
  }

  return data.user;
};

// Google Authentication
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

// Logout
export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Logout error:", error);
    throw error;
  }
};

// Authentication State Listener
export const listenToAuthChanges = (callback) => {
  return onAuthStateChanged(auth, callback);
};

export default auth;
