import { prisma } from '@/lib/db'
import { ensureUser } from '@/lib/scoring'

export class ShopError extends Error {
  status: number

  constructor(message: string, status = 400) {
    super(message)
    this.name = 'ShopError'
    this.status = status
  }
}

export async function listActiveShopItems() {
  return prisma.shopItem.findMany({
    where: {
      isActive: true,
      OR: [{ stock: -1 }, { stock: { gt: 0 } }],
    },
    orderBy: [{ price: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      description: true,
      price: true,
      type: true,
      value: true,
      stock: true,
      isActive: true,
      createdAt: true,
    },
  })
}

export async function buyShopItem(input: { telegramId: string; itemId: number }) {
  const telegramId = input.telegramId.trim()
  const itemId = Number(input.itemId)
  if (!telegramId) {
    throw new ShopError('telegramId is required', 400)
  }
  if (!Number.isFinite(itemId) || itemId <= 0) {
    throw new ShopError('Некорректный itemId', 400)
  }

  const user = await ensureUser({ telegramId })

  return prisma.$transaction(async (tx) => {
    const item = await tx.shopItem.findUnique({ where: { id: itemId } })
    if (!item || !item.isActive) {
      throw new ShopError('Товар не найден или недоступен', 404)
    }

    if (item.stock === 0) {
      throw new ShopError('Товар закончился', 409)
    }

    const freshUser = await tx.user.findUnique({ where: { id: user.id } })
    if (!freshUser) {
      throw new ShopError('Пользователь не найден', 404)
    }

    if (freshUser.balance < item.price) {
      throw new ShopError('Недостаточно баллов', 400)
    }

    if (item.stock > 0) {
      const updated = await tx.shopItem.updateMany({
        where: { id: item.id, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      })
      if (updated.count === 0) {
        throw new ShopError('Товар закончился', 409)
      }
    }

    const updatedUser = await tx.user.update({
      where: { id: freshUser.id },
      data: { balance: { decrement: item.price } },
      select: { balance: true },
    })

    await tx.purchase.create({
      data: {
        userId: freshUser.id,
        itemId: item.id,
      },
    })

    return {
      itemId: item.id,
      title: item.title,
      value: item.value,
      newBalance: updatedUser.balance,
    }
  })
}
