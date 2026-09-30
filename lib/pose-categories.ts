// Pose Guide categories. Pure data — imported by the tablet, the phone page,
// the admin and the API alike, so a category can't exist in one and not another.
// `search` is the default Pexels query used to seed the starter set.
export interface PoseCategory { key: string; label: string; search: string }

export const POSE_CATEGORIES: PoseCategory[] = [
  { key: 'solo-standing', label: 'Solo · Standing', search: 'standing fashion model pose studio' },
  { key: 'solo-seated',   label: 'Solo · Seated',   search: 'seated portrait pose chair studio' },
  { key: 'floor',         label: 'On the Floor',    search: 'model lying on floor pose studio' },
  { key: 'couples',       label: 'Couples',         search: 'couple photoshoot pose studio' },
  { key: 'groups',        label: 'Groups',          search: 'group photoshoot pose friends studio' },
  { key: 'fashion',       label: 'Fashion',         search: 'editorial fashion pose' },
  { key: 'movement',      label: 'Movement',        search: 'dancer movement pose studio' },
  { key: 'hands',         label: 'Hands & Details', search: 'hands pose portrait close up' },
  { key: 'props',         label: 'With Props',      search: 'model posing with chair prop studio' },
  { key: 'maternity',     label: 'Maternity',       search: 'maternity photoshoot pose' },
]

export const POSE_CATEGORY_KEYS = new Set(POSE_CATEGORIES.map(c => c.key))
export const poseCategoryLabel = (k: string) => POSE_CATEGORIES.find(c => c.key === k)?.label ?? k
