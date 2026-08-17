import { NextFunction, Request, Response } from "express";
import { config } from "../config/env";
import { sendError } from "./errors";

/** `curl -u KEY_ID:KEY_SECRET` per the Razorpay BBPS REST spec's auth convention. */
export function basicAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || "";
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) {
    res.setHeader("WWW-Authenticate", "Basic");
    sendError(res, 401, {
      code: "AUTHENTICATION_ERROR",
      description: "Authentication credentials missing or malformed",
      source: "business",
      step: "authentication",
      reason: "MISSING_BASIC_AUTH",
    });
    return;
  }

  const decoded = Buffer.from(encoded, "base64").toString("utf8");
  const separatorIdx = decoded.indexOf(":");
  const keyId = separatorIdx >= 0 ? decoded.slice(0, separatorIdx) : decoded;
  const keySecret = separatorIdx >= 0 ? decoded.slice(separatorIdx + 1) : "";

  if (keyId !== config.merchantAuth.keyId || keySecret !== config.merchantAuth.keySecret) {
    sendError(res, 401, {
      code: "AUTHENTICATION_ERROR",
      description: "Invalid API key/secret",
      source: "business",
      step: "authentication",
      reason: "INVALID_CREDENTIALS",
    });
    return;
  }

  next();
}
