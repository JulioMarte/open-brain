import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  throw new Error("API_KEY environment variable is not set");
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export interface AuthenticatedRequest extends Request {
  userToken?: string;
  agentId?: string;
}

export function authMiddleware(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const apiKey = API_KEY as string;
  if (!timingSafeEqual(token, apiKey)) {
    res.status(401).json({ error: "Invalid API key" });
    return;
  }

  req.userToken = req.headers["x-user-token"] as string | undefined;

  next();
}