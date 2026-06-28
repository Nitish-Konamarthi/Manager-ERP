import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import { Request, Response } from 'express'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    let status = HttpStatus.INTERNAL_SERVER_ERROR
    let message = 'Internal server error'
    let error = 'Internal Server Error'
    let details: any = undefined

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      const exResponse = exception.getResponse()
      if (typeof exResponse === 'string') {
        message = exResponse
        error = exception.name
      } else if (typeof exResponse === 'object') {
        const resp = exResponse as any
        message = resp.message || exception.message
        error = resp.error || exception.name
        details = resp.details
        // Handle class-validator errors
        if (Array.isArray(resp.message)) {
          message = 'Validation failed'
          details = resp.message
        }
      }
    } else if (exception instanceof Error) {
      message = exception.message
      error = exception.name
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack)
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      error,
      details,
      path: request.url,
      timestamp: new Date().toISOString(),
    })
  }
}
