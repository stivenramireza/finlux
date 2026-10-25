import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Category } from './entities/category.entity.js';
import { CreateCategoryDto } from './dto/create-category.dto.js';
import { UpdateCategoryDto } from './dto/update-category.dto.js';

/**
 * Category access with the global-vs-user rule:
 * - reads return the union of the caller's own categories and the global seed
 *   categories (`user_id = :userId OR user_id IS NULL`);
 * - writes only ever target the caller's own rows (global seeds, `user_id`
 *   NULL, are never mutated or deleted here).
 */
@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categories: Repository<Category>,
  ) {}

  create(userId: string, dto: CreateCategoryDto): Promise<Category> {
    const category = this.categories.create({
      userId,
      name: dto.name,
      kind: dto.kind ?? null,
      icon: dto.icon ?? null,
    });
    return this.categories.save(category);
  }

  /** User-owned categories plus global seeds. */
  findAllForUser(userId: string): Promise<Category[]> {
    return this.categories.find({
      where: [{ userId }, { userId: IsNull() }],
      order: { name: 'ASC' },
    });
  }

  /**
   * Returns a category the user is allowed to see: either their own or a global
   * seed. Does not expose another user's categories.
   */
  findOne(userId: string, categoryId: string): Promise<Category | null> {
    return this.categories.findOne({
      where: [
        { id: categoryId, userId },
        { id: categoryId, userId: IsNull() },
      ],
    });
  }

  async findOneOrFail(userId: string, categoryId: string): Promise<Category> {
    const category = await this.findOne(userId, categoryId);
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  /** Writes only the caller's own row (global seeds cannot be updated). */
  async update(
    userId: string,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<Category> {
    const category = await this.findOwnedOrFail(userId, categoryId);
    if (dto.name !== undefined) {
      category.name = dto.name;
    }
    if (dto.kind !== undefined) {
      category.kind = dto.kind;
    }
    if (dto.icon !== undefined) {
      category.icon = dto.icon;
    }
    return this.categories.save(category);
  }

  /** Removes only the caller's own row (global seeds cannot be deleted). */
  async remove(userId: string, categoryId: string): Promise<void> {
    const category = await this.findOwnedOrFail(userId, categoryId);
    await this.categories.remove(category);
  }

  /**
   * Finds a row owned by the caller (never a global seed, never another user's
   * row). Used by write paths so global/other rows cannot be mutated.
   */
  private async findOwnedOrFail(
    userId: string,
    categoryId: string,
  ): Promise<Category> {
    const category = await this.categories.findOne({
      where: { id: categoryId, userId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }
}
