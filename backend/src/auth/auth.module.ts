import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { SessionModule } from '../session/session.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { HashingService } from './hashing/hashing.service.js';
import { JwtStrategy } from './strategies/jwt.strategy.js';

/**
 * Wires authentication: email/password register + login, JWT issuance signed
 * with `JWT_SECRET` (1h lifetime), and the passport-jwt strategy used by
 * `JwtAuthGuard`. Config is read via `ConfigService` by key name only.
 */
@Module({
  imports: [
    UsersModule,
    SessionModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret) {
          throw new Error(
            'JWT_SECRET is not set. Define it in backend/.env (see .env.example).',
          );
        }
        return {
          secret,
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ?? '1h') as
              `${number}h` | `${number}m` | `${number}s`,
          },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, HashingService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
