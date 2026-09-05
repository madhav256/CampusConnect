import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthContext } from "./authContextValue";
import {
  configureAuthPersistence,
  getAuthErrorMessage,
  loginWithEmail,
  logoutUser,
  sendPasswordReset,
  signUpWithEmail,
  subscribeToAuthChanges,
  toAuthUser,
} from "../services/authService";
import { createUserProfile } from "../services/userService";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    async function initializeAuth() {
      try {
        await configureAuthPersistence();
        unsubscribe = subscribeToAuthChanges((firebaseUser) => {
          if (isMounted) {
            const authUser = toAuthUser(firebaseUser);
            setUser(authUser);
            setLoading(false);
            if (authUser) {
              createUserProfile({
                uid: authUser.uid,
                displayName: authUser.name,
                email: authUser.email,
                photoURL: authUser.photoURL,
              }).catch(() => {});
            }
          }
        });
      } catch (error) {
        if (isMounted) {
          setAuthError(getAuthErrorMessage(error));
          setLoading(false);
        }
      }
    }

    initializeAuth();

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const login = useCallback(async (credentials) => {
    setAuthError("");

    try {
      const loggedInUser = await loginWithEmail(credentials);
      setUser(loggedInUser);
      return loggedInUser;
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  const signup = useCallback(async (credentials) => {
    setAuthError("");

    try {
      const createdUser = await signUpWithEmail(credentials);
      await createUserProfile({
        uid: createdUser.uid,
        displayName: createdUser.name,
        email: createdUser.email,
        photoURL: createdUser.photoURL,
      });
      setUser(createdUser);
      return createdUser;
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  const logout = useCallback(async () => {
    setAuthError("");

    try {
      await logoutUser();
      setUser(null);
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  const resetPassword = useCallback(async (email) => {
    setAuthError("");

    try {
      await sendPasswordReset(email);
    } catch (error) {
      const message = getAuthErrorMessage(error);
      setAuthError(message);
      throw new Error(message, { cause: error });
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      authError,
      login,
      signup,
      logout,
      resetPassword,
    }),
    [authError, loading, login, logout, resetPassword, signup, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
