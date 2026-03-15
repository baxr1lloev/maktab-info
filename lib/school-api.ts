import axios from 'axios'
import { findSchoolByInn } from '@/lib/school-directory'

const FIELD_MAP: Record<string, Record<string, string>> = {
  'Спортзал':          { sport_zal_holati: 'sport_zal_qisman_tamir' },
  'Столовая':          { oshhona_holati: 'oshhona_holati_qisman_tamir' },
  'Актовый зал':       { aktiv_zal_holati: 'aktiv_zal_qisman_tamir' },
  'Нет интернета':     { internetga_ulanish_turi: 'umuman_yuq' },
  'Нет электричества': { elektr_kun_davomida: 'elektr_yuq' },
  'Нет освещения':     { elektr_kun_davomida: 'elektr_qisman' },
}

export async function patchSchoolApi(inn: string, subcategory: string[]) {
  const normalizedInn = inn.trim()
  if (!normalizedInn) return

  if (!findSchoolByInn(normalizedInn)) {
    console.warn(`[school-api] INN ${normalizedInn} not found in local directory`)
  }

  const fields = subcategory.reduce((acc, sub) => {
    return { ...acc, ...(FIELD_MAP[sub] ?? {}) }
  }, {} as Record<string, string>)

  if (Object.keys(fields).length === 0) return

  await axios.patch(
    `${process.env.SCHOOL_API_URL}/${normalizedInn}`,
    { ...fields, updated: new Date().toISOString() },
    { headers: { Authorization: `Bearer ${process.env.SCHOOL_API_TOKEN}` } }
  )
}
