import { useState } from "react";
import { Search, Users } from "lucide-react";
import { useUserSearch } from "../hooks/useUserSearch";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import StudentCard from "../components/search/StudentCard";
import Card from "../components/ui/Card";
import EmptyState from "../components/ui/EmptyState";


export default function Discover() {
  const [searchTerm, setSearchTerm] = useState("");
  const { results, isLoading, error, debouncedTerm } = useUserSearch(searchTerm);

  const trimmedTerm = debouncedTerm.trim();
  const isQueryTooShort = trimmedTerm.length < 2;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">Discover Students</h1>
          <p className="mt-1 text-ink-muted">
            Find and connect with classmates across departments, academic years, and skills.
          </p>
        </div>


        {/* Search Input Box */}
        <div className="mb-8">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-stone-400">
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
              className="w-full rounded-2xl border border-border-warm bg-surface py-3.5 pl-11 pr-10 text-ink placeholder-stone-400 shadow-xs transition focus:border-terracotta-600 focus:outline-none focus:ring-2 focus:ring-terracotta-500/20"
              aria-label="Search students"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-stone-400 hover:text-ink"
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
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600">
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
            <h3 className="mt-4 text-base font-semibold text-ink">Search Error</h3>
            <p className="mt-1 text-sm text-ink-muted">{error}</p>
            <button
              type="button"
              onClick={() => setSearchTerm((prev) => prev)}
              className="mt-4 inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-terracotta-700"
            >
              Try Again
            </button>
          </Card>
        )}

        {/* State 2: Initial Empty State (< 2 characters) */}
        {!error && isQueryTooShort && !isLoading && (
          <EmptyState
            icon={Users}
            title="Find Your Classmates"
            description="Enter at least 2 characters above to search students by name, academic department, year, or skills."
          />
        )}

        {/* State 3: Loading Skeletons */}
        {isLoading && (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="animate-pulse rounded-2xl border border-border-warm bg-surface p-6 shadow-xs"
              >
                <div className="flex items-start gap-4">
                  <div className="h-12 w-12 rounded-full bg-stone-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-3/4 rounded bg-stone-200" />
                    <div className="h-3 w-1/2 rounded bg-stone-200" />
                  </div>
                </div>
                <div className="mt-6 flex gap-2">
                  <div className="h-6 w-16 rounded-full bg-stone-200" />
                  <div className="h-6 w-20 rounded-full bg-stone-200" />
                </div>
                <div className="mt-6 h-9 w-full rounded-xl bg-stone-200" />
              </div>
            ))}
          </div>
        )}

        {/* State 4: No Results Found */}
        {!error && !isLoading && !isQueryTooShort && results.length === 0 && (
          <EmptyState
            icon={Search}
            title="No students found"
            description={`We couldn't find any students matching "${trimmedTerm}". Try checking the spelling or searching by a different department, year, or skill.`}
          />
        )}

        {/* State 5: Results Grid */}
        {!error && !isLoading && !isQueryTooShort && results.length > 0 && (
          <div>
            <div className="mb-4 flex items-center justify-between text-sm text-ink-muted">
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
      </PageContainer>
    </div>
  );
}

