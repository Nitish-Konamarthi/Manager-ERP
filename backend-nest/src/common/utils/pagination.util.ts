import { SelectQueryBuilder, ObjectLiteral } from 'typeorm'
import { PaginationParams, CursorParams, PaginatedResult, CursorResult } from '../interfaces/pagination.interface'
import { PaginationMeta, CursorMeta } from '../dto/api-response.dto'

export class PaginationUtil {
  static async paginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: PaginationParams,
    allowedSortFields: string[] = [],
  ): Promise<PaginatedResult<T>> {
    const page = params.page || 1
    const limit = Math.min(params.limit || 20, 500)
    const skip = (page - 1) * limit

    // Apply search
    if (params.q) {
      queryBuilder.andWhere('(1=1)') // placeholder, actual search fields set by caller
    }

    // Apply sorting
    if (params.sort && allowedSortFields.length > 0) {
      const sorts = params.sort.split(',').map(s => s.trim())
      for (const sort of sorts) {
        const desc = sort.startsWith('-')
        const field = desc ? sort.substring(1) : sort
        if (allowedSortFields.includes(field)) {
          queryBuilder.addOrderBy(`entity.${field}`, desc ? 'DESC' : 'ASC')
        }
      }
    }

    // Default sort by createdAt
    if (allowedSortFields.includes('createdAt') && Object.keys(queryBuilder.expressionMap.orderBys).length === 0) {
      queryBuilder.orderBy('entity.createdAt', 'DESC')
    }

    const [items, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount()

    const totalPages = Math.ceil(total / limit)

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    }
  }

  static async cursorPaginate<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    params: CursorParams,
    cursorEncoder: (item: T) => string,
  ): Promise<CursorResult<T>> {
    const limit = Math.min(params.limit || 20, 500) + 1 // Fetch one extra to check hasNext
    const sortField = params.sortField || 'createdAt'

    // Apply cursor condition
    if (params.cursor) {
      const decoded = Buffer.from(params.cursor, 'base64').toString('utf-8')
      const [fieldValue, id] = decoded.split('|')
      const operator = params.sortDirection === 'DESC' ? '<' : '>'
      queryBuilder.andWhere(
        `(entity.${sortField} ${operator} :cursorValue OR (entity.${sortField} = :cursorValue AND entity.id ${operator} :cursorId))`,
        { cursorValue: fieldValue, cursorId: id },
      )
    }

    queryBuilder.orderBy(`entity.${sortField}`, params.sortDirection).addOrderBy('entity.id', params.sortDirection)

    const items = await queryBuilder.take(limit).getMany()

    const hasNext = items.length > limit - 1
    if (hasNext) items.pop()

    const lastItem = items[items.length - 1]
    const nextCursor = lastItem ? cursorEncoder(lastItem) : undefined
    const firstItem = items[0]
    const previousCursor = firstItem && params.cursor ? cursorEncoder(firstItem) : undefined

    return {
      items,
      meta: {
        limit: limit - 1,
        hasNext,
        nextCursor,
        previousCursor,
      },
    }
  }

  static encodeCursor(fieldValue: any, id: string): string {
    return Buffer.from(`${fieldValue}|${id}`).toString('base64')
  }

  static toMeta(meta: PaginatedResult<any>['meta']): PaginationMeta {
    return {
      page: meta.page,
      limit: meta.limit,
      total: meta.total,
      totalPages: meta.totalPages,
      hasNextPage: meta.hasNextPage,
      hasPrevPage: meta.hasPrevPage,
    }
  }

  static toCursorMeta(meta: CursorResult<any>['meta']): CursorMeta {
    return {
      limit: meta.limit,
      hasNext: meta.hasNext,
      nextCursor: meta.nextCursor,
      previousCursor: meta.previousCursor,
    }
  }
}
