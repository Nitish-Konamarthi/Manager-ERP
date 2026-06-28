import { PrismaClient, UserStatus } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // ── Organization ──
  const org = await prisma.organization.upsert({
    where: { code: 'DEFAULT' },
    update: {},
    create: { name: 'Default Organization', code: 'DEFAULT', email: 'info@default.com' },
  })

  // ── Shop ──
  await prisma.shop.upsert({
    where: { organizationId_code: { organizationId: org.id, code: 'MAIN' } },
    update: {},
    create: { organizationId: org.id, name: 'Main Shop', code: 'MAIN', address: 'Main Street' },
  })

  // ── Roles ──
  const adminRole = await prisma.role.upsert({
    where: { name: 'admin' },
    update: {},
    create: { name: 'admin', description: 'System administrator', isSystem: true },
  })
  const managerRole = await prisma.role.upsert({
    where: { name: 'manager' },
    update: {},
    create: { name: 'manager', description: 'Store manager', isSystem: true },
  })
  const staffRole = await prisma.role.upsert({
    where: { name: 'staff' },
    update: {},
    create: { name: 'staff', description: 'Staff member', isSystem: true },
  })

  // ── Permissions ──
  const resources = ['inventory', 'sales', 'procurement', 'accounting', 'customers', 'suppliers', 'reports']
  const actions = ['read', 'create', 'update', 'delete']
  for (const role of [adminRole, managerRole]) {
    for (const resource of resources) {
      for (const action of actions) {
        await prisma.permission.upsert({
          where: { roleId_resource_action: { roleId: role.id, resource, action } },
          update: {},
          create: { roleId: role.id, resource, action },
        })
      }
    }
  }
  // Staff: read only
  for (const resource of resources) {
    await prisma.permission.upsert({
      where: { roleId_resource_action: { roleId: staffRole.id, resource, action: 'read' } },
      update: {},
      create: { roleId: staffRole.id, resource, action: 'read' },
    })
  }

  // ── Admin User ──
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@managererp.com'
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123'
  const hash = await bcrypt.hash(adminPassword, 12)
  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      organizationId: org.id,
      passwordHash: hash,
      name: 'Admin User',
      status: UserStatus.ACTIVE,
    },
    create: {
      organizationId: org.id,
      email: adminEmail,
      passwordHash: hash,
      name: 'Admin User',
      status: UserStatus.ACTIVE,
    },
  })
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: adminRole.id } },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id },
  })

  // ── Categories ──
  const categories = [
    { name: 'Vegetables', code: 'VEG' },
    { name: 'Fruits', code: 'FRU' },
    { name: 'Dairy', code: 'DRY' },
    { name: 'Meat & Poultry', code: 'MEA' },
    { name: 'Groceries', code: 'GRO' },
  ]
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { organizationId_name: { organizationId: org.id, name: cat.name } },
      update: {},
      create: { organizationId: org.id, ...cat },
    })
  }

  // ── Units ──
  const units = [
    { name: 'Kilogram', code: 'KG' },
    { name: 'Gram', code: 'G' },
    { name: 'Liter', code: 'L' },
    { name: 'Piece', code: 'PCS' },
    { name: 'Carton', code: 'CTN' },
  ]
  for (const unit of units) {
    await prisma.unit.upsert({
      where: { organizationId_code: { organizationId: org.id, code: unit.code } },
      update: {},
      create: { organizationId: org.id, ...unit },
    })
  }

  // ── Accounts ──
  const accounts = [
    { accountCode: '1001', name: 'Cash', type: 'ASSET' as const },
    { accountCode: '1002', name: 'Bank Account', type: 'ASSET' as const },
    { accountCode: '2001', name: 'Accounts Payable', type: 'LIABILITY' as const },
    { accountCode: '3001', name: 'Owner Equity', type: 'EQUITY' as const },
    { accountCode: '4001', name: 'Sales Revenue', type: 'INCOME' as const },
    { accountCode: '5001', name: 'Cost of Goods Sold', type: 'EXPENSE' as const },
    { accountCode: '5002', name: 'Operating Expenses', type: 'EXPENSE' as const },
  ]
  for (const acc of accounts) {
    await prisma.account.upsert({
      where: { organizationId_accountCode: { organizationId: org.id, accountCode: acc.accountCode } },
      update: {},
      create: { organizationId: org.id, ...acc },
    })
  }

  const expenseHeads = [
    { name: 'Fuel', code: 'FUEL' },
    { name: 'Rent', code: 'RENT' },
    { name: 'Utilities', code: 'UTIL' },
    { name: 'Repairs', code: 'REPAIR' },
    { name: 'Miscellaneous', code: 'MISC' },
  ]
  for (const head of expenseHeads) {
    await prisma.expenseHead.upsert({
      where: { organizationId_code: { organizationId: org.id, code: head.code } },
      update: {},
      create: { organizationId: org.id, ...head },
    })
  }

  console.log('Seed complete!')
  console.log(`  Admin login: ${adminEmail} / ${adminPassword}`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
