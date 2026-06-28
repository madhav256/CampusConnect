import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

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
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user?.name}
      </h1>
      {error && (
        <p className="mt-4 rounded border border-red-100 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="mt-4 bg-red-500 text-white p-2 rounded disabled:cursor-not-allowed disabled:bg-red-300"
      >
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </div>
  );
}
