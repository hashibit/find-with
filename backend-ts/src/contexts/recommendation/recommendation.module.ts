import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecoRecommendation } from '../../database/entities/recommendation/recommendation.entity';

@Module({
  imports: [TypeOrmModule.forFeature([RecoRecommendation])],
})
export class RecommendationModule {}
