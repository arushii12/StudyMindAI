import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, LogOut, UserCircle } from "lucide-react";
import { getUserInitials } from "../utils/user.js";

// Renders protected navigation and keeps document-aware links up to date.
export default function Sidebar({ user, activePage, collapsed, navigationItems, getNavigationHref, onLogout, onToggle }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [, setActiveMaterialVersion] = useState(0);
  const initials = getUserInitials(user);

  // Re-renders sidebar links when a new active material is selected.
  useEffect(() => {
    const handleActiveMaterialChange = () => {
      setActiveMaterialVersion((version) => version + 1);
    };

    window.addEventListener("studymind:active-material-change", handleActiveMaterialChange);
    return () => window.removeEventListener("studymind:active-material-change", handleActiveMaterialChange);
  }, []);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="brand">
        <div className="brand-mark">
          <GraduationCap size={24} />
        </div>
        <span>StudyMind AI</span>
      </div>
      <button
        className="sidebar-toggle"
        type="button"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={onToggle}
      >
        {collapsed ? <ChevronRight size={22} /> : <ChevronLeft size={22} />}
      </button>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              className={`nav-item ${item.page === activePage ? "active" : ""}`}
              data-tooltip={item.label}
              href={getNavigationHref(item)}
              key={item.label}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </a>
          );
        })}
      </nav>

      <div className="profile-area">
        <button
          className="profile-card"
          data-tooltip={`${user.name} - ${user.email}`}
          type="button"
          onClick={() => setMenuOpen((value) => !value)}
          aria-expanded={menuOpen}
        >
          <div className="avatar">{initials}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
          </div>
        </button>
        {menuOpen && (
          <div className="profile-menu">
            <a href="#profile" onClick={() => setMenuOpen(false)}>
              <UserCircle size={17} />
              <span>Profile</span>
            </a>
            <button type="button" onClick={onLogout}>
              <LogOut size={17} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}
