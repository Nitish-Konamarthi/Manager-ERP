export interface ApiResponse<T = unknown> {
  success: boolean
  message?: string
  data?: T
  error?: string
  timestamp: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}
