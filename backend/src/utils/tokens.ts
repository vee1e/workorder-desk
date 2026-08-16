import jwt from 'jsonwebtoken';
import { ACCESS_TOKEN_TTL_SECONDS, APP_AUD, APP_ISS, type Role } from '@workorders/shared';
import { env } from '../config/env.js';

export interface AccessTokenClaims {
  sub: string;
  role: Role;
  sid: string;
}

export interface VerifiedAccessToken {
  sub: string;
  role: Role;
  sid: string;
}

export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(
    { role: claims.role, sid: claims.sid },
    env.JWT_SECRET,
    {
      subject: claims.sub,
      issuer: APP_ISS,
      audience: APP_AUD,
      algorithm: 'HS256',
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    },
  );
}

export function verifyAccessToken(token: string): VerifiedAccessToken {
  const payload = jwt.verify(token, env.JWT_SECRET, {
    issuer: APP_ISS,
    audience: APP_AUD,
    algorithms: ['HS256'],
  }) as jwt.JwtPayload;
  return {
    sub: payload.sub as string,
    role: payload.role as Role,
    sid: payload.sid as string,
  };
}