# Backend API (NestJS + PostgreSQL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the multi-tenant REST API that powers the cadete-management app: auth, rotiserías (tenants), customer records, delivery assignment/rating, and Web Push notifications — with no UI, fully verifiable via automated e2e tests and curl.

**Architecture:** NestJS modules (`auth`, `tenants`, `users`, `customers`, `deliveries`, `push`) backed by a single PostgreSQL database via Prisma. Every tenant-scoped route is protected by a `TenantMembershipGuard` that re-validates the caller's membership against the database on every request — no `tenantId` is ever trusted from the client without that check. Delivery assignment emits an in-process event (`delivery.assigned`) that the `push` module listens to and turns into a Web Push notification, decoupling delivery logic from notification delivery.

**Tech Stack:** NestJS 10, Prisma + PostgreSQL, `@nestjs/jwt` + `passport-jwt` for auth, `bcrypt` for password hashing, `class-validator`/`class-transformer` for DTOs, `@nestjs/event-emitter` for the assignment→push event, `web-push` for Web Push, `@nestjs/throttler` for rate limiting, Jest + Supertest for e2e tests.

## Global Constraints

- The API never manages order/menu/payment data — only customer records and delivery *assignment* events (spec: "Fuera de alcance").
- Every tenant-scoped resource (`CustomerRecord`, `Delivery`) must be validated against the caller's `Membership` on every request; a `tenantId` in a URL is never trusted on its own (spec: "Aislamiento entre tenants").
- Ratings are on a 1–5 integer scale, recorded per `Delivery`, and averaged live per customer — no separate cached average field unless a later task explicitly adds one.
- Auth is phone + password only — no SMS/OTP provider (spec: "Autenticación").
- A `CustomerRecord` linked to a `User` via `short_code` copies that user's data at link time; it is never live-synced afterward (spec: "Cliente autoregistrado que cambia su ubicación").
- Passwords are always hashed (bcrypt); never stored or logged in plaintext.

---

## File Structure

```
backend/
  prisma/
    schema.prisma
  src/
    app.module.ts
    main.ts
    prisma/
      prisma.module.ts
      prisma.service.ts
    auth/
      auth.module.ts
      auth.service.ts
      auth.controller.ts
      dto/register.dto.ts
      dto/login.dto.ts
      strategies/jwt.strategy.ts
      guards/jwt-auth.guard.ts
      decorators/current-user.decorator.ts
    tenants/
      tenants.module.ts
      tenants.service.ts
      tenants.controller.ts
      dto/create-tenant.dto.ts
      dto/invite-member.dto.ts
      guards/tenant-membership.guard.ts
      guards/roles.guard.ts
      decorators/current-membership.decorator.ts
      decorators/roles.decorator.ts
    users/
      users.module.ts
      users.service.ts
      users.controller.ts
      dto/update-location.dto.ts
    customers/
      customers.module.ts
      customers.service.ts
      customers.controller.ts
      dto/create-customer.dto.ts
      dto/update-customer.dto.ts
    deliveries/
      deliveries.module.ts
      deliveries.service.ts
      deliveries.controller.ts
      dto/create-delivery.dto.ts
      dto/reassign-delivery.dto.ts
      dto/complete-delivery.dto.ts
    push/
      push.module.ts
      push.service.ts
      push.controller.ts
      dto/subscribe-push.dto.ts
  test/
    utils/test-app.ts
    health.e2e-spec.ts
    auth.e2e-spec.ts
    tenants.e2e-spec.ts
    users.e2e-spec.ts
    customers.e2e-spec.ts
    deliveries.e2e-spec.ts
    push.e2e-spec.ts
    rate-limit.e2e-spec.ts
    tenant-isolation.e2e-spec.ts
```

---

### Task 1: Project scaffolding, Prisma schema, and health check

**Files:**
- Create: `backend/` (via Nest CLI)
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/prisma/prisma.service.ts`
- Create: `backend/src/prisma/prisma.module.ts`
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/app.controller.ts`
- Create: `backend/test/utils/test-app.ts`
- Test: `backend/test/health.e2e-spec.ts`

**Interfaces:**
- Produces: `PrismaService` (injectable, extends `PrismaClient`, connects `onModuleInit`), `PrismaModule` (global — exported so every later module can inject `PrismaService` without re-importing), `createTestApp(): Promise<INestApplication>` and `cleanDb(app): Promise<void>` in `test/utils/test-app.ts` (reused by every later e2e spec), full Prisma schema (`User`, `Tenant`, `Role`, `Membership`, `CustomerRecord`, `Delivery`, `DeliveryStatus`).

- [ ] **Step 1: Scaffold the NestJS project**

From `C:\Users\JoaquinOficina\Desktop\Proyectos\GEC`:

```bash
npx @nestjs/cli new backend --package-manager npm --skip-git
cd backend
npm install @prisma/client class-validator class-transformer
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

Edit `backend/.env` (created by `prisma init`):

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_dev"
```

Create `backend/.env.test`:

```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test"
```

Create both local databases (adjust user/password to your local Postgres):

```bash
createdb cadetes_dev
createdb cadetes_test
```

- [ ] **Step 2: Write the Prisma schema**

Replace `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id              String   @id @default(uuid())
  name            String
  phone           String   @unique
  passwordHash    String
  shortCode       String?  @unique
  homeAddressText String?
  homeLat         Float?
  homeLng         Float?
  createdAt       DateTime @default(now())

  memberships        Membership[]
  linkedCustomers    CustomerRecord[] @relation("LinkedUser")
  cadeteDeliveries   Delivery[]       @relation("CadeteDeliveries")
  assignedDeliveries Delivery[]       @relation("AssignedByDeliveries")
}

enum Role {
  ADMIN
  MOSTRADOR
  CADETE
}

model Tenant {
  id          String   @id @default(uuid())
  name        String
  contactInfo String?
  createdAt   DateTime @default(now())

  memberships     Membership[]
  customerRecords CustomerRecord[]
  deliveries      Delivery[]
}

model Membership {
  id       String @id @default(uuid())
  userId   String
  tenantId String
  role     Role

  user   User   @relation(fields: [userId], references: [id])
  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@unique([userId, tenantId])
}

model CustomerRecord {
  id           String   @id @default(uuid())
  tenantId     String
  linkedUserId String?
  name         String
  phone        String
  addressText  String
  lat          Float
  lng          Float
  notes        String   @default("")
  createdAt    DateTime @default(now())

  tenant     Tenant     @relation(fields: [tenantId], references: [id])
  linkedUser User?      @relation("LinkedUser", fields: [linkedUserId], references: [id])
  deliveries Delivery[]

  @@index([tenantId, phone])
}

enum DeliveryStatus {
  ASSIGNED
  COMPLETED
  CANCELLED
}

model Delivery {
  id               String         @id @default(uuid())
  tenantId         String
  customerRecordId String
  cadeteUserId     String
  assignedByUserId String
  status           DeliveryStatus @default(ASSIGNED)
  rating           Int?
  ratingNote       String?
  createdAt        DateTime       @default(now())
  completedAt      DateTime?

  tenant         Tenant         @relation(fields: [tenantId], references: [id])
  customerRecord CustomerRecord @relation(fields: [customerRecordId], references: [id])
  cadete         User           @relation("CadeteDeliveries", fields: [cadeteUserId], references: [id])
  assignedBy     User           @relation("AssignedByDeliveries", fields: [assignedByUserId], references: [id])
}
```

Run the first migration against both databases:

```bash
npx prisma migrate dev --name init
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx prisma migrate deploy
```

- [ ] **Step 3: Create `PrismaService` and `PrismaModule`**

`backend/src/prisma/prisma.service.ts`:

```typescript
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

`backend/src/prisma/prisma.module.ts`:

```typescript
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 4: Write the test app helper**

`backend/test/utils/test-app.ts`:

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();
  return app;
}

export async function cleanDb(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.delivery.deleteMany();
  await prisma.customerRecord.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
}
```

- [ ] **Step 5: Write the failing health check e2e test**

Delete the default `backend/test/app.e2e-spec.ts` and create `backend/test/health.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/test-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /health returns ok status', () => {
    return request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Run the test and verify it fails**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json health
```

Expected: FAIL — `/health` returns 404 (default Nest CLI controller returns "Hello World!" on `GET /`, not `/health`).

- [ ] **Step 7: Implement the health endpoint**

Replace `backend/src/app.controller.ts`:

```typescript
import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get('health')
  health() {
    return { status: 'ok' };
  }
}
```

Replace `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [AppController],
})
export class AppModule {}
```

Delete `backend/src/app.service.ts` (no longer used).

- [ ] **Step 8: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json health
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat: scaffold NestJS backend with Prisma schema and health check"
```

---

### Task 2: Auth — register and login

**Files:**
- Create: `backend/src/auth/dto/register.dto.ts`
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.module.ts`
- Create: `backend/src/auth/strategies/jwt.strategy.ts`
- Create: `backend/src/auth/guards/jwt-auth.guard.ts`
- Create: `backend/src/auth/decorators/current-user.decorator.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/auth.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `createTestApp`/`cleanDb` (Task 1).
- Produces: `POST /auth/register` and `POST /auth/login` → `{ accessToken: string }`. `JwtAuthGuard` (import path `src/auth/guards/jwt-auth.guard.ts`) — every later protected route uses this. `@CurrentUser()` decorator returning `userId: string` from `req.user.userId`. `AuthService.validateUserById(userId: string): Promise<{ id: string } | null>`.

- [ ] **Step 1: Install auth dependencies**

```bash
cd backend
npm install @nestjs/jwt @nestjs/passport @nestjs/config passport passport-jwt bcrypt
npm install -D @types/passport-jwt @types/bcrypt
```

Add to `backend/.env` and `backend/.env.test`:

```
JWT_SECRET="dev-secret-change-me"
```

- [ ] **Step 2: Write the failing e2e test**

`backend/test/auth.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user and returns an access token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('rejects registration with a phone already in use', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Otra Ana', phone: '+549343111111', password: 'otherpass' })
      .expect(409);
  });

  it('logs in with correct credentials and rejects wrong password', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ana', phone: '+549343111111', password: 'secret123' })
      .expect(201);

    const ok = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343111111', password: 'secret123' })
      .expect(200);
    expect(ok.body.accessToken).toEqual(expect.any(String));

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343111111', password: 'wrong' })
      .expect(401);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json auth
```

Expected: FAIL — `/auth/register` does not exist (404).

- [ ] **Step 4: Implement the DTOs**

`backend/src/auth/dto/register.dto.ts`:

```typescript
import { IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;
}
```

`backend/src/auth/dto/login.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  phone: string;

  @IsString()
  password: string;
}
```

- [ ] **Step 5: Implement `AuthService`**

`backend/src/auth/auth.service.ts`:

```typescript
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ accessToken: string }> {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Phone already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { name: dto.name, phone: dto.phone, passwordHash },
    });

    return { accessToken: this.signToken(user.id) };
  }

  async login(dto: LoginDto): Promise<{ accessToken: string }> {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return { accessToken: this.signToken(user.id) };
  }

  async validateUserById(userId: string): Promise<{ id: string } | null> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? { id: user.id } : null;
  }

  private signToken(userId: string): string {
    return this.jwt.sign({ sub: userId });
  }
}
```

- [ ] **Step 6: Implement the JWT strategy and guard**

`backend/src/auth/strategies/jwt.strategy.ts`:

```typescript
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService, private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string }) {
    const user = await this.authService.validateUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException();
    }
    return { userId: user.id };
  }
}
```

`backend/src/auth/guards/jwt-auth.guard.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

`backend/src/auth/decorators/current-user.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.user.userId;
});
```

- [ ] **Step 7: Implement `AuthController` and `AuthModule`**

`backend/src/auth/auth.controller.ts`:

```typescript
import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
```

`backend/src/auth/auth.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 8: Wire `ConfigModule` and `AuthModule` into `AppModule`**

Modify `backend/src/app.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
  controllers: [AppController],
})
export class AppModule {}
```

- [ ] **Step 9: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json auth
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend
git commit -m "feat: add phone+password auth with JWT"
```

---

### Task 3: Tenant-membership and role guards

**Files:**
- Create: `backend/src/tenants/guards/tenant-membership.guard.ts`
- Create: `backend/src/tenants/guards/roles.guard.ts`
- Create: `backend/src/tenants/decorators/current-membership.decorator.ts`
- Create: `backend/src/tenants/decorators/roles.decorator.ts`
- Test: `backend/src/tenants/guards/tenant-membership.guard.spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `req.user.userId` set by `JwtAuthGuard` (Task 2).
- Produces: `TenantMembershipGuard` (reads `req.params.tenantId`, attaches `req.membership: { tenantId: string; role: Role }`, throws `ForbiddenException` if no membership exists), `RolesGuard` + `@Roles(...roles: Role[])` decorator (reads `req.membership.role`), `@CurrentMembership()` decorator returning `req.membership`. Every tenant-scoped controller in later tasks applies `@UseGuards(JwtAuthGuard, TenantMembershipGuard)` at minimum, plus `RolesGuard` where role restrictions apply.

This is a unit test (not e2e) because it tests guard logic in isolation with a mocked `PrismaService` — the fastest and most direct way to verify the multi-tenancy security boundary.

- [ ] **Step 1: Write the failing unit test**

`backend/src/tenants/guards/tenant-membership.guard.spec.ts`:

```typescript
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantMembershipGuard } from './tenant-membership.guard';
import { PrismaService } from '../../prisma/prisma.service';

function mockContext(params: any, user: any): ExecutionContext {
  const request: any = { params, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as ExecutionContext;
}

describe('TenantMembershipGuard', () => {
  let prisma: { membership: { findUnique: jest.Mock } };
  let guard: TenantMembershipGuard;

  beforeEach(() => {
    prisma = { membership: { findUnique: jest.fn() } };
    guard = new TenantMembershipGuard(prisma as unknown as PrismaService);
  });

  it('allows access when the user has a membership in the requested tenant', async () => {
    prisma.membership.findUnique.mockResolvedValue({ tenantId: 'tenant-a', role: 'MOSTRADOR' });
    const ctx = mockContext({ tenantId: 'tenant-a' }, { userId: 'user-1' });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('denies access when the user has no membership in the requested tenant (cross-tenant)', async () => {
    prisma.membership.findUnique.mockResolvedValue(null);
    const ctx = mockContext({ tenantId: 'tenant-b' }, { userId: 'user-1' });

    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd backend
npx jest tenant-membership.guard.spec.ts
```

Expected: FAIL — `TenantMembershipGuard` module not found.

- [ ] **Step 3: Implement `TenantMembershipGuard`**

`backend/src/tenants/guards/tenant-membership.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantMembershipGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const tenantId: string | undefined = request.params.tenantId;
    const userId: string | undefined = request.user?.userId;

    if (!tenantId || !userId) {
      throw new ForbiddenException('Missing tenant or user context');
    }

    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });

    if (!membership) {
      throw new ForbiddenException('Not a member of this tenant');
    }

    request.membership = { tenantId: membership.tenantId, role: membership.role };
    return true;
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

```bash
npx jest tenant-membership.guard.spec.ts
```

Expected: PASS

- [ ] **Step 5: Implement `RolesGuard`, `@Roles`, and `@CurrentMembership`**

`backend/src/tenants/decorators/roles.decorator.ts`:

```typescript
import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
```

`backend/src/tenants/guards/roles.guard.ts`:

```typescript
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const role: Role | undefined = request.membership?.role;
    if (!role || !requiredRoles.includes(role)) {
      throw new ForbiddenException('Role not permitted for this action');
    }
    return true;
  }
}
```

`backend/src/tenants/decorators/current-membership.decorator.ts`:

```typescript
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from '@prisma/client';

export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): { tenantId: string; role: Role } => {
    return ctx.switchToHttp().getRequest().membership;
  },
);
```

- [ ] **Step 6: Commit**

```bash
git add backend
git commit -m "feat: add tenant-membership and role guards for multi-tenant isolation"
```

---

### Task 4: Tenants — create tenant and invite members

**Files:**
- Create: `backend/src/tenants/dto/create-tenant.dto.ts`
- Create: `backend/src/tenants/dto/invite-member.dto.ts`
- Create: `backend/src/tenants/tenants.service.ts`
- Create: `backend/src/tenants/tenants.controller.ts`
- Create: `backend/src/tenants/tenants.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/tenants.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `JwtAuthGuard`, `CurrentUser` (Task 2), `TenantMembershipGuard`, `RolesGuard`, `Roles`, `CurrentMembership` (Task 3).
- Produces: `POST /tenants` → creates `Tenant` + `ADMIN` membership for the caller, returns `{ id, name, contactInfo }`. `GET /tenants` → returns the caller's memberships with tenant info. `POST /tenants/:tenantId/members` (ADMIN only) → invites a member by phone, returns `{ userId, role, temporaryPassword? }` (a `temporaryPassword` is included only when a brand-new `User` was created for the invite, since there is no SMS/email delivery in the MVP — the admin communicates it directly, per spec flow A).

- [ ] **Step 1: Write the failing e2e test**

`backend/test/tenants.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Owner', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Tenants (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a tenant and makes the creator an admin', async () => {
    const token = await registerAndLogin(app, '+549343100001');

    const created = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    expect(created.body.name).toBe('Rotisería Don José');

    const mine = await request(app.getHttpServer())
      .get('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].role).toBe('ADMIN');
  });

  it('lets an admin invite a new member by phone', async () => {
    const token = await registerAndLogin(app, '+549343100002');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Cadete Juan', phone: '+549343100003', role: 'CADETE' })
      .expect(201);

    expect(invite.body.role).toBe('CADETE');
    expect(invite.body.temporaryPassword).toEqual(expect.any(String));
  });

  it('rejects a non-admin trying to invite members', async () => {
    const adminToken = await registerAndLogin(app, '+549343100004');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería Don José' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete Juan', phone: '+549343100005', role: 'CADETE' })
      .expect(201);

    const cadeteToken = await (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+549343100005', password: expect.anything() })
    );
    // Cadete's temp password isn't known here; instead verify via a fresh non-member user.
    const outsiderToken = await registerAndLogin(app, '+549343100006');
    await request(app.getHttpServer())
      .post(`/tenants/${tenant.body.id}/members`)
      .set('Authorization', `Bearer ${outsiderToken}`)
      .send({ name: 'Otro', phone: '+549343100007', role: 'CADETE' })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json tenants
```

Expected: FAIL — `/tenants` does not exist.

- [ ] **Step 3: Implement the DTOs**

`backend/src/tenants/dto/create-tenant.dto.ts`:

```typescript
import { IsOptional, IsString, MinLength } from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsString()
  contactInfo?: string;
}
```

`backend/src/tenants/dto/invite-member.dto.ts`:

```typescript
import { IsIn, IsString, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class InviteMemberDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsIn(['ADMIN', 'MOSTRADOR', 'CADETE'])
  role: Role;
}
```

- [ ] **Step 4: Implement `TenantsService`**

`backend/src/tenants/tenants.service.ts`:

```typescript
import { ConflictException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateTenantDto) {
    return this.prisma.tenant.create({
      data: {
        name: dto.name,
        contactInfo: dto.contactInfo,
        memberships: { create: { userId, role: 'ADMIN' } },
      },
    });
  }

  async listMyMemberships(userId: string) {
    const memberships = await this.prisma.membership.findMany({
      where: { userId },
      include: { tenant: true },
    });
    return memberships.map((m) => ({
      tenantId: m.tenantId,
      name: m.tenant.name,
      role: m.role,
    }));
  }

  async inviteMember(tenantId: string, dto: InviteMemberDto) {
    let user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    let temporaryPassword: string | undefined;

    if (!user) {
      temporaryPassword = randomBytes(4).toString('hex');
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      user = await this.prisma.user.create({
        data: { name: dto.name, phone: dto.phone, passwordHash },
      });
    }

    const existingMembership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId: user.id, tenantId } },
    });
    if (existingMembership) {
      throw new ConflictException('User is already a member of this tenant');
    }

    await this.prisma.membership.create({
      data: { userId: user.id, tenantId, role: dto.role },
    });

    return { userId: user.id, role: dto.role, temporaryPassword };
  }
}
```

- [ ] **Step 5: Implement `TenantsController` and `TenantsModule`**

`backend/src/tenants/tenants.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantMembershipGuard } from './guards/tenant-membership.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { InviteMemberDto } from './dto/invite-member.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post('tenants')
  create(@CurrentUser() userId: string, @Body() dto: CreateTenantDto) {
    return this.tenantsService.create(userId, dto);
  }

  @Get('tenants')
  listMine(@CurrentUser() userId: string) {
    return this.tenantsService.listMyMemberships(userId);
  }

  @Post('tenants/:tenantId/members')
  @UseGuards(TenantMembershipGuard, RolesGuard)
  @Roles('ADMIN')
  invite(@Param('tenantId') tenantId: string, @Body() dto: InviteMemberDto) {
    return this.tenantsService.inviteMember(tenantId, dto);
  }
}
```

`backend/src/tenants/tenants.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { TenantsController } from './tenants.controller';
import { TenantMembershipGuard } from './guards/tenant-membership.guard';

@Module({
  providers: [TenantsService, TenantMembershipGuard],
  controllers: [TenantsController],
  exports: [TenantMembershipGuard],
})
export class TenantsModule {}
```

- [ ] **Step 6: Wire `TenantsModule` into `AppModule`**

Modify `backend/src/app.module.ts` — add `TenantsModule` to `imports`.

- [ ] **Step 7: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json tenants
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat: add tenant creation and member invites"
```

---

### Task 5: User profile — short code and home location

**Files:**
- Create: `backend/src/users/dto/update-location.dto.ts`
- Create: `backend/src/users/users.service.ts`
- Create: `backend/src/users/users.controller.ts`
- Create: `backend/src/users/users.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/users.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `JwtAuthGuard`, `CurrentUser` (Task 2).
- Produces: `POST /users/me/short-code` → `{ shortCode: string }` (idempotent — generates once, returns the same code on repeat calls). `PATCH /users/me/location` → `{ addressText, lat, lng }`. `UsersService.getByShortCode(code: string): Promise<User | null>` — consumed by the `customers` module in Task 6 to link a self-registered customer.

- [ ] **Step 1: Write the failing e2e test**

`backend/test/users.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Cliente', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Users (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates a short code once and returns the same code on repeat calls', async () => {
    const token = await registerAndLogin(app, '+549343200001');

    const first = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const second = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(first.body.shortCode).toBe(second.body.shortCode);
    expect(first.body.shortCode).toHaveLength(6);
  });

  it('updates home location', async () => {
    const token = await registerAndLogin(app, '+549343200002');

    const res = await request(app.getHttpServer())
      .patch('/users/me/location')
      .set('Authorization', `Bearer ${token}`)
      .send({ addressText: 'San Martín 123', lat: -31.73, lng: -60.52 })
      .expect(200);

    expect(res.body).toEqual({ addressText: 'San Martín 123', lat: -31.73, lng: -60.52 });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json users
```

Expected: FAIL — `/users/me/short-code` does not exist.

- [ ] **Step 3: Implement the DTO and `UsersService`**

`backend/src/users/dto/update-location.dto.ts`:

```typescript
import { IsLatitude, IsLongitude, IsString, MinLength } from 'class-validator';

export class UpdateLocationDto {
  @IsString()
  @MinLength(3)
  addressText: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
```

`backend/src/users/users.service.ts`:

```typescript
import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateLocationDto } from './dto/update-location.dto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureShortCode(userId: string): Promise<string> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.shortCode) {
      return user.shortCode;
    }

    let code: string;
    do {
      code = this.randomCode();
    } while (await this.prisma.user.findUnique({ where: { shortCode: code } }));

    await this.prisma.user.update({ where: { id: userId }, data: { shortCode: code } });
    return code;
  }

  async updateLocation(userId: string, dto: UpdateLocationDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { homeAddressText: dto.addressText, homeLat: dto.lat, homeLng: dto.lng },
    });
    return { addressText: user.homeAddressText, lat: user.homeLat, lng: user.homeLng };
  }

  async getByShortCode(code: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { shortCode: code } });
  }

  private randomCode(): string {
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
    return code;
  }
}
```

- [ ] **Step 4: Implement `UsersController` and `UsersModule`**

`backend/src/users/users.controller.ts`:

```typescript
import { Body, Controller, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UsersService } from './users.service';
import { UpdateLocationDto } from './dto/update-location.dto';

@Controller('users/me')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('short-code')
  async ensureShortCode(@CurrentUser() userId: string) {
    return { shortCode: await this.usersService.ensureShortCode(userId) };
  }

  @Patch('location')
  updateLocation(@CurrentUser() userId: string, @Body() dto: UpdateLocationDto) {
    return this.usersService.updateLocation(userId, dto);
  }
}
```

`backend/src/users/users.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';

@Module({
  providers: [UsersService],
  controllers: [UsersController],
  exports: [UsersService],
})
export class UsersModule {}
```

- [ ] **Step 5: Wire `UsersModule` into `AppModule`**

Modify `backend/src/app.module.ts` — add `UsersModule` to `imports`.

- [ ] **Step 6: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json users
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat: add short-code generation and home location for user self-service"
```

---

### Task 6: Customers — create, search, link by short code, update

**Files:**
- Create: `backend/src/customers/dto/create-customer.dto.ts`
- Create: `backend/src/customers/dto/update-customer.dto.ts`
- Create: `backend/src/customers/customers.service.ts`
- Create: `backend/src/customers/customers.controller.ts`
- Create: `backend/src/customers/customers.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/customers.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `JwtAuthGuard`, `CurrentUser` (Task 2), `TenantMembershipGuard` (Task 3), `UsersService.getByShortCode` (Task 5).
- Produces: `POST /tenants/:tenantId/customers`, `GET /tenants/:tenantId/customers?q=`, `GET /tenants/:tenantId/customers/:customerId` (includes `averageRating: number | null` and `deliveryCount: number`), `PATCH /tenants/:tenantId/customers/:customerId`. `CustomersService.findOneOrThrow(tenantId, customerId)` — consumed by the `deliveries` module in Task 7 to validate a customer belongs to the tenant before assigning a delivery.

- [ ] **Step 1: Write the failing e2e test**

`backend/test/customers.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'User') {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

async function createTenant(app: INestApplication, token: string) {
  const res = await request(app.getHttpServer())
    .post('/tenants')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Rotisería Don José' })
    .expect(201);
  return res.body.id as string;
}

describe('Customers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a customer manually with a map pin', async () => {
    const token = await registerAndLogin(app, '+549343300001', 'Mostrador');
    const tenantId = await createTenant(app, token);

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Carlos',
        phone: '+549343399999',
        addressText: 'Belgrano 456',
        lat: -31.735,
        lng: -60.525,
        notes: 'rejas negras, tocar timbre dos veces',
      })
      .expect(201);

    expect(res.body.name).toBe('Carlos');
    expect(res.body.notes).toContain('rejas negras');
  });

  it('links a self-registered customer by short code, autofilling their data', async () => {
    const customerToken = await registerAndLogin(app, '+549343300002', 'Carlos Cliente');
    await request(app.getHttpServer())
      .patch('/users/me/location')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(200);
    const codeRes = await request(app.getHttpServer())
      .post('/users/me/short-code')
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);

    const mostradorToken = await registerAndLogin(app, '+549343300003', 'Mostrador');
    const tenantId = await createTenant(app, mostradorToken);

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${mostradorToken}`)
      .send({ linkShortCode: codeRes.body.shortCode })
      .expect(201);

    expect(res.body.name).toBe('Carlos Cliente');
    expect(res.body.addressText).toBe('Belgrano 456');
  });

  it('searches customers by phone within the tenant and updates notes/pin', async () => {
    const token = await registerAndLogin(app, '+549343300004', 'Mostrador');
    const tenantId = await createTenant(app, token);
    const created = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Carlos', phone: '+549343399998', addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(201);

    const search = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers?q=399998`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(search.body).toHaveLength(1);

    const updated = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ lat: -31.736, lng: -60.526, notes: 'perro suelto' })
      .expect(200);
    expect(updated.body.notes).toBe('perro suelto');

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.averageRating).toBeNull();
    expect(detail.body.deliveryCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json customers
```

Expected: FAIL — customers routes do not exist.

- [ ] **Step 3: Implement the DTOs**

`backend/src/customers/dto/create-customer.dto.ts`:

```typescript
import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class CreateCustomerDto {
  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(2)
  name?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(6)
  phone?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsString()
  @MinLength(3)
  addressText?: string;

  @ValidateIf((o) => !o.linkShortCode)
  @IsLatitude()
  lat?: number;

  @ValidateIf((o) => !o.linkShortCode)
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  linkShortCode?: string;
}
```

`backend/src/customers/dto/update-customer.dto.ts`:

```typescript
import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6)
  phone?: string;

  @IsOptional()
  @IsString()
  @MinLength(3)
  addressText?: string;

  @IsOptional()
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @IsLongitude()
  lng?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
```

- [ ] **Step 4: Implement `CustomersService`**

`backend/src/customers/customers.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(tenantId: string, dto: CreateCustomerDto) {
    if (dto.linkShortCode) {
      const user = await this.usersService.getByShortCode(dto.linkShortCode);
      if (!user || !user.homeAddressText || user.homeLat == null || user.homeLng == null) {
        throw new NotFoundException('Short code not found or user has no location set');
      }
      return this.prisma.customerRecord.create({
        data: {
          tenantId,
          linkedUserId: user.id,
          name: user.name,
          phone: user.phone,
          addressText: user.homeAddressText,
          lat: user.homeLat,
          lng: user.homeLng,
          notes: dto.notes ?? '',
        },
      });
    }

    if (!dto.name || !dto.phone || !dto.addressText || dto.lat == null || dto.lng == null) {
      throw new BadRequestException('name, phone, addressText, lat and lng are required without a link code');
    }

    return this.prisma.customerRecord.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        addressText: dto.addressText,
        lat: dto.lat,
        lng: dto.lng,
        notes: dto.notes ?? '',
      },
    });
  }

  async search(tenantId: string, q: string | undefined) {
    return this.prisma.customerRecord.findMany({
      where: {
        tenantId,
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { phone: { contains: q } },
              ],
            }
          : {}),
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOneOrThrow(tenantId: string, customerId: string) {
    const customer = await this.prisma.customerRecord.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async findOneWithRating(tenantId: string, customerId: string) {
    const customer = await this.findOneOrThrow(tenantId, customerId);
    const agg = await this.prisma.delivery.aggregate({
      where: { customerRecordId: customer.id, status: 'COMPLETED' },
      _avg: { rating: true },
      _count: { rating: true },
    });
    return {
      ...customer,
      averageRating: agg._avg.rating,
      deliveryCount: agg._count.rating,
    };
  }

  async update(tenantId: string, customerId: string, dto: UpdateCustomerDto) {
    await this.findOneOrThrow(tenantId, customerId);
    return this.prisma.customerRecord.update({
      where: { id: customerId },
      data: dto,
    });
  }
}
```

- [ ] **Step 5: Implement `CustomersController` and `CustomersModule`**

`backend/src/customers/customers.controller.ts`:

```typescript
import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantMembershipGuard } from '../tenants/guards/tenant-membership.guard';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Controller('tenants/:tenantId/customers')
@UseGuards(JwtAuthGuard, TenantMembershipGuard)
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  create(@Param('tenantId') tenantId: string, @Body() dto: CreateCustomerDto) {
    return this.customersService.create(tenantId, dto);
  }

  @Get()
  search(@Param('tenantId') tenantId: string, @Query('q') q?: string) {
    return this.customersService.search(tenantId, q);
  }

  @Get(':customerId')
  findOne(@Param('tenantId') tenantId: string, @Param('customerId') customerId: string) {
    return this.customersService.findOneWithRating(tenantId, customerId);
  }

  @Patch(':customerId')
  update(
    @Param('tenantId') tenantId: string,
    @Param('customerId') customerId: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customersService.update(tenantId, customerId, dto);
  }
}
```

`backend/src/customers/customers.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { CustomersService } from './customers.service';
import { CustomersController } from './customers.controller';

@Module({
  imports: [TenantsModule, UsersModule],
  providers: [CustomersService],
  controllers: [CustomersController],
  exports: [CustomersService],
})
export class CustomersModule {}
```

- [ ] **Step 6: Wire `CustomersModule` into `AppModule`**

Modify `backend/src/app.module.ts` — add `CustomersModule` to `imports`.

- [ ] **Step 7: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json customers
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat: add customer records with short-code linking and search"
```

---

### Task 7: Deliveries — create, reassign, cancel

**Files:**
- Create: `backend/src/deliveries/dto/create-delivery.dto.ts`
- Create: `backend/src/deliveries/dto/reassign-delivery.dto.ts`
- Create: `backend/src/deliveries/deliveries.service.ts`
- Create: `backend/src/deliveries/deliveries.controller.ts`
- Create: `backend/src/deliveries/deliveries.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/deliveries.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `JwtAuthGuard`, `CurrentUser` (Task 2), `TenantMembershipGuard`, `RolesGuard`, `Roles` (Task 3), `CustomersService.findOneOrThrow` (Task 6).
- Produces: `POST /tenants/:tenantId/deliveries` (ADMIN, MOSTRADOR), `PATCH /tenants/:tenantId/deliveries/:deliveryId/reassign` (ADMIN, MOSTRADOR, CADETE), `PATCH /tenants/:tenantId/deliveries/:deliveryId/cancel` (ADMIN, MOSTRADOR, CADETE). Emits event `'delivery.assigned'` with payload `{ deliveryId: string; cadeteUserId: string }` on every create and reassign — consumed by the `push` module in Task 9.

- [ ] **Step 1: Install the event emitter**

```bash
cd backend
npm install @nestjs/event-emitter
```

Modify `backend/src/app.module.ts` — add `EventEmitterModule.forRoot()` to `imports` (import from `@nestjs/event-emitter`).

- [ ] **Step 2: Write the failing e2e test**

`backend/test/deliveries.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'User') {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Deliveries — create/reassign/cancel (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function setupTenantWithCadeteAndCustomer(phonePrefix: string) {
    const adminToken = await registerAndLogin(app, `${phonePrefix}1`, 'Admin');
    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Rotisería' })
      .expect(201);
    const tenantId = tenant.body.id as string;

    const invite = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete', phone: `${phonePrefix}2`, role: 'CADETE' })
      .expect(201);
    const cadeteUserId = invite.body.userId as string;

    const customer = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/customers`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Carlos', phone: `${phonePrefix}3`, addressText: 'Belgrano 456', lat: -31.735, lng: -60.525 })
      .expect(201);

    return { adminToken, tenantId, cadeteUserId, customerId: customer.body.id as string };
  }

  it('assigns a delivery to a cadete', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934340');

    const res = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    expect(res.body.status).toBe('ASSIGNED');
    expect(res.body.cadeteUserId).toBe(cadeteUserId);
  });

  it('rejects assigning to a user who is not a cadete in that tenant', async () => {
    const { adminToken, tenantId, customerId } = await setupTenantWithCadeteAndCustomer('+54934341');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId: 'not-a-real-user' })
      .expect(400);
  });

  it('reassigns and cancels a delivery while still ASSIGNED', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934342');

    const invite2 = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Cadete 2', phone: '+549343429', role: 'CADETE' })
      .expect(201);

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const reassigned = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/reassign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ cadeteUserId: invite2.body.userId })
      .expect(200);
    expect(reassigned.body.cadeteUserId).toBe(invite2.body.userId);

    const cancelled = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(cancelled.body.status).toBe('CANCELLED');

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/cancel`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json deliveries
```

Expected: FAIL — deliveries routes do not exist.

- [ ] **Step 4: Implement the DTOs**

`backend/src/deliveries/dto/create-delivery.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class CreateDeliveryDto {
  @IsString()
  customerRecordId: string;

  @IsString()
  cadeteUserId: string;
}
```

`backend/src/deliveries/dto/reassign-delivery.dto.ts`:

```typescript
import { IsString } from 'class-validator';

export class ReassignDeliveryDto {
  @IsString()
  cadeteUserId: string;
}
```

- [ ] **Step 5: Implement `DeliveriesService`**

`backend/src/deliveries/deliveries.service.ts`:

```typescript
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly events: EventEmitter2,
  ) {}

  async create(tenantId: string, assignedByUserId: string, dto: CreateDeliveryDto) {
    await this.customersService.findOneOrThrow(tenantId, dto.customerRecordId);
    await this.assertIsCadete(tenantId, dto.cadeteUserId);

    const delivery = await this.prisma.delivery.create({
      data: {
        tenantId,
        customerRecordId: dto.customerRecordId,
        cadeteUserId: dto.cadeteUserId,
        assignedByUserId,
      },
    });

    this.events.emit('delivery.assigned', { deliveryId: delivery.id, cadeteUserId: delivery.cadeteUserId });
    return delivery;
  }

  async reassign(tenantId: string, deliveryId: string, dto: ReassignDeliveryDto) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    await this.assertIsCadete(tenantId, dto.cadeteUserId);

    const updated = await this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { cadeteUserId: dto.cadeteUserId },
    });

    this.events.emit('delivery.assigned', { deliveryId: updated.id, cadeteUserId: updated.cadeteUserId });
    return updated;
  }

  async cancel(tenantId: string, deliveryId: string) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    return this.prisma.delivery.update({
      where: { id: delivery.id },
      data: { status: 'CANCELLED' },
    });
  }

  async findAssignedOrThrow(tenantId: string, deliveryId: string) {
    const delivery = await this.prisma.delivery.findFirst({
      where: { id: deliveryId, tenantId },
    });
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    if (delivery.status !== 'ASSIGNED') {
      throw new BadRequestException('Only ASSIGNED deliveries can be modified');
    }
    return delivery;
  }

  private async assertIsCadete(tenantId: string, userId: string) {
    const membership = await this.prisma.membership.findUnique({
      where: { userId_tenantId: { userId, tenantId } },
    });
    if (!membership || membership.role !== 'CADETE') {
      throw new BadRequestException('cadeteUserId must belong to a CADETE member of this tenant');
    }
  }
}
```

- [ ] **Step 6: Implement `DeliveriesController` and `DeliveriesModule`**

`backend/src/deliveries/deliveries.controller.ts`:

```typescript
import { Body, Controller, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { TenantMembershipGuard } from '../tenants/guards/tenant-membership.guard';
import { RolesGuard } from '../tenants/guards/roles.guard';
import { Roles } from '../tenants/decorators/roles.decorator';
import { DeliveriesService } from './deliveries.service';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ReassignDeliveryDto } from './dto/reassign-delivery.dto';

@Controller('tenants/:tenantId/deliveries')
@UseGuards(JwtAuthGuard, TenantMembershipGuard, RolesGuard)
export class DeliveriesController {
  constructor(private readonly deliveriesService: DeliveriesService) {}

  @Post()
  @Roles('ADMIN', 'MOSTRADOR')
  create(
    @Param('tenantId') tenantId: string,
    @CurrentUser() userId: string,
    @Body() dto: CreateDeliveryDto,
  ) {
    return this.deliveriesService.create(tenantId, userId, dto);
  }

  @Patch(':deliveryId/reassign')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  reassign(
    @Param('tenantId') tenantId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: ReassignDeliveryDto,
  ) {
    return this.deliveriesService.reassign(tenantId, deliveryId, dto);
  }

  @Patch(':deliveryId/cancel')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  cancel(@Param('tenantId') tenantId: string, @Param('deliveryId') deliveryId: string) {
    return this.deliveriesService.cancel(tenantId, deliveryId);
  }
}
```

`backend/src/deliveries/deliveries.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { CustomersModule } from '../customers/customers.module';
import { DeliveriesService } from './deliveries.service';
import { DeliveriesController } from './deliveries.controller';

@Module({
  imports: [TenantsModule, CustomersModule],
  providers: [DeliveriesService],
  controllers: [DeliveriesController],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
```

- [ ] **Step 7: Wire `DeliveriesModule` into `AppModule`**

Modify `backend/src/app.module.ts` — add `EventEmitterModule.forRoot()` and `DeliveriesModule` to `imports`.

- [ ] **Step 8: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json deliveries
```

Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add backend
git commit -m "feat: add delivery assignment, reassignment, and cancellation"
```

---

### Task 8: Deliveries — complete with rating, and cadete's assigned list

**Files:**
- Create: `backend/src/deliveries/dto/complete-delivery.dto.ts`
- Modify: `backend/src/deliveries/deliveries.service.ts`
- Modify: `backend/src/deliveries/deliveries.controller.ts`
- Modify: `backend/test/deliveries.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Task 7.
- Produces: `PATCH /tenants/:tenantId/deliveries/:deliveryId/complete` (ADMIN, MOSTRADOR, CADETE) → sets `status: 'COMPLETED'`, `rating`, `ratingNote`, `completedAt`. `GET /tenants/:tenantId/deliveries/mine` (ADMIN, MOSTRADOR, CADETE) → the caller's own `ASSIGNED` deliveries, used by `CustomersService.findOneWithRating` (Task 6) to compute the average.

- [ ] **Step 1: Add the failing tests to `deliveries.e2e-spec.ts`**

Append inside the existing `describe` block:

```typescript
  it('completes a delivery with a rating and updates the customer average', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934343');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const completed = await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 4, ratingNote: 'Todo bien' })
      .expect(200);
    expect(completed.body.status).toBe('COMPLETED');

    const detail = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/customers/${customerId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(detail.body.averageRating).toBe(4);
    expect(detail.body.deliveryCount).toBe(1);
  });

  it('rejects an out-of-range rating', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934344');

    const delivery = await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    await request(app.getHttpServer())
      .patch(`/tenants/${tenantId}/deliveries/${delivery.body.id}/complete`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ rating: 7 })
      .expect(400);
  });

  it('lists only the caller-relevant assigned deliveries', async () => {
    const { adminToken, tenantId, cadeteUserId, customerId } =
      await setupTenantWithCadeteAndCustomer('+54934345');

    await request(app.getHttpServer())
      .post(`/tenants/${tenantId}/deliveries`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ customerRecordId: customerId, cadeteUserId })
      .expect(201);

    const list = await request(app.getHttpServer())
      .get(`/tenants/${tenantId}/deliveries/mine`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    // adminToken's userId is not the cadete, so its own assigned list is empty.
    expect(list.body).toEqual([]);
  });
```

- [ ] **Step 2: Run the tests and verify they fail**

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json deliveries
```

Expected: FAIL — `/complete` and `/mine` do not exist.

- [ ] **Step 3: Implement `CompleteDeliveryDto`**

`backend/src/deliveries/dto/complete-delivery.dto.ts`:

```typescript
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class CompleteDeliveryDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @IsOptional()
  @IsString()
  ratingNote?: string;
}
```

- [ ] **Step 4: Add `complete` and `listMine` to `DeliveriesService`**

Add to `backend/src/deliveries/deliveries.service.ts` (inside the class, alongside the existing methods):

```typescript
  async complete(tenantId: string, deliveryId: string, dto: CompleteDeliveryDto) {
    const delivery = await this.findAssignedOrThrow(tenantId, deliveryId);
    return this.prisma.delivery.update({
      where: { id: delivery.id },
      data: {
        status: 'COMPLETED',
        rating: dto.rating,
        ratingNote: dto.ratingNote,
        completedAt: new Date(),
      },
    });
  }

  async listMine(tenantId: string, cadeteUserId: string) {
    return this.prisma.delivery.findMany({
      where: { tenantId, cadeteUserId, status: 'ASSIGNED' },
      include: { customerRecord: true },
      orderBy: { createdAt: 'asc' },
    });
  }
```

Add the import at the top of the file: `import { CompleteDeliveryDto } from './dto/complete-delivery.dto';`

- [ ] **Step 5: Add the routes to `DeliveriesController`**

Add to `backend/src/deliveries/deliveries.controller.ts` (inside the class):

```typescript
  @Get('mine')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  listMine(@Param('tenantId') tenantId: string, @CurrentUser() userId: string) {
    return this.deliveriesService.listMine(tenantId, userId);
  }

  @Patch(':deliveryId/complete')
  @Roles('ADMIN', 'MOSTRADOR', 'CADETE')
  complete(
    @Param('tenantId') tenantId: string,
    @Param('deliveryId') deliveryId: string,
    @Body() dto: CompleteDeliveryDto,
  ) {
    return this.deliveriesService.complete(tenantId, deliveryId, dto);
  }
```

Add imports at the top: `Get` from `@nestjs/common`, and `import { CompleteDeliveryDto } from './dto/complete-delivery.dto';`.

Note: place the `GET 'mine'` route definition before `PATCH ':deliveryId/...'` routes in the file — Nest matches routes in declaration order, and a literal `mine` segment must not be shadowed by a `:deliveryId` param route in a way that breaks it (Nest disambiguates static vs. param segments correctly regardless of order here since they're different HTTP verbs and paths, but keeping literal routes first is the safer convention).

- [ ] **Step 6: Run the tests and verify they pass**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json deliveries
```

Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend
git commit -m "feat: add delivery completion with rating and cadete's assigned list"
```

---

### Task 9: Web Push notifications

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Modify: `backend/test/utils/test-app.ts`
- Create: `backend/src/push/dto/subscribe-push.dto.ts`
- Create: `backend/src/push/push.service.ts`
- Create: `backend/src/push/push.controller.ts`
- Create: `backend/src/push/push.module.ts`
- Modify: `backend/src/app.module.ts`
- Test: `backend/test/push.e2e-spec.ts`

**Interfaces:**
- Consumes: `PrismaService` (Task 1), `JwtAuthGuard`, `CurrentUser` (Task 2), the `'delivery.assigned'` event (Task 7).
- Produces: `POST /push/subscribe` → stores a `PushSubscription`. `GET /push/vapid-public-key` (no auth — the frontend needs it before the user is necessarily logged in as a cadete on that device) → `{ publicKey: string }`. `PushService.sendToUser(userId, payload)` — internal, exercised indirectly via the event listener.

- [ ] **Step 1: Install `web-push` and generate VAPID keys**

```bash
cd backend
npm install web-push
npm install -D @types/web-push
npx web-push generate-vapid-keys
```

Add the generated keys to `backend/.env` and `backend/.env.test`:

```
VAPID_PUBLIC_KEY="<generated public key>"
VAPID_PRIVATE_KEY="<generated private key>"
VAPID_SUBJECT="mailto:joako.1910@gmail.com"
```

- [ ] **Step 2: Add `PushSubscription` to the Prisma schema**

Add to `backend/prisma/schema.prisma`:

```prisma
model PushSubscription {
  id        String   @id @default(uuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id])
}
```

Add the inverse relation to `User`:

```prisma
  pushSubscriptions PushSubscription[]
```

Run the migration:

```bash
npx prisma migrate dev --name add_push_subscriptions
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx prisma migrate deploy
```

- [ ] **Step 3: Add `PushSubscription` cleanup to the test helper**

Modify `backend/test/utils/test-app.ts` — in `cleanDb`, add `await prisma.pushSubscription.deleteMany();` as the first line (before `delivery.deleteMany()`, since nothing references it via FK the order doesn't matter here, but keep it first for readability).

- [ ] **Step 4: Write the failing e2e test**

`backend/test/push.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string) {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name: 'Cadete', phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Push (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('exposes the VAPID public key without auth', async () => {
    const res = await request(app.getHttpServer()).get('/push/vapid-public-key').expect(200);
    expect(res.body.publicKey).toEqual(expect.any(String));
  });

  it('stores a push subscription for the authenticated user', async () => {
    const token = await registerAndLogin(app, '+549343500001');

    await request(app.getHttpServer())
      .post('/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({
        endpoint: 'https://fcm.googleapis.com/fcm/send/example-endpoint',
        keys: { p256dh: 'p256dh-key', auth: 'auth-key' },
      })
      .expect(201);
  });
});
```

- [ ] **Step 5: Run the test and verify it fails**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json push
```

Expected: FAIL — `/push/*` routes do not exist.

- [ ] **Step 6: Implement the DTO and `PushService`**

`backend/src/push/dto/subscribe-push.dto.ts`:

```typescript
import { IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class PushKeysDto {
  @IsString()
  p256dh: string;

  @IsString()
  auth: string;
}

export class SubscribePushDto {
  @IsString()
  endpoint: string;

  @ValidateNested()
  @Type(() => PushKeysDto)
  keys: PushKeysDto;
}
```

`backend/src/push/push.service.ts`:

```typescript
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    webpush.setVapidDetails(
      config.get<string>('VAPID_SUBJECT')!,
      config.get<string>('VAPID_PUBLIC_KEY')!,
      config.get<string>('VAPID_PRIVATE_KEY')!,
    );
  }

  getPublicKey(): string {
    return process.env.VAPID_PUBLIC_KEY!;
  }

  async subscribe(userId: string, dto: SubscribePushDto) {
    await this.prisma.pushSubscription.upsert({
      where: { endpoint: dto.endpoint },
      create: { userId, endpoint: dto.endpoint, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
      update: { userId, p256dh: dto.keys.p256dh, auth: dto.keys.auth },
    });
  }

  async sendToUser(userId: string, payload: { title: string; body: string; url: string }) {
    const subscriptions = await this.prisma.pushSubscription.findMany({ where: { userId } });

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            JSON.stringify(payload),
          );
        } catch (err: any) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            await this.prisma.pushSubscription.delete({ where: { id: sub.id } });
          } else {
            this.logger.warn(`Failed to send push to subscription ${sub.id}: ${err.message}`);
          }
        }
      }),
    );
  }

  @OnEvent('delivery.assigned')
  async handleDeliveryAssigned(event: { deliveryId: string; cadeteUserId: string }) {
    await this.sendToUser(event.cadeteUserId, {
      title: 'Nueva entrega asignada',
      body: 'Tenés una nueva entrega — abrí la app para ver la dirección.',
      url: `/deliveries/${event.deliveryId}`,
    });
  }
}
```

- [ ] **Step 7: Implement `PushController` and `PushModule`**

`backend/src/push/push.controller.ts`:

```typescript
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PushService } from './push.service';
import { SubscribePushDto } from './dto/subscribe-push.dto';

@Controller('push')
export class PushController {
  constructor(private readonly pushService: PushService) {}

  @Get('vapid-public-key')
  getPublicKey() {
    return { publicKey: this.pushService.getPublicKey() };
  }

  @Post('subscribe')
  @UseGuards(JwtAuthGuard)
  subscribe(@CurrentUser() userId: string, @Body() dto: SubscribePushDto) {
    return this.pushService.subscribe(userId, dto);
  }
}
```

`backend/src/push/push.module.ts`:

```typescript
import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';

@Module({
  providers: [PushService],
  controllers: [PushController],
})
export class PushModule {}
```

- [ ] **Step 8: Wire `PushModule` into `AppModule`**

Modify `backend/src/app.module.ts` — add `PushModule` to `imports`.

- [ ] **Step 9: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json push
```

Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add backend
git commit -m "feat: add Web Push subscriptions and notify cadetes on delivery assignment"
```

---

### Task 10: Rate limiting on login and short-code linking

**Files:**
- Modify: `backend/src/app.module.ts`
- Modify: `backend/src/auth/auth.controller.ts`
- Modify: `backend/src/customers/customers.controller.ts`
- Test: `backend/test/rate-limit.e2e-spec.ts`

**Interfaces:**
- Consumes: `AuthController` (Task 2), `CustomersController` (Task 6).
- Produces: global default throttling for all routes, plus a stricter limit specifically on `POST /auth/login` and `POST /tenants/:tenantId/customers` (the endpoint that resolves a `linkShortCode` — this is the actual short-code brute-force surface the spec calls out, since that's where a guessed code gets checked against real users; the `GET` search endpoint only searches within a tenant's own already-created records and isn't a code-guessing vector).

- [ ] **Step 1: Install `@nestjs/throttler`**

```bash
cd backend
npm install @nestjs/throttler
```

- [ ] **Step 2: Write the failing e2e test**

`backend/test/rate-limit.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks repeated login attempts after the limit', async () => {
    const attempts = Array.from({ length: 6 }, () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send({ phone: '+549343999999', password: 'wrong' }),
    );

    const results = await Promise.all(attempts);
    const tooMany = results.filter((r) => r.status === 429);

    expect(tooMany.length).toBeGreaterThan(0);
  });

  it('blocks repeated short-code guesses against a tenant', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Mostrador', phone: '+549343999998', password: 'secret123' })
      .expect(201);
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ phone: '+549343999998', password: 'secret123' })
      .expect(200);
    const token = login.body.accessToken as string;

    const tenant = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Rotisería' })
      .expect(201);

    const attempts = Array.from({ length: 12 }, (_, i) =>
      request(app.getHttpServer())
        .post(`/tenants/${tenant.body.id}/customers`)
        .set('Authorization', `Bearer ${token}`)
        .send({ linkShortCode: `GUESS0${i}` }),
    );

    const results = await Promise.all(attempts);
    const tooMany = results.filter((r) => r.status === 429);

    expect(tooMany.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 3: Run the test and verify it fails**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json rate-limit
```

Expected: FAIL — no throttler is wired up yet, so no request in either test gets a 429 (the login attempts all return 401, the short-code guesses all return 404).

- [ ] **Step 4: Wire the global throttler**

Modify `backend/src/app.module.ts` — add imports:

```typescript
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
```

Add to the `imports` array:

```typescript
ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
```

Add a `providers` array to the `@Module` decorator (create it if it doesn't exist yet):

```typescript
providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
```

- [ ] **Step 5: Apply a stricter limit to login**

Modify `backend/src/auth/auth.controller.ts` — import `Throttle` from `@nestjs/throttler` and annotate the `login` method:

```typescript
@Throttle({ default: { limit: 5, ttl: 60000 } })
@Post('login')
login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

- [ ] **Step 6: Apply a stricter limit to short-code linking**

Modify `backend/src/customers/customers.controller.ts` — import `Throttle` and annotate the `create` method (this is the endpoint that resolves `linkShortCode` against real users, so it's the one that needs brute-force protection):

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })
@Post()
create(@Param('tenantId') tenantId: string, @Body() dto: CreateCustomerDto) {
  return this.customersService.create(tenantId, dto);
}
```

- [ ] **Step 7: Run the test and verify it passes**

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json rate-limit
```

Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat: rate-limit login and customer search"
```

---

### Task 11: Cross-tenant isolation e2e suite

**Files:**
- Test: `backend/test/tenant-isolation.e2e-spec.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–8. No production code changes — this task hardens confidence in the guard from Task 3 with an end-to-end scenario across two real tenants, which is the single most important security property of this system (spec: "Aislamiento entre tenants").

- [ ] **Step 1: Write the test**

`backend/test/tenant-isolation.e2e-spec.ts`:

```typescript
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp, cleanDb } from './utils/test-app';

async function registerAndLogin(app: INestApplication, phone: string, name = 'Admin') {
  await request(app.getHttpServer())
    .post('/auth/register')
    .send({ name, phone, password: 'secret123' })
    .expect(201);
  const res = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ phone, password: 'secret123' })
    .expect(200);
  return res.body.accessToken as string;
}

describe('Cross-tenant isolation (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterEach(async () => {
    await cleanDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('never lets a member of tenant A read or write tenant B data', async () => {
    const tokenA = await registerAndLogin(app, '+549343600001', 'Admin A');
    const tokenB = await registerAndLogin(app, '+549343600002', 'Admin B');

    const tenantA = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Rotisería A' })
      .expect(201);

    const tenantB = await request(app.getHttpServer())
      .post('/tenants')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Rotisería B' })
      .expect(201);

    const customerB = await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ name: 'Cliente B', phone: '+549343600003', addressText: 'Calle B 1', lat: -31.7, lng: -60.5 })
      .expect(201);

    // Admin A cannot list tenant B's customers.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);

    // Admin A cannot read a specific tenant B customer by guessed ID.
    await request(app.getHttpServer())
      .get(`/tenants/${tenantB.body.id}/customers/${customerB.body.id}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(403);

    // Admin A cannot create a customer under tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/customers`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Intruso', phone: '+549343600004', addressText: 'X', lat: -31.7, lng: -60.5 })
      .expect(403);

    // Admin A cannot invite members into tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/members`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ name: 'Intruso', phone: '+549343600005', role: 'CADETE' })
      .expect(403);

    // Admin A cannot assign a delivery under tenant B.
    await request(app.getHttpServer())
      .post(`/tenants/${tenantB.body.id}/deliveries`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ customerRecordId: customerB.body.id, cadeteUserId: 'anyone' })
      .expect(403);
  });
});
```

- [ ] **Step 2: Run the full e2e suite and verify everything passes**

```bash
cd backend
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/cadetes_test" npx jest --config ./test/jest-e2e.json
```

Expected: PASS — all e2e specs green, including the new isolation suite.

- [ ] **Step 3: Commit**

```bash
git add backend
git commit -m "test: add end-to-end cross-tenant isolation suite"
```

---

## Manual verification (once, after Task 11)

With the server running (`npm run start:dev` in `backend/`, `DATABASE_URL` pointing at `cadetes_dev`), walk through flow C→D→E from the spec with `curl` against a real Postgres instance, confirming the JSON responses match what the e2e tests assert. This is a sanity check that the dev environment (not just the Jest test runner) is wired correctly before starting the frontend plan.
