/**
 * Milestone 18 — Unit 18.3: Client Services & Campus Context
 *
 * Client-side CampusContext and CampusProvider.
 * Provides the current authenticated user's campus identity and metadata to the application.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { CampusContext } from "./campusContextValue";
import { useAuth } from "../hooks/useAuth";
import { fetchCampusById } from "../services/campusService";
import { userDocRef } from "../services/userService";

export { CampusContext };

export function CampusProvider({ children, value, initialCampusId = null }) {
  if (value) {
    return <CampusContext.Provider value={value}>{children}</CampusContext.Provider>;
  }

  return (
    <CampusProviderInternal initialCampusId={initialCampusId}>
      {children}
    </CampusProviderInternal>
  );
}

function CampusProviderInternal({ children, initialCampusId }) {
  let authUser = null;
  let authLoading = false;

  try {
    const auth = useAuth();
    authUser = auth?.user || null;
    authLoading = Boolean(auth?.loading);
  } catch {
    // Graceful fallback when rendered outside AuthProvider (e.g. standalone tests)
  }

  const [campus, setCampus] = useState(null);
  const [campusId, setCampusId] = useState(initialCampusId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadCampusMetadata = useCallback(async (cId) => {
    if (!cId) {
      setCampus(null);
      setLoading(false);
      setError(null);
      return;
    }

    try {
      setLoading(true);
      const data = await fetchCampusById(cId);
      if (data) {
        setCampus(data);
        setError(null);
      } else {
        setCampus(null);
        setError("Campus not found.");
      }
    } catch (err) {
      setError(err?.message || "Failed to load campus.");
      setCampus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCampus = useCallback(async () => {
    if (campusId) {
      await loadCampusMetadata(campusId);
    }
  }, [campusId, loadCampusMetadata]);

  useEffect(() => {
    let isMounted = true;

    if (initialCampusId) {
      fetchCampusById(initialCampusId)
        .then((data) => {
          if (!isMounted) return;
          if (data) {
            setCampus(data);
            setError(null);
          } else {
            setCampus(null);
            setError("Campus not found.");
          }
          setLoading(false);
        })
        .catch((err) => {
          if (!isMounted) return;
          setError(err?.message || "Failed to load campus.");
          setCampus(null);
          setLoading(false);
        });
      return () => {
        isMounted = false;
      };
    }

    if (!authUser?.uid) {
      return;
    }

    const unsubscribe = onSnapshot(
      userDocRef(authUser.uid),
      async (docSnap) => {
        if (!isMounted) return;

        if (!docSnap.exists()) {
          setCampus(null);
          setCampusId(null);
          setLoading(false);
          setError(null);
          return;
        }

        const uData = docSnap.data();
        const userCampusId = uData?.campusId || null;
        setCampusId(userCampusId);

        if (userCampusId) {
          try {
            const data = await fetchCampusById(userCampusId);
            if (!isMounted) return;
            if (data) {
              setCampus(data);
              setError(null);
            } else {
              setCampus(null);
              setError("Campus not found.");
            }
          } catch (err) {
            if (!isMounted) return;
            setError(err?.message || "Failed to load campus.");
            setCampus(null);
          } finally {
            if (isMounted) setLoading(false);
          }
        } else {
          // User does not have a campus assigned (legacy or unmigrated)
          setCampus(null);
          setLoading(false);
          setError(null);
        }
      },
      (err) => {
        if (!isMounted) return;
        setError(err?.message || "Failed to load user campus profile.");
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [authUser?.uid, initialCampusId]);

  const hasActiveIdentity = Boolean(authUser?.uid || initialCampusId);
  const effectiveCampus = hasActiveIdentity ? campus : null;
  const effectiveCampusId = hasActiveIdentity ? campusId : null;
  const effectiveLoading = authLoading ? true : (hasActiveIdentity ? loading : false);
  const effectiveError = hasActiveIdentity ? error : null;

  const contextValue = useMemo(
    () => ({
      campus: effectiveCampus,
      campusId: effectiveCampusId,
      loading: effectiveLoading,
      error: effectiveError,
      refreshCampus,
    }),
    [effectiveCampus, effectiveCampusId, effectiveLoading, effectiveError, refreshCampus]
  );

  return <CampusContext.Provider value={contextValue}>{children}</CampusContext.Provider>;
}
