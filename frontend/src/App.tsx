/** TO-BE 포털 골격 — R4 이전 연결·헬스 확인용 플레이스홀더입니다. */
import { useCallback, useEffect, useState } from "react";

type HealthPayload = {
  status?: string;
  service?: string;
  runtime?: string;
};

type ApiEnvelope<T> = {
  data: T | null;
  error: { code: string; message: string } | null;
};

export const App = () => {
  const [health, setHealth] = useState<ApiEnvelope<HealthPayload> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadHealth = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/v1/health");
      const json = (await res.json()) as ApiEnvelope<HealthPayload>;
      if (!res.ok || json.error) {
        setLoadError(json.error?.message ?? "헬스 API 응답을 처리하지 못했습니다.");
        setHealth(json);
        return;
      }
      setHealth(json);
    } catch {
      setLoadError("백엔드에 연결하지 못했습니다. backend(8000) 실행 여부를 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const id = window.setInterval(() => void loadHealth(), 60_000);
    return () => window.clearInterval(id);
  }, [loadHealth]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header>
        <p className="text-sm text-slate-400">dbmonitoring TO-BE (frontend/)</p>
        <h1 className="text-2xl font-semibold">통합 DB 관제 포털</h1>
        <p className="mt-2 text-slate-300">
          운영 UI는 Phase R4에서 이관합니다. 현재는 Next.js( AS-IS )와 병행 개발 중입니다.
        </p>
      </header>

      <section className="rounded-lg border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-lg font-medium">백엔드 연결 상태</h2>
        {loading && <p className="mt-4 text-slate-400">확인 중…</p>}
        {!loading && loadError && (
          <p className="mt-4 text-red-300" role="alert">
            {loadError}
          </p>
        )}
        {!loading && !loadError && health?.data && (
          <dl className="mt-4 grid gap-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-slate-400">status</dt>
              <dd>{health.data.status}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">service</dt>
              <dd>{health.data.service}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-slate-400">runtime</dt>
              <dd>{health.data.runtime}</dd>
            </div>
          </dl>
        )}
        <p className="mt-6 text-xs text-slate-500">
          AS-IS 앱: <a className="underline" href="http://localhost:3000">localhost:3000</a>
        </p>
      </section>
    </main>
  );
};

export default App;