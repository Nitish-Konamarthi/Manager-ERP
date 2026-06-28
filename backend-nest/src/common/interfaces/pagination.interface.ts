export interface PaginationParams {
  page: number
  limit: number
  sort?: string
  q?: string
}

export interface CursorParams {
  cursor?: string
  limit: number
  sortField: string
  sortDirection: 'ASC' | 'DESC'
}

export interface PaginatedResult<T> {
  items: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}

export interface CursorResult<T> {
  items: T[]
  meta: {
    limit: number
    hasNext: boolean
    nextCursor?: string
    previousCursor?: string
  }
}

export interface FilterRule {
  field: string
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'in' | 'between' | 'isNull' | 'isNotNull'
  value: any
}

export interface SortRule {
  field: string
  direction: 'ASC' | 'DESC'
}
