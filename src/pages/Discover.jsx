import { useState } from "react";
import { Link } from "react-router-dom";
import { useUserSearch } from "../hooks/useUserSearch";
import { useNotifications } from "../hooks/useNotifications";
import StudentCard from "../components/search/StudentCard";
import Card from "../components/ui/Card";

export default function Discover() {
  const [searchTerm, setSearchTerm] = useState("");
  const { results, isLoading, error, debouncedTerm } = useUserSearch(searchTerm);
  const { unreadCount } = useNotifications();

  const trimmedTerm = debouncedTerm.trim();
  const isQueryTooShort = trimmedTerm.length < 2;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <Link to="/dashboard" className="text-xl font-bold text-indigo-600">
            CampusConnect
          </Link>
          <nav className="flex items-center gap-4">
            <Link
              to="/dashboard"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Dashboard
            </Link>
            <Link
              to="/discover"
              className="text-sm font-semibold text-indigo-600"
            >
              Discover
            </Link>
            <Link
              to="/connections"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Connections
            </Link>
            <Link
              to="/notifications"
              className="relative text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Notifications
              {unreadCount > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                  {unreadCount}
                </span>
              )}
            </Link>
            <Link
              to="/profile"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Profile
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-950">Discover Students</h1>
          <p className="mt-1 text-slate-500">
            Find and connect with classmates across departments, academic years, and skills.
          </p>
        </div>

        {/* Search Input Box */}
        <div className="mb-8">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name, department, year, or skill (e.g., Computer Science, React, Senior)..."
              className="w-full rounded-2xl border border-slate-200 bg-white py-3.5 pl-11 pr-10 text-slate-900 placeholder-slate-400 shadow-sm transition focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              aria-label="Search students"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* State 1: Error State */}
        {error && (
          <Card className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-950">Search Error</h3>
            <p className="mt-1 text-sm text-slate-500">{error}</p>
            <button
              type="button"
              onClick={() => setSearchTerm((prev) => prev)}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
            >
              Try Again
            </button>
          </Card>
        )}

        {/* State 2: Initial Empty State (< 2 characters) */}
        {!error && isQueryTooShort && !isLoading && (
          <Card className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-950">Find Your Classmates</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              Enter at least 2 characters above to search students by name, academic department, year, or skills.
            </p>
          </Card>
        )}

        {/* State 3: Loading Skeletons */}
        {isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-slate-200" />
                    <div className="h-3 w-1/2 rounded bg-slate-200" />
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <div className="h-6 w-16 rounded-full bg-slate-200" />
                  <div className="h-6 w-20 rounded-full bg-slate-200" />
                </div>
                <div className="mt-6 h-9 w-full rounded-xl bg-slate-200" />
              </div>
            ))}
          </div>
        )}

        {/* State 4: No Results Found */}
        {!error && !isLoading && !isQueryTooShort && results.length === 0 && (
          <Card className="py-12 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <svg
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="mt-4 text-lg font-semibold text-slate-950">No students found</h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">
              We couldn&apos;t find any students matching &ldquo;{trimmedTerm}&rdquo;. Try checking the spelling or searching by a different department, year, or skill.
            </p>
          </Card>
        )}

        {/* State 5: Results Grid */}
        {!error && !isLoading && !isQueryTooShort && results.length > 0 && (
          <div>
            <div className="mb-4 flex items-center justify-between text-sm text-slate-500">
              <span>
                Found {results.length} {results.length === 1 ? "student" : "students"}
              </span>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {results.map((student) => (
                <StudentCard key={student.uid} user={student} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
