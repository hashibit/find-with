import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity.js';
import { ProfileMaterial } from '../../database/entities/profile/material.entity.js';
import { LlmModule } from '../../llm/llm.module.js';
import { RecommendationController } from './recommendation.controller.js';
import { RecommendationService } from './recommendation.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([RecoRecommendation, ProfileMaterial]), LlmModule],
  controllers: [RecommendationController],
  providers: [RecommendationService],
})
export class RecommendationModule {}
