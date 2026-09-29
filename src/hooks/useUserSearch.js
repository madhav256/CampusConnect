import { useState, useEffect, useCallback } from "react";
import { fetchAllUsers } from "../services/userService";

export function useUserSearch(searchTerm = "") {
  const [debouncedTerm, setDebouncedTerm] = useState(searchTerm);
  const [retryTrigger, setRetryTrigger] = useState(0);
  const [searchResults, setSearchResults] = useState({
    term: "",
    users: [],
    loading: false,
    error: null,
  });

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedTerm(searchTerm);
    }, 300);

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const trimmed = debouncedTerm.trim();
  const isQueryValid = trimmed.length >= 2;

  const retry = useCallback(() => {
    setSearchResults({
      term: "",
      users: [],
      loading: true,
      error: null,
    });
    setRetryTrigger((prev) => prev + 1);
  }, []);

  useEffect(() => {
    if (!isQueryValid) {
      return;
    }

    let isMounted = true;

    fetchAllUsers(100)
      .then((allUsers) => {
        if (!isMounted) return;

        const term = trimmed.toLowerCase();
        const matched = allUsers
          .filter((user) => {
            const nameMatch = user.displayName?.toLowerCase().includes(term);
            const deptMatch = user.department?.toLowerCase().includes(term);
            const yearMatch = user.year?.toLowerCase().includes(term);
            const skillsMatch =
              Array.isArray(user.skills) &&
              user.skills.some((skill) => skill.toLowerCase().includes(term));

            return Boolean(nameMatch || deptMatch || yearMatch || skillsMatch);
          });

        setSearchResults({
          term: trimmed,
          users: matched,
          loading: false,
          error: null,
        });
      })
      .catch((err) => {
        if (!isMounted) return;
        setSearchResults({
          term: trimmed,
          users: [],
          loading: false,
          error: err.message || "Failed to search students. Please try again.",
        });
      });

    return () => {
      isMounted = false;
    };
  }, [trimmed, isQueryValid, retryTrigger]);

  const isCurrentTerm = searchResults.term === trimmed;
  const results = isQueryValid && isCurrentTerm ? searchResults.users : [];
  const isLoading = isQueryValid && (!isCurrentTerm || searchResults.loading);
  const error = isQueryValid && isCurrentTerm ? searchResults.error : null;

  return { results, isLoading, error, debouncedTerm, retry };
}
