import { useCallback, useEffect, useState } from "react";
import { updateCurrentUserDisplayName } from "../services/authService";
import {
  subscribeToUserProfile,
  updateUserProfile,
} from "../services/userService";

export function useUserProfile(uid) {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) {
      return undefined;
    }

    const unsubscribe = subscribeToUserProfile(
      uid,
      (profileData) => {
        setProfile(profileData);
        setLoading(false);
      },
      (profileError) => {
        setError(profileError.message || "Unable to load your profile.");
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [uid]);

  const saveProfile = useCallback(
    async (updates) => {
      if (!uid) {
        throw new Error("You must be logged in to update your profile.");
      }

      if (updates.displayName) {
        await updateCurrentUserDisplayName(updates.displayName);
      }

      await updateUserProfile(uid, updates);
    },
    [uid],
  );

  return {
    profile,
    loading: Boolean(uid) && loading,
    error,
    saveProfile,
  };
}
