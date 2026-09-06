import { Link } from "react-router-dom";
import { Compass } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import Navbar from "../components/layout/Navbar";
import PageContainer from "../components/layout/PageContainer";
import EmptyState from "../components/ui/EmptyState";

export default function NotFound() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-paper text-ink">
      {user && <Navbar />}

      <PageContainer className="flex min-h-[70vh] items-center justify-center">
        <EmptyState
          icon={Compass}
          title="Page Not Found"
          description="The page you are looking for doesn't exist, has been removed, or is temporarily unavailable."
          action={
            <Link
              to={user ? "/dashboard" : "/"}
              className="inline-flex items-center justify-center rounded-xl bg-terracotta-600 px-5 py-2.5 text-sm font-medium text-white shadow-xs transition hover:bg-terracotta-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500 focus-visible:ring-offset-2"
            >
              {user ? "Back to Dashboard" : "Go to Sign In"}
            </Link>
          }
        />
      </PageContainer>
    </div>
  );
}
