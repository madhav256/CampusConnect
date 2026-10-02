/**
 * Milestone 18 — Unit 18.3: Client Services & Campus Context
 *
 * Hook to access current campus context.
 */

import { useContext } from "react";
import { CampusContext } from "../contexts/campusContextValue";

export function useCampus() {
  const context = useContext(CampusContext);

  if (!context) {
    throw new Error("useCampus must be used within a CampusProvider.");
  }

  return context;
}

export function useOptionalCampus() {
  return useContext(CampusContext) || null;
}

