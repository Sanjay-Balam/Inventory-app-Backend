import { PrismaClient, Prisma } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // Clear existing data
  await prisma.$transaction([
    prisma.customerCreditTransaction.deleteMany(),
    prisma.vendorTransaction.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.inventory.deleteMany(),
    prisma.lowStockAlert.deleteMany(),
    prisma.transactions.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.vendor.deleteMany(),
    prisma.salesChannel.deleteMany(),
    prisma.user.deleteMany(),
  ])

  // Create Users
  const hashedPassword = await bcrypt.hash('password123', 10)
  const admin = await prisma.user.create({
    data: {
      name: 'Admin User',
      email: 'admin@example.com',
      phone: '1234567890',
      password: hashedPassword,
      role: 'ADMIN'
    }
  })

  // Create Sales Channels
  const retailStore = await prisma.salesChannel.create({
    data: {
      name: 'Retail Store',
      description: 'Main physical store location'
    }
  })

  // Create Categories
  const electronicsCategory = await prisma.category.create({
    data: {
      name: 'Electronics',
      description: 'Electronic devices and accessories'
    }
  })

  // Create Products
  const laptop = await prisma.product.create({
    data: {
      category_id: electronicsCategory.category_id,
      name: 'Premium Laptop',
      sku: 'LAP-2024-001',
      barcode: 'BAR123456789',
      price: new Prisma.Decimal(999.99),
      cost_price: new Prisma.Decimal(750.00),
      quantity: 50,
      low_stock_threshold: 10,
      description: 'High-performance laptop'
    }
  })

  // Create Inventory
  await prisma.inventory.create({
    data: {
      product_id: laptop.product_id,
      channel_id: retailStore.channel_id,
      stock: 50
    }
  })

  // Create Customer
  const customer = await prisma.customer.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      phone: '9876543210',
      address: '123 Main St',
      credit_limit: new Prisma.Decimal(1000)
    }
  })

  // Create Order
  const order = await prisma.order.create({
    data: {
      customer_id: customer.customer_id,
      channel_id: retailStore.channel_id,
      user_id: admin.user_id,
      total_amount: new Prisma.Decimal(999.99),
      order_status: 'COMPLETED',
      orderItems: {
        create: {
          product_id: laptop.product_id,
          quantity: 1,
          price: new Prisma.Decimal(999.99)
        }
      }
    }
  })

  // Create Vendor
  const vendor = await prisma.vendor.create({
    data: {
      name: 'Tech Suppliers Inc',
      email: 'supplier@tech.com',
      phone: '5555555555',
      address: '456 Supplier St'
    }
  })

  // Create a test user
  const testUser = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      name: 'Admin User',
      email: 'admin@example.com',
      phone: '1234567890',
      password: hashedPassword,
      role: 'ADMIN',
    },
  })

  console.log('Created user:', testUser)

  // Create a test sales channel
  const testChannel = await prisma.salesChannel.upsert({
    where: { channel_id: 1 },
    update: {},
    create: {
      name: 'Main Store',
      description: 'Main physical store location',
    },
  })

  console.log('Created sales channel:', testChannel)

  // Create a test category
  const testCategory = await prisma.category.upsert({
    where: { category_id: 1 },
    update: {},
    create: {
      name: 'Electronics',
      description: 'Electronic devices and accessories',
    },
  })

  console.log('Created category:', testCategory)

  // Create a test product with barcode
  const testProduct = await prisma.product.upsert({
    where: { sku: 'TEST-SKU-001' },
    update: {},
    create: {
      name: 'Test Product',
      sku: 'TEST-SKU-001',
      barcode: '123456789012', // This is the test barcode
      price: 99.99,
      cost_price: 75.00,
      quantity: 100,
      low_stock_threshold: 10,
      description: 'This is a test product with a barcode',
      category: {
        connect: { category_id: testCategory.category_id },
      },
    },
  })

  console.log('Created product:', testProduct)

  // Create inventory for the product
  const testInventory = await prisma.inventory.upsert({
    where: {
      product_id_channel_id: {
        product_id: testProduct.product_id,
        channel_id: testChannel.channel_id,
      },
    },
    update: {},
    create: {
      product: {
        connect: { product_id: testProduct.product_id },
      },
      channel: {
        connect: { channel_id: testChannel.channel_id },
      },
      stock: 100,
    },
  })

  console.log('Created inventory:', testInventory)

  // Create a test customer
  const testCustomer = await prisma.customer.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      name: 'Test Customer',
      email: 'customer@example.com',
      phone: '9876543210',
      address: '123 Test Street',
    },
  })

  console.log('Created customer:', testCustomer)

  console.log('Seed data created successfully')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })