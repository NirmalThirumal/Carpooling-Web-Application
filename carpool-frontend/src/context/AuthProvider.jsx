import { useEffect, useState } from "react";

import {
  listenToAuthChanges,
  saveUserProfile,
} from "../firebase/auth";

import { AuthContext } from "./AuthContext";

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToAuthChanges(async (firebaseUser) => {
      setUser(firebaseUser);

      if (firebaseUser) {
        try {
          await saveUserProfile(firebaseUser);
        } catch (error) {
          console.error(
            "Unable to synchronize user profile:",
            error
          );
        }
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
};