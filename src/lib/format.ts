/**
 * Dinh dang so tien nhan SO THUONG, dung chung cho ca may chu lan trinh
 * duyet.
 *
 * Tach rieng khoi money.ts vi ham o do nhan Decimal - kieu du lieu khong
 * gui qua ranh gioi may chu/trinh duyet duoc. Va tach rieng khoi file
 * bieu do vi file do danh dau 'use client': moi thu xuat tu mot module
 * client deu tro thanh ham cua trinh duyet, va may chu goi vao se loi
 * "Attempted to call vnd() from the server".
 */

/** 45000 -> "45k", 1200000 -> "1,2tr" */
export function short(n: number): string {
  const abs = Math.abs(n)
  if (abs >= 1_000_000_000) return `${trim(n / 1_000_000_000)}tỷ`
  if (abs >= 1_000_000) return `${trim(n / 1_000_000)}tr`
  if (abs >= 1_000) return `${trim(n / 1_000)}k`
  return String(Math.round(n))
}

function trim(n: number): string {
  return n.toFixed(1).replace(/\.0$/, '').replace('.', ',')
}

/** 45000 -> "45.000 đ" */
export function vnd(n: number): string {
  return `${Math.round(n).toLocaleString('vi-VN')} đ`
}
