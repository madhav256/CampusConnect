import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Menu, X, Bell } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { useNotifications } from "../../hooks/useNotifications";
import Avatar from "../ui/Avatar";

const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/discover", label: "Discover" },
  { to: "/connections", label: "Connections" },
  { to: "/notifications", label: "Notifications", hasBadge: true },
  { to: "/settings", label: "Settings" },
  { to: "/profile", label: "Profile" },
];

export default function Navbar() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const getLinkClasses = ({ isActive }) =>
    `inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      isActive
        ? "bg-indigo-50 text-indigo-700 font-semibold"
        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
    }`;

  const getMobileLinkClasses = ({ isActive }) =>
    `flex items-center justify-between rounded-xl px-4 py-3 text-base font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
      isActive
        ? "bg-indigo-50 text-indigo-700 font-semibold"
        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
    }`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-4 focus:z-50 focus:rounded-xl focus:bg-indigo-600 focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white focus:shadow-md focus:outline-none"
      >
        Skip to main content
      </a>

      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        {/* Brand Logo */}
        <Link
          to="/dashboard"
          className="flex items-center gap-2 rounded-lg text-xl font-bold tracking-tight text-indigo-600 transition hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
        >
          <span>CampusConnect</span>
        </Link>


        {/* Desktop Navigation Links */}
        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main Navigation"
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={getLinkClasses}
            >
              <span>{item.label}</span>
              {item.hasBadge && unreadCount > 0 && (
                <span
                  className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-1.5 py-0.5 text-xs font-semibold text-white"
                  aria-label={`${unreadCount} unread notifications`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Desktop User Avatar Indicator */}
        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            title={`Signed in as ${user?.name || user?.email || "Student"}`}
          >
            <Avatar
              name={user?.name || user?.displayName}
              photoURL={user?.photoURL}
              size="sm"
            />
          </Link>
        </div>

        {/* Mobile Hamburger & Badge Toggle */}
        <div className="flex items-center gap-2 md:hidden">
          {unreadCount > 0 && (
            <Link
              to="/notifications"
              className="relative p-2 text-slate-600 hover:text-indigo-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded-lg"
              aria-label={`${unreadCount} unread notifications`}
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-indigo-600"></span>
              </span>
            </Link>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            className="inline-flex items-center justify-center rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6" aria-hidden="true" />
            ) : (
              <Menu className="h-6 w-6" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer / Dropdown */}
      {mobileMenuOpen && (
        <div className="border-b border-slate-200 bg-white px-4 pt-2 pb-4 shadow-lg md:hidden">
          <div className="mb-3 flex items-center gap-3 border-b border-slate-100 pb-3">
            <Avatar
              name={user?.name || user?.displayName}
              photoURL={user?.photoURL}
              size="md"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-900">
                {user?.name || user?.displayName || "Student"}
              </p>
              <p className="truncate text-xs text-slate-500">{user?.email}</p>
            </div>
          </div>

          <nav className="flex flex-col gap-1" aria-label="Mobile Navigation">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setMobileMenuOpen(false)}
                className={getMobileLinkClasses}
              >
                <span>{item.label}</span>
                {item.hasBadge && unreadCount > 0 && (
                  <span className="inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>
      )}
    </header>
  );
}
