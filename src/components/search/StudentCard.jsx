import { Link } from "react-router-dom";
import Card from "../ui/Card";
import Avatar from "../ui/Avatar";

export default function StudentCard({ user }) {
  const visibleSkills = Array.isArray(user?.skills) ? user.skills.slice(0, 3) : [];
  const remainingSkillsCount =
    Array.isArray(user?.skills) && user.skills.length > 3
      ? user.skills.length - 3
      : 0;

  return (
    <Card className="flex flex-col justify-between transition duration-150 hover:border-stone-300 hover:shadow-sm">
      <div>
        <div className="flex items-start gap-4">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-ink">
              {user?.displayName || "CampusConnect Student"}
            </h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user?.department && (
                <span className="inline-flex items-center rounded-md bg-terracotta-50 px-2 py-0.5 text-xs font-medium text-terracotta-700 border border-terracotta-200/50">
                  {user.department}
                </span>
              )}
              {user?.year && (
                <span className="inline-flex items-center rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700 border border-border-warm/60">
                  {user.year}
                </span>
              )}
            </div>
          </div>
        </div>

        {visibleSkills.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {visibleSkills.map((skill, index) => (
              <span
                key={`${skill}-${index}`}
                className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700 border border-border-warm/60"
              >
                {skill}
              </span>
            ))}
            {remainingSkillsCount > 0 && (
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-ink-muted border border-border-warm/60">
                +{remainingSkillsCount} more
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-border-warm/60 pt-4">
        <Link
          to={`/users/${user?.uid}`}
          className="inline-flex w-full items-center justify-center rounded-xl border border-border-warm bg-surface px-4 py-2 text-sm font-medium text-ink transition hover:bg-stone-50 hover:text-terracotta-700 hover:border-stone-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-terracotta-500"
        >
          View Profile
        </Link>
      </div>
    </Card>
  );
}
