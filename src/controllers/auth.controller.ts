import { NextFunction, Request, Response } from 'express';
import crypto from 'crypto';

import authService, { AuthResult, LoginCredentials } from '../services/auth.service.js';
import env from '../config/env.js';
import type { CreateUserPayload } from '../repositories/auth.repository.js';
import type { IUserDocument } from '../models/user.model.js';

type AuthenticatedRequest = Request & { user?: IUserDocument };

class AuthController {
  public register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const payload: CreateUserPayload = {
        email: email ?? '',
        password: password ?? ''
      };
      const authResult = await authService.register(payload);

      res.status(201).json({
        message: 'User registered successfully',
        data: this.buildAuthResponse(authResult)
      });
    } catch (error) {
      next(error);
    }
  };

  public login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      const credentials: LoginCredentials = {
        email: email ?? '',
        password: password ?? ''
      };
      const authResult = await authService.login(credentials);

      res.status(200).json({
        message: 'Login successful',
        data: this.buildAuthResponse(authResult)
      });
    } catch (error) {
      next(error);
    }
  };

  public googleRedirect = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const requestedRedirect = req.query.redirect as string | undefined;
      const safeRedirect = ensureInternalPath(requestedRedirect);

      // 🔥 THIS IS CRITICAL
      const redirectUri = req.query.redirect_uri as string | undefined;
      const gptState = req.query.state as string | undefined;

      const state = signState({
        redirectTo: safeRedirect,
        redirectUri: redirectUri || null,
        gptState: gptState || null
      });

      const authorizationUrl = authService.getGoogleAuthorizationUrl(state);

      return res.redirect(authorizationUrl);
    } catch (error) {
      next(error);
    }
  };

  public token = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { code } = req.body;

      const authResult = await authService.exchangeGoogleCode(code);

      res.status(200).json({
        access_token: authResult.token,
        token_type: 'Bearer',
        expires_in: 3600
      });

    } catch (error) {
      next(error);
    }
  };

  public googleCallback = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { code, state } = req.query;

      if (!code) {
        throw new Error("Missing Google OAuth code");
      }

      const decodedState = verifyState(state as string | undefined);
      const redirectUri = decodedState.redirectUri;

      // ============================
      // ✅ CHATGPT FLOW (REAL)
      // ============================
      if (redirectUri) {
        const separator = redirectUri.includes('?') ? '&' : '?';
        let finalUrl = `${redirectUri}${separator}code=${code}`;

        if (decodedState.gptState) {
          finalUrl += `&state=${decodedState.gptState}`;
        }

        return res.redirect(finalUrl);
      }

      // ============================
      // ✅ WEB FLOW
      // ============================
      const authResult = await authService.exchangeGoogleCode(code as string);

      const callbackUrl = new URL(env.FRONTEND_BASE_URL);
      callbackUrl.pathname = '/oauth/google/success';
      callbackUrl.searchParams.set('token', authResult.token);
      callbackUrl.searchParams.set('redirect', decodedState.redirectTo);

      return res.redirect(callbackUrl.toString());

    } catch (error) {
      next(error);
    }
  };

  public me = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const profile = await authService.getCurrentUser(user._id.toString());

      res.status(200).json({
        message: 'Authenticated user profile',
        data: { user: profile }
      });
    } catch (error) {
      next(error);
    }
  };

  public regenerateSyncKey = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const user = req.user;

      if (user == null) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const syncApiKey = await authService.regenerateSyncKey(user._id.toString());

      res.status(200).json({
        message: 'Sync API key regenerated',
        data: { syncApiKey }
      });
    } catch (error) {
      next(error);
    }
  };

  private buildAuthResponse(result: AuthResult) {
    return {
      token: result.token,
      syncApiKey: result.syncApiKey,
      user: result.user
    };
  }
}

const signState = (payload: object): string => {
  const json = JSON.stringify(payload);
  const sig = crypto.createHmac('sha256', env.JWT_SECRET).update(json).digest('hex');
  return Buffer.from(JSON.stringify({ payload: json, sig })).toString('base64url');
};

const verifyState = (state?: string) => {
  if (!state) {
    return { redirectTo: '/', mode: 'web', redirectUri: null, gptState: null };
  }

  try {
    const { payload, sig } = JSON.parse(Buffer.from(state, 'base64url').toString());

    const expected = crypto
      .createHmac('sha256', env.JWT_SECRET)
      .update(payload)
      .digest('hex');

    const sigBuffer = Buffer.from(sig);
    const expectedBuffer = Buffer.from(expected);

    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { redirectTo: '/', mode: 'web', redirectUri: null };
    }

    const parsed = JSON.parse(payload) as {
      redirectTo?: string;
      mode?: string;
      redirectUri?: string | null;
      gptState?: string | null;
    };

    return {
      redirectTo: ensureInternalPath(parsed.redirectTo),
      mode: parsed.mode === 'gpt' ? 'gpt' : 'web',
      redirectUri: parsed.redirectUri || null,
      gptState: parsed.gptState || null
    };

  } catch {
    return { redirectTo: '/', mode: 'web', redirectUri: null, gptState: null };
  }
};
const ensureInternalPath = (value?: string): string => {
  if (value == null || value.trim() === '') {
    return '/';
  }

  if (value.includes('://')) {
    return '/';
  }

  if (!value.startsWith('/')) {
    return `/${value}`;
  }

  return value;
};

export default new AuthController();
