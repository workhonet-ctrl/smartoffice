// ============================================================
// SmartOffice — types.ts (aligned with Supabase schema)
// ============================================================

export interface Box {
  id: string;
  name: string;
  length_cm: number;
  width_cm: number;
  height_cm: number;
  price_thb: number;
  created_at: string;
}

export interface Bubble {
  id: string;
  name: string;
  length_cm: number | null;
  width_cm: number | null;
  price_thb: number | null;
  active: boolean;
  created_at: string;
}

export interface ProductMaster {
  id: string;
  name: string;
  cost_thb: number;
  weight_g: number;
  description?: string;
  active?: boolean;
  created_at: string;
}

export interface ProductPromo {
  id: string;
  master_id: string;
  name: string;
  short_name: string | null;
  price_thb: number;
  box_id: string | null;
  bubble_id: string | null;
  color: string;
  item_type: string;
  active?: boolean;
  created_at: string;
  products_master?: ProductMaster;
  boxes?: Box;
  bubbles?: Bubble;
}

// FIX: tel (ไม่ใช่ phone), facebook_name (ไม่ใช่ facebook)
export interface Customer {
  id: string;
  name: string;
  facebook_name: string | null;
  tel: string;
  line_id: string | null;
  address: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postal_code: string | null;
  channel: string | null;
  tag: string;
  tag_manual: boolean;
  note: string | null;
  order_count: number;
  total_spent: number;
  created_at: string;
  updated_at: string;
}

export interface ProductMapping {
  id: string;
  raw_name: string;
  promo_id: string;
  created_at: string;
}

// FIX: total_thb, weight_kg, promo_ids[]
export interface Order {
  id: string;
  order_no: string;
  customer_id: string | null;
  channel: string | null;
  order_date: string | null;
  raw_prod: string | null;
  promo_ids: string[] | null;
  quantity: number;
  weight_kg: number | null;
  discount_thb: number;
  shipping_thb: number;
  total_thb: number;
  payment_method: string | null;
  payment_date: string | null;
  payment_status: string;
  tracking_no: string | null;
  courier: string | null;
  parcel_status: string;
  order_status: string;
  route: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
}

// FIX: amount_thb
export interface FinanceIncome {
  id: string;
  order_id: string | null;
  order_no: string | null;
  amount_thb: number;
  income_date: string;
  note: string | null;
  created_at: string;
}

export interface FinanceExpense {
  id: string;
  category: string;
  description: string;
  amount_thb: number;
  expense_date: string;
  reference: string | null;
  attachment_url: string | null;
  recorded_by: string | null;
  created_at: string;
}

// FIX: role (ไม่ใช่ position), active boolean
export interface Employee {
  id: string;
  employee_code: string | null;
  name: string;
  nickname: string | null;
  tel: string | null;
  role: string | null;
  department: string | null;
  salary: number | null;
  start_date: string | null;
  address_current: string | null;
  address_id: string | null;
  national_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  active: boolean;
  created_at: string;
}

// FIX: เพิ่ม amount, doc_date, description (จาก migration)
export interface HRDocument {
  id: string;
  employee_id: string | null;
  doc_type: string;
  status: string;
  detail: Record<string, unknown> | null;
  submitted_at: string;
  approved_by: string | null;
  approved_at: string | null;
  amount: number;
  doc_date: string | null;
  description: string | null;
  employees?: Employee;
}

// ============================================================
// Constants
// ============================================================
export const TOURIST_ZIPS = new Set([
  '20120','20150','20260','21160','23000','23170',
  '81000','81120','81130','81150','81180','81210',
  '82000','82110','82130','82140','82160','82190','82220',
  '83000','83100','83110','83120','83130','83150',
  '84140','84220','84280','84310','84320','84330','84360',
  '85000','91000','91110','92110','92120',
]);

export const ITEM_TYPES = [
  'อื่นๆ','เอกสาร','พัสดุ','อาหารแห้ง','ของใช้',
  'อุปกรณ์ไอที','เสื้อผ้า','สินค้าแบรนด์','อะไหล่รถยนต์',
  'รองเท้า-กระเป๋า','เครื่องสำอาง','เฟอร์นิเจอร์',
];

export const CHANNELS = [
  'Facebook','Lazada','TikTok','Shopee','เว็บ','อื่นๆ',
];

export const EMPLOYEE_ROLES = [
  'CEO','HR','บัญชี','หาสินค้า','กราฟฟิก',
  'โฆษณา','แอดมิน','เทเลเซลล์',
];

export const HR_DOC_TYPES = [
  'ลา','โอที','เบิกล่วงหน้า','เบิกเงินสดย่อย','รับรองเงินเดือน',
];

export const ORDER_STATUSES = [
  'รอชำระเงิน','ชำระแล้ว','กำลังแพ็ค','รอขนส่ง','จัดส่งแล้ว','ยกเลิก',
];

export const EXPENSE_CATEGORIES = [
  'ค่าโฆษณา','ค่ากล่อง','ค่าส่ง','เงินเดือน',
  'ค่าเช่า','ค่าไฟฟ้า','อื่นๆ',
];
