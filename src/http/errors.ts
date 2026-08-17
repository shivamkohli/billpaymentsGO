import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { MerchantErrorPayload } from "../types/merchant";

/** Matches the standard error envelope from the Razorpay BBPS REST spec: `{error:{...}}`. */
export function sendError(res: Response, status: number, error: MerchantErrorPayload): void {
  res.status(status).json({ error });
}

export function notFoundHandler(req: Request, res: Response): void {
  sendError(res, 404, {
    code: "BAD_REQUEST_ERROR",
    description: `No such route: ${req.method} ${req.path}`,
    source: "business",
    step: "routing",
    reason: "ROUTE_NOT_FOUND",
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  const message = err instanceof Error ? err.message : String(err);

  // Bad uploads (wrong mimetype, too large) are client errors, not server errors.
  const isUploadRejection = err instanceof multer.MulterError || message.startsWith("Unsupported image type");
  if (isUploadRejection) {
    sendError(res, 400, {
      code: "BAD_REQUEST_ERROR",
      description: "Upload rejected",
      source: "business",
      step: "validation",
      reason: message,
    });
    return;
  }

  sendError(res, 500, {
    code: "SERVER_ERROR",
    description: "Something went wrong on our end",
    source: "razorpay",
    step: "unhandled",
    reason: message,
  });
}
