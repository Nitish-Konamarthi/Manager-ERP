import { SelectQueryBuilder, ObjectLiteral } from 'typeorm'
import { FilterRule } from '../interfaces/pagination.interface'

export class FilteringUtil {
  static applyFilters<T extends ObjectLiteral>(queryBuilder: SelectQueryBuilder<T>, filters: Record<string, any>, alias = 'entity'): void {
    if (!filters) return

    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null) continue

      // Handle operators in key: field__operator
      const parts = key.split('__')
      const field = parts[0]
      const operator = parts[1] || 'eq'

      // Validate field name (prevent SQL injection)
      if (!/^[a-zA-Z_][a-zA-Z0-9_.]*$/.test(field)) continue

      const paramKey = `${field}_${Math.random().toString(36).substring(2, 7)}`

      switch (operator) {
        case 'eq':
          queryBuilder.andWhere(`${alias}.${field} = :${paramKey}`, { [paramKey]: value })
          break
        case 'neq':
          queryBuilder.andWhere(`${alias}.${field} != :${paramKey}`, { [paramKey]: value })
          break
        case 'gt':
          queryBuilder.andWhere(`${alias}.${field} > :${paramKey}`, { [paramKey]: value })
          break
        case 'gte':
          queryBuilder.andWhere(`${alias}.${field} >= :${paramKey}`, { [paramKey]: value })
          break
        case 'lt':
          queryBuilder.andWhere(`${alias}.${field} < :${paramKey}`, { [paramKey]: value })
          break
        case 'lte':
          queryBuilder.andWhere(`${alias}.${field} <= :${paramKey}`, { [paramKey]: value })
          break
        case 'like':
          queryBuilder.andWhere(`${alias}.${field} LIKE :${paramKey}`, { [paramKey]: `%${value}%` })
          break
        case 'in':
          if (Array.isArray(value) && value.length > 0) {
            queryBuilder.andWhere(`${alias}.${field} IN (:...${paramKey})`, { [paramKey]: value })
          }
          break
        case 'between':
          if (Array.isArray(value) && value.length === 2) {
            queryBuilder.andWhere(`${alias}.${field} BETWEEN :${paramKey}_0 AND :${paramKey}_1`, {
              [`${paramKey}_0`]: value[0],
              [`${paramKey}_1`]: value[1],
            })
          }
          break
        case 'isNull':
          if (value === true || value === 'true') {
            queryBuilder.andWhere(`${alias}.${field} IS NULL`)
          } else {
            queryBuilder.andWhere(`${alias}.${field} IS NOT NULL`)
          }
          break
      }
    }
  }

  static parseFilterString(filterStr: string): Record<string, any> {
    if (!filterStr) return {}
    try {
      return JSON.parse(filterStr)
    } catch {
      return {}
    }
  }
}
