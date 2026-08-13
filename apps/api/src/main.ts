import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { loadEnv, corsOrigins } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Behind Caddy in production, trust the proxy's X-Forwarded-For so req.ip is
  // the real client (else ThrottlerGuard keys every request to the proxy IP —
  // one shared bucket, brute-force protection effectively disabled).
  app.getHttpAdapter().getInstance().set("trust proxy", 1);
  app.use(helmet());

  app.enableCors({
    origin: corsOrigins(env),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`API listening on http://localhost:${env.PORT}`);
}

void bootstrap();
