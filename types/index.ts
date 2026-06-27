export type SetName =
  | 'Set A'
  | 'Set B'
  | 'Set C'
  | 'Set D'
  | 'Concrete'
  | 'Vintage'
  | 'Cottage'
  | 'The Watering Hole'
  | 'Studio One'

export interface StudioSet {
  id: string
  name: SetName
  description: string
  rate_per_hour: number
  min_hours: number | null
  capacity: number
  features: string[]
  is_active: boolean
}

export interface Equipment {
  id: string
  name: string
  rate: number
  category: 'lighting' | 'modifier' | 'special_effects' | 'camera'
  is_available: boolean
}

export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  square_customer_id: string | null
  square_card_id: string | null
  created_at: string
}

export interface Booking {
  id: string
  customer_id: string
  set_id: string
  start_time: string
  end_time: string
  guest_count: number
  status: 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show'
  payment_status: 'unpaid' | 'paid' | 'partially_paid' | 'refunded'
  base_amount: number
  extras_amount: number
  total_amount: number
  square_payment_id: string | null
  square_card_on_file_id: string | null
  hold_amount: number
  hold_released: boolean
  source: 'website' | 'acuity' | 'peerspace' | 'manual'
  notes: string | null
  created_at: string
  customer?: Customer
  set?: StudioSet
  add_ons?: BookingAddOn[]
}

export interface BookingAddOn {
  id: string
  booking_id: string
  equipment_id: string
  quantity: number
  rate: number
  equipment?: Equipment
}

export interface TimeSlot {
  time: string
  hour: number
  sets: {
    [key in SetName]: 'available' | 'booked' | 'partial'
  }
}
