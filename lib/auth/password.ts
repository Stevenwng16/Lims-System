// Password-policy validation (US-A1 AC 4 / US-A7 — requireComplexity wired
// 17 Jul 2026). The stories configure "complexity (mixed character classes)"
// without a precise rule, so the rule is: at least 3 of the 4 classes
// (lower, upper, digit, special) on top of the configured minimum length
// (decision logged 17 Jul 2026). Pure and shared by every path that sets a
// password, so mock and real backend enforce identically.

export type PasswordPolicy = { minPasswordLength: number; requireComplexity: boolean };

export function passwordPolicyError(password: string, policy: PasswordPolicy): string | null {
  if (password.length < policy.minPasswordLength) {
    return `Password must be at least ${policy.minPasswordLength} characters.`;
  }
  if (policy.requireComplexity) {
    const classes =
      Number(/[a-z]/.test(password)) +
      Number(/[A-Z]/.test(password)) +
      Number(/\d/.test(password)) +
      Number(/[^A-Za-z0-9]/.test(password));
    if (classes < 3) {
      return "Password must mix at least 3 of: lowercase, uppercase, digits, special characters.";
    }
  }
  return null;
}
