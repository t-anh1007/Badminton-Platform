import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 10;

/** BR-ACC-04: tối thiểu 8 ký tự, có ít nhất một chữ và một số. */
export function isPasswordPolicyValid(password: string): boolean {
  if (password.length < 8) return false;
  if (!/[a-zA-Z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  return true;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}
