import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      log: process.env.NODE_ENV === 'development'
        ? [{ emit: 'event', level: 'query' }, 'warn', 'error']
        : ['warn', 'error'],
      errorFormat: 'minimal',
      transactionOptions: {
        maxWait: 3000,
        timeout: 5000,
      },
    })
  }

  async onModuleInit() {
    await this.$connect()
    if (process.env.NODE_ENV === 'development') {
      this.$on('query' as never, (e: any) => {
        if (e.duration > 100) {
          console.warn(`SLOW QUERY (${e.duration}ms): ${e.query}`)
        }
      })
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
