export interface PaginationParams {
  page?: number
  limit?: number
  sort?: string
  order?: 'asc' | 'desc'
}

export interface PaginatedResult<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export function paginate<T>(items: T[], total: number, params: PaginationParams): PaginatedResult<T> {
  const page = params.page || 1
  const limit = params.limit || 20
  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

export function getPaginationArgs(params: PaginationParams) {
  const page = Math.max(1, params.page || 1)
  const limit = Math.min(500, Math.max(1, params.limit || 20))
  return { skip: (page - 1) * limit, take: limit, page, limit }
}
