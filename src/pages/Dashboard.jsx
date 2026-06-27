import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Dashboard() {
  const { user, logout } = useContext(AuthContext);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">
        Welcome, {user?.name}
      </h1>

      <button
        onClick={logout}
        className="mt-4 bg-red-500 text-white p-2 rounded"
      >
        Logout
      </button>
    </div>
  );
}