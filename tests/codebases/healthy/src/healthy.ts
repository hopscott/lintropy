export type User = {
  id: string;
  name: string;
  email: string;
};

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createUser(id: string, name: string, email: string): User {
  return {
    id,
    name: name.trim(),
    email: normalizeEmail(email),
  };
}

export function formatUser(user: User): string {
  return `${user.name} <${user.email}>`;
}
