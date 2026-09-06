import { useState } from "react";
import { useAuth } from "../hooks/useAuth";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import Feed from "../components/feed/Feed";

export default function Dashboard() {
  const { user } = useAuth();
  const [error] = useState("");

  return (
    <div className="min-h-screen bg-paper text-ink">
      <Navbar />

      <PageContainer>
        {error && (
          <p className="mb-6 rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm text-rose-700">
            {error}
          </p>
        )}

        <div className="mb-8">
          <h1 className="font-serif text-3xl font-bold tracking-tight text-ink">
            Welcome back, {user?.name?.split(" ")[0] || "Student"}!
          </h1>
          <p className="mt-1 text-ink-muted">Here&apos;s what&apos;s happening on campus today.</p>
        </div>

        <Feed />
      </PageContainer>
    </div>
  );
}

