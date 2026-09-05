import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./useAuth";
import {
  subscribeToUserProfile,
  updateUserSettings,
} from "../services/userService";

/**
 * Hook for managing user settings (account, privacy, and notifications).
 * Follows a reliable save -> Firestore write -> success/error state pattern (no optimistic drift).
 */
export function useSettings() {
  const { user } = useAuth();
  const currentUid = user?.uid;

  const [profile, setProfile] = useState(null);
  const [isSubscribing, setIsSubscribing] = useState(Boolean(currentUid));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    if (!currentUid) {
      return;
    }

    const unsubscribe = subscribeToUserProfile(
      currentUid,
      (profileData) => {
        setProfile(profileData);
        setIsSubscribing(false);
      },
      (err) => {
        console.error("useSettings subscribe error:", err);
        setError("Failed to load settings.");
        setIsSubscribing(false);
      }
    );

    return () => unsubscribe();
  }, [currentUid]);

  const isLoading = Boolean(currentUid) && isSubscribing;

  const settings = {
    email: user?.email || profile?.email || "",
    isDiscoverable: profile?.isDiscoverable !== false,
    notificationPreferences: {
      connectionRequests:
        profile?.notificationPreferences?.connectionRequests !== false,
      connectionAccepted:
        profile?.notificationPreferences?.connectionAccepted !== false,
    },
  };

  const updatePrivacy = useCallback(
    async (isDiscoverable) => {
      if (!currentUid) return;
      setIsSaving(true);
      setError(null);
      setFeedback("");

      try {
        await updateUserSettings(currentUid, { isDiscoverable });
        setFeedback("Privacy setting updated successfully.");
      } catch (err) {
        console.error("Failed to update privacy settings:", err);
        setError(err.message || "Failed to update privacy setting.");
      } finally {
        setIsSaving(false);
      }
    },
    [currentUid]
  );

  const updateNotificationPreference = useCallback(
    async (key, value) => {
      if (!currentUid) return;
      setIsSaving(true);
      setError(null);
      setFeedback("");

      try {
        const currentPrefs = settings.notificationPreferences;
        const newPrefs = {
          ...currentPrefs,
          [key]: value,
        };
        await updateUserSettings(currentUid, {
          notificationPreferences: newPrefs,
        });
        setFeedback("Notification preferences updated.");
      } catch (err) {
        console.error("Failed to update notification preferences:", err);
        setError(err.message || "Failed to update notification preference.");
      } finally {
        setIsSaving(false);
      }
    },
    [currentUid, settings.notificationPreferences]
  );

  return {
    settings,
    isLoading,
    isSaving,
    error,
    feedback,
    updatePrivacy,
    updateNotificationPreference,
  };
}
