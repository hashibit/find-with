import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.module.js';
import { AgentService } from '../../agent/agent.service.js';
import { type AppConfig } from '../../config/configuration.js';
import { MEMORY_QUEUE } from '../../contexts/memory/memory.constants.js';
import { RESUME_PARSE_QUEUE } from '../../contexts/profile/profile.service.js';
import { JOB_ANALYZE_QUEUE } from '../../contexts/jobs/jobs.service.js';
import { TAILORING_QUEUE } from '../../contexts/tailoring/tailoring.service.js';

type HealthStatus = 'ok' | 'degraded' | 'down';

interface ServiceHealth {
  status: HealthStatus;
  latencyMs?: number;
  error?: string;
}

interface HealthReport {
  status: HealthStatus;
  timestamp: string;
  services: {
    redis: ServiceHealth;
    postgres: ServiceHealth;
    s3: ServiceHealth;
    llm: {
      status: HealthStatus;
      activeProvider: string;
      fallbackProvider: string;
      errorCount: number;
      inFailover: boolean;
    };
    queues: Record<string, { active: number; waiting: number; failed: number }>;
  };
}

@Injectable()
export class HealthService {
  private readonly s3: S3Client;
  private readonly s3Bucket: string;

  constructor(
    private readonly redisService: RedisService,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly agentService: AgentService,
    private readonly configService: ConfigService<AppConfig>,
    @InjectQueue(MEMORY_QUEUE) private readonly memoryQueue: Queue,
    @InjectQueue(RESUME_PARSE_QUEUE) private readonly resumeParseQueue: Queue,
    @InjectQueue(JOB_ANALYZE_QUEUE) private readonly jobAnalyzeQueue: Queue,
    @InjectQueue(TAILORING_QUEUE) private readonly tailoringQueue: Queue,
  ) {
    const s3Config = this.configService.get('s3', { infer: true })!;
    this.s3Bucket = s3Config.bucket;
    this.s3 = new S3Client({
      region: s3Config.region,
      credentials: {
        accessKeyId: s3Config.accessKeyId,
        secretAccessKey: s3Config.secretAccessKey,
      },
      ...(s3Config.endpoint ? { endpoint: s3Config.endpoint, forcePathStyle: true } : {}),
    });
  }

  async getHealth(): Promise<HealthReport> {
    const [redis, postgres, s3, queueStats] = await Promise.allSettled([
      this.checkRedis(),
      this.checkPostgres(),
      this.checkS3(),
      this.checkQueues(),
    ]);

    const llmState = this.agentService.getProviderState();

    const redisResult = redis.status === 'fulfilled' ? redis.value : { status: 'down' as const, error: String((redis as PromiseRejectedResult).reason) };
    const postgresResult = postgres.status === 'fulfilled' ? postgres.value : { status: 'down' as const, error: String((postgres as PromiseRejectedResult).reason) };
    const s3Result = s3.status === 'fulfilled' ? s3.value : { status: 'down' as const, error: String((s3 as PromiseRejectedResult).reason) };
    const queues = queueStats.status === 'fulfilled' ? queueStats.value : {};

    const statuses = [redisResult.status, postgresResult.status, s3Result.status];
    const overallStatus: HealthStatus =
      statuses.includes('down') ? 'down' :
      statuses.includes('degraded') || llmState.inFailover ? 'degraded' : 'ok';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      services: {
        redis: redisResult,
        postgres: postgresResult,
        s3: s3Result,
        llm: {
          status: llmState.inFailover ? 'degraded' : 'ok',
          ...llmState,
        },
        queues,
      },
    };
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.redisService.client.ping();
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: String(err) };
    }
  }

  private async checkPostgres(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.dataSource.query('SELECT 1');
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'down', error: String(err) };
    }
  }

  private async checkS3(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.s3Bucket }));
      return { status: 'ok', latencyMs: Date.now() - start };
    } catch (err) {
      return { status: 'degraded', error: String(err) };
    }
  }

  private async checkQueues(): Promise<Record<string, { active: number; waiting: number; failed: number }>> {
    const queues: Array<[string, Queue]> = [
      [MEMORY_QUEUE, this.memoryQueue],
      [RESUME_PARSE_QUEUE, this.resumeParseQueue],
      [JOB_ANALYZE_QUEUE, this.jobAnalyzeQueue],
      [TAILORING_QUEUE, this.tailoringQueue],
    ];

    const results: Record<string, { active: number; waiting: number; failed: number }> = {};
    await Promise.all(
      queues.map(async ([name, queue]) => {
        try {
          const counts = await queue.getJobCounts('active', 'waiting', 'failed');
          results[name] = {
            active: counts.active ?? 0,
            waiting: counts.waiting ?? 0,
            failed: counts.failed ?? 0,
          };
        } catch {
          results[name] = { active: -1, waiting: -1, failed: -1 };
        }
      }),
    );
    return results;
  }
}
