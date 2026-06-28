import { SelectQueryBuilder, ObjectLiteral } from 'typeorm'
import { SortRule } from '../interfaces/pagination.interface'

export class SortingUtil {
  static applySorts<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    sortStr: string,
    allowedFields: string[] = [],
    alias = 'entity',
    defaultSort: SortRule = { field: 'createdAt', direction: 'DESC' },
  ): void {
    if (!sortStr) {
      queryBuilder.orderBy(`${alias}.${defaultSort.field}`, defaultSort.direction)
      return
    }

    const sorts = sortStr.split(',').map(s => s.trim())

    for (const sort of sorts) {
      const desc = sort.startsWith('-')
      const field = desc ? sort.substring(1) : sort

      // Validate field name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(field)) continue
      if (allowedFields.length > 0 && !allowedFields.includes(field)) continue

      queryBuilder.addOrderBy(`${alias}.${field}`, desc ? 'DESC' : 'ASC')
    }
  }

  static parseSort(sortStr: string): SortRule[] {
    if (!sortStr) return [{ field: 'createdAt', direction: 'DESC' }]

    return sortStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s)
      .map(s => {
        const desc = s.startsWith('-')
        const field = desc ? s.substring(1) : s
        return { field, direction: desc ? 'DESC' : 'ASC' }
      })
  }
}
