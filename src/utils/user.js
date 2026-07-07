// Builds initials for the sidebar and profile avatar.
export function getUserInitials(user = {}) {
  return String(user.name || user.email || "U")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
