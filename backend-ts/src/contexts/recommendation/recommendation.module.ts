import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([RecoRecommendation])],
})
export class RecommendationModule {}
