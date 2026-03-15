import { NextRequest, NextResponse } from 'next/server'
import { listSchoolsByViloyat, listViloyatlar } from '@/lib/school-directory'

export async function GET(req: NextRequest) {
  const viloyat = req.nextUrl.searchParams.get('viloyat')?.trim()

  if (!viloyat) {
    return NextResponse.json({
      ok: true,
      source: 'lib/maktab.json',
      viloyatlar: listViloyatlar(),
    })
  }

  return NextResponse.json({
    ok: true,
    source: 'lib/maktab.json',
    viloyat,
    schools: listSchoolsByViloyat(viloyat),
  })
}

