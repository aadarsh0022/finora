import { expect, it } from 'vitest';
import { minorSchema, registerSchema } from '../src/index';

it('accepts only canonical bounded integer money values', () => {
  for (const input of ['0', '1', '-10', '900719925474099301'])
    expect(minorSchema.safeParse(input).success).toBe(true);
  for (const input of ['-0', '01', '1.1', '1e2', '', '1'.repeat(31)])
    expect(minorSchema.safeParse(input).success).toBe(false);
});
it('rejects unsafe input shapes and supplies explicit user preferences', () => {
  const input = {
    email: 'hello@example.com',
    password: 'a sufficiently long password',
    name: 'Hello',
  };
  expect(registerSchema.parse(input).preferences.timezone).toBe('Asia/Kolkata');
  expect(registerSchema.safeParse({ ...input, email: { $ne: null } }).success).toBe(false);
  expect(registerSchema.safeParse({ ...input, role: 'admin' }).success).toBe(false);
});
