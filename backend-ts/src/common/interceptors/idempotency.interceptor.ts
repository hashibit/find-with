import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyKey } from '../../database/entities/idempotency/idempotency-key.entity';
import { AuthenticatedUser } from '../decorators/current-user.decorator';
import { ulid } from 'ulid';

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly repo: Repository<IdempotencyKey>,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const key = request.headers['idempotency-key'] as string | undefined;

    if (!key || !['POST', 'PATCH', 'PUT'].includes(request.method)) {
      return next.handle();
    }

    const userId = request.user?.userId;
    if (!userId) return next.handle();

    const existing = await this.repo.findOne({ where: { key } });
    if (existing) {
      response.status(existing.statusCode).json(existing.responseBody);
      return new Observable((subscriber) => subscriber.complete());
    }

    return next.handle().pipe(
      tap((responseBody) => {
        const record = this.repo.create({
          id: ulid(),
          userId,
          key,
          statusCode: response.statusCode,
          responseBody,
          expiresAt: new Date(Date.now() + TTL_MS),
        });
        void this.repo.save(record);
      }),
    );
  }
}
