export function GET() {
  return Response.json({ok: true, service: 'pip-studio', time: new Date().toISOString()});
}
