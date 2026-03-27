import jwt from 'jsonwebtoken';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

import env from '../config/env.js';
import {
  CreateUserPayload,
  createUser,
  findUserByEmail,
  findUserByGoogleId,
  findUserById
} from '../repositories/auth.repository.js';
import type { IUserDocument } from '../models/user.model.js';

interface AuthProfile {
  id: string;
  email: string;
  syncApiKey: string;
  name: string | null;
  authProvider: 'local' | 'google';
}

interface AuthResult {
  token: string;
  syncApiKey: string;
  user: AuthProfile;
}

interface LoginCredentials {
  email: string;
  password: string;
}

interface GoogleProfile {
  googleId: string;
  email: string;
  name: string | null;
}

class HttpError extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, HttpError.prototype);
  }
}

class AuthService {
  private readonly googleScopes = ['openid', 'email', 'profile'];
  private readonly googleClient = new OAuth2Client(
    env.GOOGLE_CLIENT_ID,
    env.GOOGLE_CLIENT_SECRET,
    env.GOOGLE_REDIRECT_URI
  );

  public async register(payload: CreateUserPayload): Promise<AuthResult> {
    if (payload.email == null || payload.password == null) {
      throw new HttpError(400, 'Email and password are required');
    }

    const user = await createUser(payload);
    const token = this.generateToken(user._id.toString());

    return this.buildAuthResult(user, token);
  }

  public async login(credentials: LoginCredentials): Promise<AuthResult> {
    if (credentials.email == null || credentials.password == null) {
      throw new HttpError(400, 'Email and password are required');
    }

    const user = await findUserByEmail(credentials.email);

    if (user == null) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const isMatch = await user.comparePassword(credentials.password);

    if (isMatch === false) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const token = this.generateToken(user._id.toString());

    return this.buildAuthResult(user, token);
  }

  public async getCurrentUser(userId: string): Promise<AuthProfile> {
    const user = await findUserById(userId);

    if (user == null) {
      throw new HttpError(404, 'User not found');
    }

    return this.buildProfile(user);
  }

  public async regenerateSyncKey(userId: string): Promise<string> {
    const user = await findUserById(userId);

    if (user == null) {
      throw new HttpError(404, 'User not found');
    }

    const syncApiKey = user.regenerateSyncApiKey();
    await user.save();

    return syncApiKey;
  }

  public getGoogleAuthorizationUrl(state?: string): string {
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("response_type", "code");

    // 🔥 ALWAYS use YOUR backend callback (NOT ChatGPT)
    url.searchParams.set(
      "redirect_uri",
      `${env.BACKEND_URL}/api/auth/google/callback`
    );

    url.searchParams.set("scope", this.googleScopes.join(" "));
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("prompt", "consent");

    if (state) {
      url.searchParams.set("state", state);
    }

    return url.toString();
  }

  public async exchangeGoogleCode(code: string): Promise<AuthResult> {
    if (!code) {
      throw new HttpError(400, 'Google authorization code is required');
    }

    const { tokens } = await this.googleClient.getToken(code);

    if (!tokens.id_token) {
      throw new HttpError(401, 'Google ID token missing from authorization response');
    }

    return this.authenticateWithGoogle(tokens.id_token);
  }

  private async authenticateWithGoogle(idToken: string): Promise<AuthResult> {
    const googleProfile = await this.verifyGoogleIdToken(idToken);
    const user = await this.findOrCreateGoogleUser(googleProfile);
    const token = this.generateToken(user._id.toString());

    return this.buildAuthResult(user, token);
  }

  private async findOrCreateGoogleUser(profile: GoogleProfile): Promise<IUserDocument> {
    let user = await findUserByGoogleId(profile.googleId);

    if (user == null) {
      user = await findUserByEmail(profile.email);
    }

    if (user == null) {
      return createUser({
        email: profile.email,
        password: null,
        authProvider: 'google',
        googleId: profile.googleId,
        name: profile.name
      });
    }

    let hasChanges = false;

    if (user.googleId !== profile.googleId) {
      user.googleId = profile.googleId;
      hasChanges = true;
    }

    if (user.name !== profile.name) {
      user.name = profile.name;
      hasChanges = true;
    }

    if (user.email !== profile.email) {
      user.email = profile.email;
      hasChanges = true;
    }

    if (user.authProvider !== 'google') {
      user.authProvider = 'google';
      hasChanges = true;
    }

    if (hasChanges) {
      await user.save();
    }

    return user;
  }

  private buildProfile(user: IUserDocument): AuthProfile {
    return {
      id: user._id.toString(),
      email: user.email,
      syncApiKey: user.syncApiKey,
      name: user.name ?? null,
      authProvider: user.authProvider
    };
  }

  private buildAuthResult(user: IUserDocument, token: string): AuthResult {
    return {
      token,
      syncApiKey: user.syncApiKey,
      user: this.buildProfile(user)
    };
  }

  private generateToken(userId: string): string {
    const options: jwt.SignOptions = {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn']
    };

    const secret: jwt.Secret = env.JWT_SECRET;

    return jwt.sign({ userId }, secret, options);
  }

  private async verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
    const ticket = await this.googleClient.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID
    });
    const payload = ticket.getPayload();

    if (payload == null) {
      throw new HttpError(401, 'Unable to validate Google credential');
    }

    return this.buildGoogleProfile(payload);
  }

  private buildGoogleProfile(payload: TokenPayload): GoogleProfile {
    if (!payload.sub || !payload.email || payload.email_verified !== true) {
      throw new HttpError(401, 'Google account email could not be verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? null
    };
  }
}

const authService = new AuthService();
export type { AuthProfile, AuthResult, LoginCredentials, HttpError };
export default authService;
