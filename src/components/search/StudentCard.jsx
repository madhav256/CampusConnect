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
    <Card className="flex flex-col justify-between transition duration-150 hover:border-indigo-200 hover:shadow-md">
      <div>
        <div className="flex items-start gap-4">
          <Avatar name={user?.displayName} photoURL={user?.photoURL} size="md" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-950">
              {user?.displayName || "CampusConnect Student"}
            </h3>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {user?.department && (
                <span className="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {user.department}
                </span>
              )}
              {user?.year && (
                <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
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
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                {skill}
              </span>
            ))}
            {remainingSkillsCount > 0 && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                +{remainingSkillsCount} more
              </span>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 border-t border-slate-100 pt-4">
        <Link
          to={`/users/${user?.uid}`}
          className="inline-flex w-full items-center justify-center rounded-xl bg-slate-50 px-4 py-2 text-sm font-medium text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          View Profile
        </Link>
      </div>
    </Card>
  );
}
