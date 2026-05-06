import { PrismaClient } from '../src/generated/prisma/index.js';

const db = new PrismaClient();

async function main() {
  const products = [
    { sku: 'PROD-001', name: 'Wireless Headphones', availableStock: 50 },
    { sku: 'PROD-002', name: 'Mechanical Keyboard', availableStock: 30 },
    { sku: 'PROD-003', name: 'USB-C Hub', availableStock: 100 },
    { sku: 'PROD-004', name: 'Monitor Stand', availableStock: 25 },
    { sku: 'PROD-005', name: 'Webcam HD', availableStock: 40 },
  ];
  for (const p of products) {
    await db.product.upsert({ where: { sku: p.sku }, update: {}, create: p });
  }
  console.log('Seeded 5 products');
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error(e);
    db.$disconnect();
    process.exit(1);
  });
