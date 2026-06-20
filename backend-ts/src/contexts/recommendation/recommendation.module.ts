import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';
import { BillingSubscription } from '../../database/entities/billing/subscription.entity.js';
import { LlmModule } from '../../llm/llm.module.js';
import { RecommendationController } from './recommendation.controller.js';
import { RecommendationService } from './recommendation.service.js';
import { RecommendationMailerService } from './recommendation-mailer.service.js';
import { MailService } from '../../common/mail/mail.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecoRecommendation, ProfileMaterial, IamUser, BillingSubscription]),
    LlmModule,
  ],
  controllers: [RecommendationController],
  providers: [RecommendationService, RecommendationMailerService, MailService],
  exports: [RecommendationService],
})
export class RecommendationModule {}
