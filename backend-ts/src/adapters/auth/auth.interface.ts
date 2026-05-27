export const AUTH_VERIFIER = Symbol('AUTH_VERIFIER');

export interface VerifiedToken {
  userId: string;
  email?: string;
}

export interface AuthVerifier {
  verify(token: string): Promise<VerifiedToken>;
}
