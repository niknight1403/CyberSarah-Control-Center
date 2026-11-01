export function buildDbDebugHealthResponse(healthy: boolean) {
  return {
    status: healthy ? 200 : 503,
    body: {
      ok: healthy,
      database: healthy ? ("connected" as const) : ("unavailable" as const),
    },
  };
}
