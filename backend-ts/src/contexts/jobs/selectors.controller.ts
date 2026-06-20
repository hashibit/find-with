import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { type Response } from 'express';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration.js';
import { Public } from '../../common/decorators/public.decorator.js';

const SELECTORS_PAYLOAD = {
  version: '1.0.0',
  etag: 'v1',
  sites: {
    'linkedin.com': {
      jobTitle: 'h1.top-card-layout__title',
      company: 'a.topcard__org-name-link',
      location: '.topcard__flavor--bullet',
      description: '#job-details',
    },
    'indeed.com': {
      jobTitle: 'h1.jobsearch-JobInfoHeader-title',
      company: "[data-testid='inlineHeader-companyName']",
      location: "[data-testid='job-location']",
      description: '#jobDescriptionText',
    },
  },
} as const;

@ApiTags('config')
@Controller('config')
export class SelectorsController {
  constructor(private config: ConfigService<AppConfig>) {}

  @Public()
  @Get('selectors')
  @ApiOperation({ summary: 'Return CSS selectors for content-script scraping (public, no auth)' })
  getSelectors(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(SELECTORS_PAYLOAD);
  }

  @Public()
  @Get('auth')
  @ApiOperation({ summary: 'Return auth configuration for clients (public, no auth)' })
  getAuthConfig(): { authMode: 'mock' | 'clerk' } {
    const jwksUrl = this.config.get('clerk', { infer: true })!.jwksUrl;
    const authMode = jwksUrl.includes('localhost') || jwksUrl.includes('14611') ? 'mock' : 'clerk';
    return { authMode };
  }
}
