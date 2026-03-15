const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const ITEMS = [
  {
    title: 'Промокод Uzum Market -15%',
    description: 'Скидка 15% на заказ в Uzum Market',
    price: 150,
    type: 'promo_code',
    value: 'UZUM-15-DEMO',
    stock: -1,
  },
  {
    title: 'Скидка Humans Mobile 1 месяц',
    description: 'Демо-скидка на 1 месяц тарифа',
    price: 200,
    type: 'discount',
    value: 'HUMANS-1M-DEMO',
    stock: -1,
  },
  {
    title: '[ДЕМО] Оплата электроэнергии',
    description: 'Демонстрационный сервис оплаты',
    price: 500,
    type: 'service_demo',
    value: 'DEMO: Оплата электроэнергии',
    stock: -1,
  },
  {
    title: '[ДЕМО] Оплата газа',
    description: 'Демонстрационный сервис оплаты',
    price: 500,
    type: 'service_demo',
    value: 'DEMO: Оплата газа',
    stock: -1,
  },
  {
    title: 'Промокод Yandex Еда -20%',
    description: 'Скидка 20% на один заказ',
    price: 100,
    type: 'promo_code',
    value: 'YANDEX-EDA-20-DEMO',
    stock: -1,
  },
]

async function main() {
  for (const item of ITEMS) {
    await prisma.shopItem.upsert({
      where: { title: item.title },
      update: {
        description: item.description,
        price: item.price,
        type: item.type,
        value: item.value,
        stock: item.stock,
        isActive: true,
      },
      create: {
        title: item.title,
        description: item.description,
        price: item.price,
        type: item.type,
        value: item.value,
        stock: item.stock,
        isActive: true,
      },
    })
  }
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (error) => {
    console.error('Seed failed:', error)
    await prisma.$disconnect()
    process.exit(1)
  })
