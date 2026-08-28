import crypto from 'crypto';

/**
 * Generates a random alphanumeric password
 * @param length Length of the password
 * @returns Random string
 */
export const generateRandomPassword = (length: number = 10): string => {
  return crypto.randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length);
};

/**
 * Generates a standard username based on role and name
 * @param role User role
 * @param firstName First name
 * @param lastName Last name
 * @returns Formatted username
 */
export const generateUsername = (role: string, firstName: string, lastName: string = ''): string => {
  const cleanName = `${firstName}${lastName}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const suffix = Math.floor(1000 + Math.random() * 9000);
  return `${role.slice(0, 3)}_${cleanName}_${suffix}`;
};
