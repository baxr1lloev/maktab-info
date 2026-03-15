import maktabData from '@/lib/maktab.json'

export type SchoolDirectoryRecord = {
  _uid_?: number | string
  inn: string
  viloyat: string
  tuman: string
  obekt_nomi: string
}

export type SchoolDirectoryOption = {
  school_uid: string
  inn: string
  viloyat: string
  tuman: string
  school_name: string
}

function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[ʻʼ`’]/g, "'")
    .trim()
    .toLowerCase()
}

const SCHOOL_DIRECTORY = maktabData as SchoolDirectoryRecord[]
const SCHOOL_BY_INN = new Map<string, SchoolDirectoryRecord>()
const SCHOOL_BY_UID = new Map<string, SchoolDirectoryRecord>()
const SCHOOL_UID_BY_RECORD = new Map<SchoolDirectoryRecord, string>()
const SCHOOLS_BY_VILOYAT = new Map<string, SchoolDirectoryRecord[]>()
const VILOYAT_KEY_TO_LABEL = new Map<string, string>()

function buildSchoolUid(school: SchoolDirectoryRecord, index: number): string {
  const rawUid = school._uid_
  if (typeof rawUid === 'number') return String(rawUid)
  if (typeof rawUid === 'string' && rawUid.trim().length > 0) return rawUid.trim()
  return `${school.inn.trim()}-${index}`
}

for (const [index, school] of SCHOOL_DIRECTORY.entries()) {
  const inn = school.inn?.trim()
  const viloyat = school.viloyat?.trim()
  if (!inn || !viloyat) continue

  const schoolUid = buildSchoolUid(school, index)
  SCHOOL_UID_BY_RECORD.set(school, schoolUid)
  if (!SCHOOL_BY_UID.has(schoolUid)) {
    SCHOOL_BY_UID.set(schoolUid, school)
  }

  if (!SCHOOL_BY_INN.has(inn)) {
    SCHOOL_BY_INN.set(inn, school)
  }

  const key = normalizeText(viloyat)
  if (!VILOYAT_KEY_TO_LABEL.has(key)) {
    VILOYAT_KEY_TO_LABEL.set(key, viloyat)
  }

  const normalizedViloyat = VILOYAT_KEY_TO_LABEL.get(key)!
  const bucket = SCHOOLS_BY_VILOYAT.get(normalizedViloyat)
  if (bucket) {
    bucket.push(school)
  } else {
    SCHOOLS_BY_VILOYAT.set(normalizedViloyat, [school])
  }
}

for (const [, schools] of SCHOOLS_BY_VILOYAT.entries()) {
  schools.sort((a, b) =>
    a.obekt_nomi.localeCompare(b.obekt_nomi, 'uz', { sensitivity: 'base' })
  )
}

const SORTED_VILOYATLAR = [...SCHOOLS_BY_VILOYAT.keys()].sort((a, b) =>
  a.localeCompare(b, 'uz', { sensitivity: 'base' })
)

export function listViloyatlar(): string[] {
  return SORTED_VILOYATLAR
}

export function listSchoolsByViloyat(viloyat: string): SchoolDirectoryOption[] {
  const key = normalizeText(viloyat)
  const normalizedViloyat = VILOYAT_KEY_TO_LABEL.get(key)
  if (!normalizedViloyat) return []

  const schools = SCHOOLS_BY_VILOYAT.get(normalizedViloyat) ?? []

  return schools.map((school, index) => ({
    school_uid: SCHOOL_UID_BY_RECORD.get(school) ?? buildSchoolUid(school, index),
    inn: school.inn,
    viloyat: school.viloyat,
    tuman: school.tuman,
    school_name: school.obekt_nomi,
  }))
}

export function findSchoolByUid(schoolUid: string): SchoolDirectoryRecord | null {
  const normalizedUid = schoolUid.trim()
  if (!normalizedUid) return null
  return SCHOOL_BY_UID.get(normalizedUid) ?? null
}

export function findSchoolByInn(inn: string): SchoolDirectoryRecord | null {
  const normalizedInn = inn.trim()
  if (!normalizedInn) return null
  return SCHOOL_BY_INN.get(normalizedInn) ?? null
}
