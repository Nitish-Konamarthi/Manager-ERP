import { Catch, ArgumentsHost, HttpStatus, Logger } from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import { QueryFailedError } from 'typeorm'

@Catch(QueryFailedError)
export class QueryFailedFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Database')

  catch(exception: QueryFailedError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse()
    const message = exception.message
    const driverError = (exception as any).driverError

    let status = HttpStatus.CONFLICT
    let userMessage = 'Database error'

    // SQLite error codes
    if (driverError?.errno === 19) {
      // UNIQUE constraint
      userMessage = 'A record with this value already exists'
    } else if (driverError?.errno === 787) {
      // NOT NULL constraint
      userMessage = 'Required field is missing'
    } else if (message.includes('FOREIGN KEY')) {
      userMessage = 'Referenced record not found'
      status = HttpStatus.BAD_REQUEST
    } else if (message.includes('SQLITE_ERROR')) {
      userMessage = 'Database query error'
      status = HttpStatus.INTERNAL_SERVER_ERROR
    }

    this.logger.warn(`Query failed: ${message.substring(0, 200)}`)

    response.status(status).json({
      success: false,
      statusCode: status,
      message: userMessage,
      error: 'Database Error',
      timestamp: new Date().toISOString(),
    })
  }
}
