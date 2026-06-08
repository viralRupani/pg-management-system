import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";
import { loadEnv, corsOrigins } from "./config/env";

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  app.enableCors({
    origin: corsOrigins(env),
    credentials: true,
  });
  app.enableShutdownHooks();

  await app.listen(env.PORT);
  new Logger("Bootstrap").log(`API listening on http://localhost:${env.PORT}`);
}

void bootstrap();
