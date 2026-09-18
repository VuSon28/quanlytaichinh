import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import * as schema from './schema'

type Db = ReturnType<typeof create>

function create() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error('Thiếu DATABASE_URL — xem file .env.example')
  }

  const client = postgres(url, {
    /**
     * Supabase Transaction Pooler (cong 6543) KHONG ho tro prepared
     * statement. Neu de mac dinh bat, truy van thu hai tro di se loi
     * "prepared statement already exists" - mot loi rat kho doan ra.
     */
    prepare: false,
    /**
     * Moi lan chay ham serverless la mot tien trinh song ngan. Giu it
     * ket noi va nga som de khong lam can kiet pool ben phia Supabase.
     */
    max: 1,
    idle_timeout: 20,
    connect_timeout: 10,
  })

  return drizzle(client, { schema })
}

let instance: Db | null = null

function get(): Db {
  if (!instance) instance = create()
  return instance
}

/**
 * Khoi tao TRE, khong phai luc import.
 *
 * `next build` nap module de phan tich route, nhung luc do bien moi
 * truong chua chac co. Neu khoi tao ngay o cap module thi build hong
 * ma khong lien quan gi den chat luong code. Proxy nay hoan viec ket
 * noi lai den truy van dau tien.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    return Reflect.get(get() as object, prop, receiver)
  },
})

export { schema }
