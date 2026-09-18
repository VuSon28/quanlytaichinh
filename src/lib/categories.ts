/**
 * Cay danh muc mac dinh + tu dien tu khoa tieng Viet.
 *
 * Tu dien nay la ly do bot chay gan nhu mien phi: no bat duoc phan lon
 * giao dich hang ngay ma khong can goi AI lan nao. Nhung tu khong co o
 * day se duoc hoi lai mot lan, roi ghi vao bang keyword_map va khong bao
 * gio phai hoi lai nua.
 *
 * `kind` moi danh muc duoc gan theo goc do suc khoe tai chinh:
 *   essential - khong cat duoc khi that nghiep
 *   flexible  - cat duoc
 *   saving    - chuyen sang tuong lai, khong phai tieu mat
 */

export type CategoryKind = 'essential' | 'flexible' | 'saving'

export interface SeedCategory {
  name: string
  icon: string
  kind: CategoryKind
  isIncome?: boolean
  /** Tu khoa khong dau, chu thuong */
  keywords: string[]
}

export const SEED_CATEGORIES: SeedCategory[] = [
  /* ---------------- Chi thiet yeu ---------------- */
  {
    name: 'Ăn uống thiết yếu', icon: '🍚', kind: 'essential',
    keywords: [
      'an sang', 'an trua', 'an toi', 'com', 'com trua', 'com toi', 'com binh dan',
      'sieu thi', 'bach hoa', 'winmart', 'coopmart', 'bach hoa xanh', 'bhx',
      'cho', 'di cho', 'rau', 'thit', 'ca', 'trung', 'gao', 'sua', 'gas',
    ],
  },
  {
    name: 'Nhà ở', icon: '🏠', kind: 'essential',
    keywords: [
      'tien nha', 'thue nha', 'thue phong', 'tro', 'tien tro', 'phi quan ly',
      'chung cu', 'sua nha', 'noi that',
    ],
  },
  {
    name: 'Điện nước internet', icon: '💡', kind: 'essential',
    keywords: [
      'dien', 'tien dien', 'nuoc', 'tien nuoc', 'internet', 'wifi', 'mang',
      'cap quang', 'fpt', 'viettel', 'vnpt', 'dien thoai', 'card', 'nap the',
      'cuoc dt', 'truyen hinh',
    ],
  },
  {
    name: 'Đi lại', icon: '🛵', kind: 'essential',
    keywords: [
      'xang', 'do xang', 'gui xe', 'giu xe', 've xe', 'xe bus', 'bus', 'taxi',
      'grab', 'be', 'xanh sm', 'gojek', 'vexere', 've may bay', 'bao duong xe',
      'sua xe', 'rua xe', 'vetc', 'phi cau duong',
    ],
  },
  {
    name: 'Sức khỏe', icon: '💊', kind: 'essential',
    keywords: [
      'thuoc', 'nha thuoc', 'benh vien', 'kham benh', 'bac si', 'xet nghiem',
      'nha khoa', 'rang', 'kham suc khoe', 'bao hiem y te', 'bhyt', 'long chau',
      'pharmacity', 'an khang',
    ],
  },
  {
    name: 'Giáo dục', icon: '📚', kind: 'essential',
    keywords: [
      'hoc phi', 'sach', 'khoa hoc', 'hoc them', 'tieng anh', 'gia su',
      'do dung hoc tap', 'vo', 'but',
    ],
  },
  {
    name: 'Bảo hiểm', icon: '🛡️', kind: 'essential',
    keywords: [
      'bao hiem', 'bhnt', 'bao hiem nhan tho', 'bao hiem xe', 'bao hiem suc khoe',
      'prudential', 'manulife', 'aia', 'dai ichi',
    ],
  },
  {
    name: 'Nuôi con', icon: '👶', kind: 'essential',
    keywords: [
      'bim', 'ta', 'sua cong thuc', 'sua bot', 'do choi', 'quan ao be',
      'tiem chung', 'hoc phi con', 'giu tre',
    ],
  },

  /* ---------------- Chi linh hoat ---------------- */
  {
    name: 'Ăn ngoài & cà phê', icon: '☕', kind: 'flexible',
    keywords: [
      'cafe', 'ca phe', 'cf', 'tra sua', 'highlands', 'phuc long', 'starbucks',
      'katinat', 'the coffee house', 'tch', 'nuoc', 'sinh to', 'nuoc ep',
      'nha hang', 'quan', 'lau', 'nuong', 'buffet', 'pizza', 'ga ran', 'kfc',
      'lotteria', 'jollibee', 'mcdonald', 'bun', 'pho', 'banh mi', 'an vat',
      'do an vat', 'tra', 'bia', 'ruou', 'nhau', 'do uong', 'kem', 'banh',
      'shopeefood', 'grabfood', 'befood', 'baemin', 'gojek food',
    ],
  },
  {
    name: 'Mua sắm', icon: '🛍️', kind: 'flexible',
    keywords: [
      'quan ao', 'giay', 'dep', 'tui', 'vi', 'my pham', 'skincare', 'son',
      'nuoc hoa', 'phu kien', 'dong ho', 'kinh', 'shopee', 'lazada', 'tiki',
      'tiktok shop', 'sendo', 'mua sam', 'do dung', 'dien may', 'dien thoai moi',
      'laptop', 'tai nghe',
    ],
  },
  {
    name: 'Giải trí', icon: '🎬', kind: 'flexible',
    keywords: [
      'phim', 'rap', 'cgv', 'lotte cinema', 'bhd', 'game', 'nap game', 'steam',
      'netflix', 'spotify', 'youtube premium', 'karaoke', 'bida', 'bowling',
      'concert', 've show', 'sach truyen', 'giai tri',
    ],
  },
  {
    name: 'Du lịch', icon: '✈️', kind: 'flexible',
    keywords: [
      'du lich', 'khach san', 'homestay', 'resort', 'booking', 'agoda',
      'tour', 've tau', 've may bay', 'nghi duong', 'checkin',
    ],
  },
  {
    name: 'Chăm sóc cá nhân', icon: '💇', kind: 'flexible',
    keywords: [
      'cat toc', 'lam toc', 'uon toc', 'nhuom toc', 'spa', 'massage', 'nail',
      'lam mong', 'gym', 'phong gym', 'yoga', 'boi', 'the thao', 'pt',
    ],
  },
  {
    name: 'Quà tặng & hiếu hỉ', icon: '🎁', kind: 'flexible',
    keywords: [
      'qua', 'qua tang', 'cuoi', 'dam cuoi', 'mung cuoi', 'thoi noi', 'dam ma',
      'phung dieu', 'sinh nhat', 'li xi', 'lixi', 'mung tuoi', 'tu thien',
      'ung ho', 'hieu hi',
    ],
  },
  {
    name: 'Thú cưng', icon: '🐕', kind: 'flexible',
    keywords: ['thu cung', 'cho', 'meo', 'thuc an cho', 'thuc an meo', 'thu y', 'pet'],
  },
  {
    name: 'Chi khác', icon: '📦', kind: 'flexible',
    keywords: ['khac', 'linh tinh', 'phat sinh'],
  },

  /* ---------------- Tiet kiem & dau tu ---------------- */
  {
    name: 'Tiết kiệm', icon: '🏦', kind: 'saving',
    keywords: ['tiet kiem', 'gui tiet kiem', 'so tiet kiem', 'de danh', 'tich luy'],
  },
  {
    name: 'Đầu tư', icon: '📈', kind: 'saving',
    keywords: [
      'dau tu', 'chung khoan', 'co phieu', 'mua co phieu', 'quy', 'chung chi quy',
      'trai phieu', 'vang', 'mua vang', 'sjc', 'crypto', 'bitcoin', 'btc',
      'vnindex', 'dcds', 'vfm',
    ],
  },
  {
    name: 'Trả nợ', icon: '💳', kind: 'saving',
    keywords: [
      'tra no', 'tra gop', 'tra the', 'thanh toan the', 'goc', 'lai vay',
      'khoan vay', 'vay ngan hang',
    ],
  },

  /* ---------------- Thu nhap ---------------- */
  {
    name: 'Lương', icon: '💰', kind: 'essential', isIncome: true,
    keywords: ['luong', 'nhan luong', 'tien luong', 'salary', 'thu nhap'],
  },
  {
    name: 'Thưởng', icon: '🎉', kind: 'essential', isIncome: true,
    keywords: ['thuong', 'bonus', 'thuong tet', 'thang 13', 'hoa hong', 'commission'],
  },
  {
    name: 'Thu nhập phụ', icon: '💼', kind: 'essential', isIncome: true,
    keywords: [
      'freelance', 'lam them', 'ban hang', 'affiliate', 'ban do', 'thanh ly',
      'cho thue', 'tien thue nha',
    ],
  },
  {
    name: 'Lãi & cổ tức', icon: '🪙', kind: 'essential', isIncome: true,
    keywords: ['lai', 'lai ngan hang', 'co tuc', 'lai tiet kiem', 'loi nhuan'],
  },
  {
    name: 'Thu khác', icon: '📥', kind: 'essential', isIncome: true,
    keywords: ['duoc cho', 'tra lai', 'hoan tien', 'refund', 'thu khac', 'duoc tang'],
  },
]

/** Bo dau tieng Viet + chuan hoa, de so khop tu khoa. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Bang tra nguoc: tu khoa -> ten danh muc. Dung cho lan chay dau. */
export const SEED_KEYWORD_INDEX: ReadonlyMap<string, string> = (() => {
  const map = new Map<string, string>()
  for (const cat of SEED_CATEGORIES) {
    for (const kw of cat.keywords) {
      const key = normalize(kw)
      // Tu khoa dai hon thang, vi no cu the hon ("tien dien" > "dien")
      const existing = map.get(key)
      if (!existing) map.set(key, cat.name)
    }
  }
  return map
})()
