// ============================================================
// SmartOffice — types.ts (synced with actual Supabase schema)
// Last verified: 2026-05-03
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
  description?: string | null;
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
  ship_thb: number | null;
  created_at: string;
  products_master?: ProductMaster;
  boxes?: Box;
  bubbles?: Bubble;
}

// DB จริง: ใช้ tel (unique), facebook_name
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
  payment_method: string | null;
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
  raw_name: string;     // DB column = raw_name (ไม่ใช่ raw_prod)
  promo_id: string;     // DB column = promo_id (ไม่ใช่ promo_code)
  created_at: string;
}

// DB จริง: total_thb, weight_kg, promo_ids[], box_id, bubble_id_pack
export interface Order {
  id: string;
  order_no: string;
  customer_id: string | null;
  channel: string | null;
  order_date: string | null;
  order_time: string | null;
  raw_prod: string | null;
  promo_ids: string[] | null;
  quantity: number;
  quantities: string | null;
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
  slip_image: string | null;
  ship_date: string | null;
  box_id: string | null;
  bubble_id_pack: string | null;
  imported_at: string | null;
  followed_at: string | null;
  followed_by: string | null;
  created_at: string;
  updated_at: string;
  customers?: Customer;
}

// DB จริง: amount_thb (ไม่ใช่ amount)
export interface FinanceIncome {
  id: string;
  order_id: string | null;
  order_no: string | null;
  amount_thb: number;
  income_date: string;
  note: string | null;
  created_at: string;
}

// DB จริง: amount_thb, notes (เพิ่มมาทีหลัง), channel
export interface FinanceExpense {
  id: string;
  category: string;
  description: string;
  amount_thb: number;
  expense_date: string;
  channel: string | null;
  notes: string | null;
  reference: string | null;
  attachment_url: string | null;
  recorded_by: string | null;
  created_at: string;
}

// DB จริง: employees table columns (verified 2026-05-03)
// มีทั้ง salary+start_date (เก่า) และ hire_date+department_id+status (ใหม่)
export interface Employee {
  id: string;
  employee_code: string | null;
  name: string;
  nickname: string | null;
  email: string | null;
  tel: string | null;
  gender: string | null;
  role: string | null;
  department: string | null;           // column เก่า (free text)
  department_id: string | null;        // column ใหม่ (FK-style text)
  position_id: string | null;
  salary: number | null;               // column เก่า
  start_date: string | null;           // column เก่า
  hire_date: string | null;            // column ใหม่
  birth_date: string | null;
  status: string;                      // 'active' | 'inactive'
  active: boolean;
  photo_url: string | null;
  line_id: string | null;
  emergency_name: string | null;
  emergency_tel: string | null;
  address_current: string | null;
  address_id: string | null;
  national_id: string | null;
  bank_name: string | null;
  bank_account: string | null;
  created_at: string;
}

// DB จริง: hr_documents
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

// shipping_flash — มีอยู่จริงใน DB (1049 rows)
export interface ShippingFlash {
  id: string;
  tracking: string;
  ship_date: string | null;
  base_thb: number;
  extra_thb: number;
  total_thb: number;
  order_no: string | null;
  customer: string | null;
  raw_prod: string | null;
  matched: boolean;
  imported_at: string;
}

// shipping_myorder — มีอยู่จริงใน DB
export interface ShippingMyOrder {
  id: string;
  tracking: string;
  page: string | null;
  consignee: string | null;
  weight_kg: number;
  cod_thb: number;
  cod_fee_thb: number;
  freight_thb: number;
  total_thb: number;
  order_no: string | null;
  customer: string | null;
  raw_prod: string | null;
  matched: boolean;
  imported_at: string;
}

// case_followups — มีอยู่จริงใน DB
export interface CaseFollowup {
  id: string;
  order_id: string | null;
  customer_id: string | null;
  note: string;
  created_by: string | null;
  created_at: string;
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
  'รอคีย์ออเดอร์','รอชำระเงิน','ชำระแล้ว','กำลังแพ็ค',
  'รอจัดส่ง','รอขนส่ง','จัดส่งแล้ว','ยกเลิก',
];

// PARCEL_STATUSES — source of truth รวม color map (ใช้ใน Orders, ParcelTracking)
// v = ชื่อสถานะ, color = Tailwind class สำหรับ badge
export const PARCEL_STATUSES: { v: string; color: string }[] = [
  { v: 'ส่งสำเร็จ',          color: 'bg-green-100 text-green-700'   },
  { v: 'อยู่ระหว่างจัดส่ง', color: 'bg-blue-100 text-blue-700'    },
  { v: 'รอจัดส่ง',          color: 'bg-indigo-100 text-indigo-700' },
  { v: 'ค้างอยู่คลัง',       color: 'bg-purple-100 text-purple-700' },
  { v: 'ไม่มีคนรับ',         color: 'bg-orange-100 text-orange-700' },
  { v: 'ตีกลับ',             color: 'bg-yellow-100 text-yellow-700' },
  { v: 'ส่งคืน',             color: 'bg-red-100 text-red-700'      },
  { v: 'ปัญหา',              color: 'bg-red-200 text-red-800'      },
  { v: 'รอรับพัสดุ',         color: 'bg-slate-100 text-slate-500'  },
  { v: 'ยังไม่มีเลขพัสดุ',   color: 'bg-slate-100 text-slate-400'  },
];

// สถานะที่ "เช็คแล้ว" (มีข้อมูลจากขนส่ง) — ใช้กรอง unchecked ใน Orders/ParcelTracking
export const KNOWN_PARCEL_STATUSES = new Set(
  PARCEL_STATUSES.map(s => s.v).filter(v => v !== 'ยังไม่มีเลขพัสดุ')
);

// helper: ดึง color class จากสถานะ (fallback = slate)
export function parcelStatusColor(status: string): string {
  return PARCEL_STATUSES.find(s => s.v === status)?.color ?? 'bg-slate-100 text-slate-500';
}

export const EXPENSE_CATEGORIES = [
  'ค่าโฆษณา','ค่ากล่อง','ค่าส่ง','เงินเดือน',
  'ค่าเช่า','ค่าไฟฟ้า','อื่นๆ',
];
