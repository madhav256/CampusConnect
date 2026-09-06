import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import Feed from "../components/feed/Feed";

export default function Dashboard() {
  const { user } = useAuth();
  const [error] = useState("");

  return (
    <div className="min-h-screen bg-slate-50">
      <Navbar />

      <PageContainer>
        {error && (
          <p className="mb-6 rounded border border-red-100 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="mb-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Welcome back, {user?.name?.split(" ")[0] || "Student"}!
          </h2>
          <p className="text-slate-500">Here&apos;s what&apos;s happening on campus today.</p>
        </div>

        <Feed />
      </PageContainer>
    </div>
  );
}

