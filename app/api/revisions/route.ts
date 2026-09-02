import { db } from '@/lib/database';
export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('revision');
    if (id) {
      if (!/^\d+$/.test(id))
        return Response.json({ error: 'Invalid revision' }, { status: 400 });
      const row = await db()
        .prepare('SELECT data FROM snapshots WHERE revision = ?')
        .bind(Number(id))
        .first<{ data: string }>();
      return row
        ? new Response(row.data, {
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-store',
            },
          })
        : Response.json({ error: 'Revision not found' }, { status: 404 });
    }
    const rows = await db()
      .prepare(
        'SELECT revision,version,date FROM snapshots ORDER BY revision DESC LIMIT 250',
      )
      .all();
    return Response.json(rows.results, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch {
    return Response.json(
      { error: 'Saved revisions are unavailable.' },
      { status: 503 },
    );
  }
}
