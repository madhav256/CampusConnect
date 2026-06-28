import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Feed from "../components/feed/Feed";

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleLogout = async () => {
    setError("");
    setIsLoggingOut(true);

    try {
      await logout();
      navigate("/", { replace: true });
    } catch (logoutError) {
      setError(logoutError.message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between p-4">
          <h1 className="text-xl font-bold text-indigo-600">CampusConnect</h1>
          <div className="flex items-center gap-4">
            <Link
              to="/profile"
              className="text-sm font-medium text-slate-600 hover:text-indigo-600"
            >
              Profile
            </Link>
            <button
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="text-sm font-medium text-slate-600 hover:text-red-600 disabled:opacity-50"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-4 sm:p-6 md:p-8">
        {error && (
          <p className="mb-6 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {user?.name?.split(" ")[0] || "Student"}!
          </h2>
          <p className="text-slate-500">Here's what's happening on campus today.</p>
        </div>

        <Feed />
      </main>
    </div>
  );
}
