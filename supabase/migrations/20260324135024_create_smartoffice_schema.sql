/*
  # SmartOffice Thai E-commerce Internal Portal - Complete Database Schema

  ## Overview
  This migration creates all tables for the SmartOffice internal portal including:
  - Product management (master products and promo variants)
  - Customer management
  - Order processing
  - Finance tracking
  - HR/Employee management

  ## New Tables

  ### 1. boxes
  Shipping box definitions with dimensions
  - `id` (uuid, primary key)
  - `name` (text) - Box name (e.g., กล่อง00, กล่อง0, etc.)
  - `length_cm` (numeric) - Length in cm
  - `width_cm` (numeric) - Width in cm
  - `height_cm` (numeric) - Height in cm
  - `created_at` (timestamptz)

  ### 2. products_master
  Master product records (M)
  - `id` (uuid, primary key)
  - `name` (text) - Full product name
  - `cost_thb` (numeric) - Cost in THB
  - `weight_g` (numeric) - Weight in grams
  - `created_at` (timestamptz)
  - Cannot be deleted if linked to products_promo

  ### 3. products_promo
  Promotional product variants (P) - must link to master product
  - `id` (uuid, primary key)
  - `master_id` (uuid, foreign key to products_master)
  - `code` (text, unique) - Product code
  - `short_name` (text) - Short name without parentheses
  - `price_thb` (numeric) - Selling price
  - `box_id` (uuid, foreign key to boxes)
  - `color` (text)
  - `item_type` (text) - For Flash Export dropdown
  - `created_at` (timestamptz)

  ### 4. customers
  Customer records with auto-tagging
  - `id` (uuid, primary key)
  - `phone` (text, unique) - Primary key for deduplication
  - `name` (text)
  - `facebook` (text)
  - `address` (text)
  - `subdistrict` (text) - ตำบล
  - `district` (text) - อำเภอ
  - `province` (text) - จังหวัด
  - `postal_code` (text)
  - `channel` (text) - Sales channel
  - `tag` (text) - Auto: ใหม่/ประจำ/VIP based on order count
  - `order_count` (integer) - Auto-updated
  - `created_at` (timestamptz)

  ### 5. product_mappings
  Maps raw product names from Excel to promo product codes
  - `id` (uuid, primary key)
  - `raw_prod` (text, unique) - Original product name from Excel
  - `promo_code` (text) - Mapped to products_promo.code
  - `created_at` (timestamptz)

  ### 6. orders
  Order records with status pipeline
  - `id` (uuid, primary key)
  - `order_no` (text, unique)
  - `customer_id` (uuid, foreign key to customers)
  - `channel` (text) - Sales channel
  - `order_date` (date)
  - `raw_prod` (text) - Original product description
  - `promo_code` (text) - Mapped product code
  - `quantity` (integer)
  - `weight_g` (numeric)
  - `tracking_no` (text)
  - `total_amount` (numeric)
  - `payment_method` (text)
  - `payment_status` (text) - รอชำระเงิน/ชำระแล้ว
  - `order_status` (text) - Status pipeline
  - `route` (text) - A/B/C classification
  - `created_at` (timestamptz)

  ### 7. finance_income
  Income records (auto-populated from paid orders)
  - `id` (uuid, primary key)
  - `order_id` (uuid, foreign key to orders)
  - `amount` (numeric)
  - `income_date` (date)
  - `created_at` (timestamptz)

  ### 8. finance_expense
  Expense records (manual entry)
  - `id` (uuid, primary key)
  - `category` (text) - ค่าโฆษณา/ค่ากล่อง/ค่าส่ง etc.
  - `amount` (numeric)
  - `expense_date` (date)
  - `description` (text)
  - `created_at` (timestamptz)

  ### 9. employees
  Employee records
  - `id` (uuid, primary key)
  - `employee_code` (text, unique)
  - `name` (text)
  - `position` (text) - CEO/HR/บัญชี/etc.
  - `salary` (numeric)
  - `start_date` (date)
  - `status` (text) - active/inactive
  - `created_at` (timestamptz)

  ### 10. hr_documents
  HR documents (leave, OT, advance, etc.)
  - `id` (uuid, primary key)
  - `employee_id` (uuid, foreign key to employees)
  - `doc_type` (text) - ลา/โอที/เบิกล่วงหน้า/etc.
  - `amount` (numeric) - For financial documents
  - `doc_date` (date)
  - `description` (text)
  - `created_at` (timestamptz)

  ## Security
  - RLS enabled on all tables
  - Authenticated users can perform all operations (internal portal)
*/

-- Table 1: boxes
CREATE TABLE IF NOT EXISTS boxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  length_cm numeric NOT NULL,
  width_cm numeric NOT NULL,
  height_cm numeric NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE boxes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view boxes"
  ON boxes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert boxes"
  ON boxes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update boxes"
  ON boxes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete boxes"
  ON boxes FOR DELETE
  TO authenticated
  USING (true);

-- Insert default boxes
INSERT INTO boxes (name, length_cm, width_cm, height_cm) VALUES
  ('กล่อง00', 17, 13, 9),
  ('กล่อง0', 20, 16, 12),
  ('กล่อง1', 25, 20, 15),
  ('กล่อง2', 35, 25, 20),
  ('กล่อง3', 45, 35, 25)
ON CONFLICT (name) DO NOTHING;

-- Table 2: products_master
CREATE TABLE IF NOT EXISTS products_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  cost_thb numeric NOT NULL DEFAULT 0,
  weight_g numeric NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products_master ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view products_master"
  ON products_master FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products_master"
  ON products_master FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products_master"
  ON products_master FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products_master"
  ON products_master FOR DELETE
  TO authenticated
  USING (true);

-- Table 3: products_promo
CREATE TABLE IF NOT EXISTS products_promo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_id uuid REFERENCES products_master(id) ON DELETE RESTRICT NOT NULL,
  code text NOT NULL UNIQUE,
  short_name text NOT NULL,
  price_thb numeric NOT NULL DEFAULT 0,
  box_id uuid REFERENCES boxes(id),
  color text DEFAULT '',
  item_type text DEFAULT 'อื่นๆ',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE products_promo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view products_promo"
  ON products_promo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert products_promo"
  ON products_promo FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update products_promo"
  ON products_promo FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete products_promo"
  ON products_promo FOR DELETE
  TO authenticated
  USING (true);

-- Table 4: customers
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text DEFAULT '',
  facebook text DEFAULT '',
  address text DEFAULT '',
  subdistrict text DEFAULT '',
  district text DEFAULT '',
  province text DEFAULT '',
  postal_code text DEFAULT '',
  channel text DEFAULT '',
  tag text DEFAULT 'ใหม่',
  order_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (true);

-- Table 5: product_mappings
CREATE TABLE IF NOT EXISTS product_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_prod text NOT NULL UNIQUE,
  promo_code text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE product_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view product_mappings"
  ON product_mappings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert product_mappings"
  ON product_mappings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update product_mappings"
  ON product_mappings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete product_mappings"
  ON product_mappings FOR DELETE
  TO authenticated
  USING (true);

-- Table 6: orders
CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no text NOT NULL UNIQUE,
  customer_id uuid REFERENCES customers(id),
  channel text DEFAULT '',
  order_date date DEFAULT CURRENT_DATE,
  raw_prod text DEFAULT '',
  promo_code text DEFAULT '',
  quantity integer DEFAULT 1,
  weight_g numeric DEFAULT 0,
  tracking_no text DEFAULT '',
  total_amount numeric DEFAULT 0,
  payment_method text DEFAULT '',
  payment_status text DEFAULT 'รอชำระเงิน',
  order_status text DEFAULT 'รอชำระเงิน',
  route text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view orders"
  ON orders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete orders"
  ON orders FOR DELETE
  TO authenticated
  USING (true);

-- Table 7: finance_income
CREATE TABLE IF NOT EXISTS finance_income (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES orders(id),
  amount numeric NOT NULL DEFAULT 0,
  income_date date DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE finance_income ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view finance_income"
  ON finance_income FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert finance_income"
  ON finance_income FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update finance_income"
  ON finance_income FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete finance_income"
  ON finance_income FOR DELETE
  TO authenticated
  USING (true);

-- Table 8: finance_expense
CREATE TABLE IF NOT EXISTS finance_expense (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  expense_date date DEFAULT CURRENT_DATE,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE finance_expense ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view finance_expense"
  ON finance_expense FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert finance_expense"
  ON finance_expense FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update finance_expense"
  ON finance_expense FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete finance_expense"
  ON finance_expense FOR DELETE
  TO authenticated
  USING (true);

-- Table 9: employees
CREATE TABLE IF NOT EXISTS employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code text NOT NULL UNIQUE,
  name text NOT NULL,
  position text NOT NULL,
  salary numeric DEFAULT 0,
  start_date date DEFAULT CURRENT_DATE,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view employees"
  ON employees FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete employees"
  ON employees FOR DELETE
  TO authenticated
  USING (true);

-- Table 10: hr_documents
CREATE TABLE IF NOT EXISTS hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
  doc_type text NOT NULL,
  amount numeric DEFAULT 0,
  doc_date date DEFAULT CURRENT_DATE,
  description text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE hr_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view hr_documents"
  ON hr_documents FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert hr_documents"
  ON hr_documents FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update hr_documents"
  ON hr_documents FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete hr_documents"
  ON hr_documents FOR DELETE
  TO authenticated
  USING (true);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_products_promo_master_id ON products_promo(master_id);
CREATE INDEX IF NOT EXISTS idx_products_promo_code ON products_promo(code);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_no ON orders(order_no);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_product_mappings_raw_prod ON product_mappings(raw_prod);
CREATE INDEX IF NOT EXISTS idx_finance_income_order_id ON finance_income(order_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee_id ON hr_documents(employee_id);
