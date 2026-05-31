import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { type Response } from 'express';

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
  @Get('selectors')
  @ApiOperation({ summary: 'Return CSS selectors for content-script scraping (public, no auth)' })
  getSelectors(@Res() res: Response): void {
    res.setHeader('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(SELECTORS_PAYLOAD);
  }
}
