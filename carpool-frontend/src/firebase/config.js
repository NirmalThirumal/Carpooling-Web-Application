import { initializeApp } from "firebase/app";

// ========================================
// Firebase Configuration
// ========================================

const firebaseConfig = {
  apiKey: "AIzaSyBYanzNnZwrsxPZeQ48LHeumnth3a-O06g",
  authDomain: "carpool-app-e35ad.firebaseapp.com",
  projectId: "carpool-app-e35ad",
  storageBucket: "carpool-app-e35ad.firebasestorage.app",
  messagingSenderId: "36562472909",
  appId: "1:36562472909:web:cc3658a2e7ee7b7288be84",
};

// ========================================
// Initialize Firebase
// ========================================

const app = initializeApp(firebaseConfig);

export default app;