import { TypeOrmModuleOptions } from '@nestjs/typeorm'
import { ConfigService } from '@nestjs/config'

export const getTypeOrmConfig = (config: ConfigService): TypeOrmModuleOptions => {
  const dbType = config.get('DB_TYPE', 'sqlite') as string

  if (dbType === 'postgres') {
    return {
      type: 'postgres',
      host: config.get('DB_HOST', 'localhost') as string,
      port: config.get('DB_PORT', 5432) as number,
      username: config.get('DB_USERNAME', 'postgres') as string,
      password: config.get('DB_PASSWORD', 'postgres') as string,
      database: config.get('DB_NAME', 'manager_erp') as string,
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],
      synchronize: config.get('DB_SYNCHRONIZE', false) as boolean,
      logging: config.get('DB_LOGGING', false) as boolean,
      migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
      ssl: config.get<string>('NODE_ENV') === 'production' ? { rejectUnauthorized: false } : false,
      extra: {
        poolSize: 20,
        connectionTimeoutMillis: 10000,
      },
    }
  }

  // SQLite (default)
  return {
    type: 'better-sqlite3',
    database: config.get('DB_PATH', 'data/erp.db') as string,
    entities: [__dirname + '/../**/*.entity{.ts,.js}'],
    synchronize: config.get('DB_SYNCHRONIZE', true) as boolean,
    logging: config.get('DB_LOGGING', false) as boolean,
    migrations: [__dirname + '/../database/migrations/*{.ts,.js}'],
    autoLoadEntities: true,
    extra: {
      pragma: {
        journal_mode: 'WAL',
        foreign_keys: 'ON',
        cache_size: -8000, // 8MB cache
        busy_timeout: 5000,
      },
    },
  }
}
