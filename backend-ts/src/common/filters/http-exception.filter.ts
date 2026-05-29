import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * RFC 7807 problem+json format for all HTTP errors.
 * Content-Type: application/problem+json
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let detail: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      title = exception.message;
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, unknown>;
        detail = Array.isArray(resObj['message'])
          ? (resObj['message'] as string[]).join('; ')
          : (resObj['message'] as string | undefined);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://findwith.app/errors/${status}`,
        title,
        status,
        detail,
        instance: request.url,
      });
  }
}
