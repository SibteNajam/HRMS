import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  message: string;
  errors?: Record<string, string[]>;
  path: string;
  timestamp: string;
}

/** Turns every thrown error into one consistent response shape. */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';
    let errors: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse();

      if (typeof payload === 'string') {
        message = payload;
      } else if (payload && typeof payload === 'object') {
        const p = payload as { message?: string | string[]; errors?: unknown };
        if (Array.isArray(p.message)) {
          // class-validator returns an array of strings
          message = p.message[0] ?? message;
          errors = { _: p.message };
        } else if (typeof p.message === 'string') {
          message = p.message;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    // Never leak an internal error message to the client.
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      message = 'Something went wrong';
    }

    const body: ErrorBody = {
      statusCode: status,
      message,
      ...(errors ? { errors } : {}),
      path: req.url,
      timestamp: new Date().toISOString(),
    };

    res.status(status).json(body);
  }
}
