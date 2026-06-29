import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger'
import helmet from 'helmet'
import compression from 'compression'
import express, { Request, Response, NextFunction } from 'express'
import { readFileSync } from 'fs'
import { join } from 'path'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import { TransformInterceptor } from './common/interceptors/transform.interceptor'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })

  app.setGlobalPrefix('api/v1')
  app.enableCors({
    origin: process.env.CORS_ORIGINS?.split(',') || 'http://localhost:3043',
    credentials: true,
  })
  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(compression())

  const publicDir = join(__dirname, '..', '..', 'public')
  app.use(express.static(publicDir))
  let indexHtml: string | null = null
  try { indexHtml = readFileSync(join(publicDir, 'index.html'), 'utf-8') } catch {}
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/api/docs')) return next()
    if (indexHtml) return res.type('html').send(indexHtml)
    next()
  })

  const config = new DocumentBuilder()
    .setTitle('Manager ERP API')
    .setDescription('Enterprise Resource Planning system for retail and hotel supply')
    .setVersion('1.0')
    .addBearerAuth()
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  const port = process.env.PORT || 3042
  await app.listen(port)
  console.log(`Server running on http://localhost:${port}`)
  console.log(`API docs: http://localhost:${port}/api/docs`)
}
bootstrap()
