import { Controller, Get, Patch, Param, Query, Body, UseGuards, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike } from 'typeorm';
import { AdminGuard } from '../admin.guard.js';
import { IamUser } from '../../database/entities/iam/iam-user.entity.js';

@Controller('admin/ops/users')
@UseGuards(AdminGuard)
export class UsersAdminController {
  constructor(
    @InjectRepository(IamUser)
    private readonly repo: Repository<IamUser>,
  ) {}

  @Get()
  async list(
    @Query('page') page = '1',
    @Query('limit') limit = '20',
    @Query('q') q?: string,
  ) {
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
    const where = q
      ? [{ email: ILike(`%${q}%`) }, { fullName: ILike(`%${q}%`) }, { clerkUserId: ILike(`%${q}%`) }]
      : {};
    const [data, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      take,
      skip,
    });
    return { data, total, page: Number(page), limit: take };
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException();
    return user;
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { isActive?: boolean },
  ) {
    const user = await this.repo.findOneBy({ id });
    if (!user) throw new NotFoundException();
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') throw new BadRequestException('isActive must be boolean');
      user.isActive = body.isActive;
      await this.repo.save(user);
    }
    return user;
  }
}
