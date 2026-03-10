export function formatEmailAsName(email: string): string {
  const prefix = email.split("@")[0] ?? email
  return prefix
    .split(/[._\-+]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}
