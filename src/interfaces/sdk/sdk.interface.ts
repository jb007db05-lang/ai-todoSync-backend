export interface ISdkSession {
  sessionId: string;
  sessionSecret: string;
  tenantId: string;
  sdkKeyHash: string;
  validatedOrigin: string;
  issuedAt: Date;
  expiresAt: Date;
  revoked: boolean;
}

export interface ISdkNonce {
  nonce: string;
  expiresAt: Date;
}
