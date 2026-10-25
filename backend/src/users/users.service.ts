import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';

/**
 * Identity-anchor service. The `User` scopes all financial data, so its own
 * lookups are by identity (id / email) rather than by an owning user.
 */
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  create(dto: CreateUserDto): Promise<User> {
    const user = this.users.create({
      email: dto.email,
      displayName: dto.displayName ?? null,
      password: dto.password,
    });
    return this.users.save(user);
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  /**
   * Loads a user by email WITH the `password` column explicitly selected
   * (`password` is `select: false` on the entity). Used only by the auth login
   * flow to verify credentials; callers must never return the hash.
   */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email },
      select: {
        id: true,
        email: true,
        displayName: true,
        password: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    const user = await this.findByIdOrFail(id);
    if (dto.displayName !== undefined) {
      user.displayName = dto.displayName;
    }
    return this.users.save(user);
  }
}
