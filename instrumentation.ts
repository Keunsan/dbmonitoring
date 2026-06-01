/** Next.js 서버 시작 시 Collector 자동 수집 스케줄러를 초기화합니다. */



/**

 * Node.js 런타임에서만 Collector 스케줄러를 시작합니다.

 */

export const register = async () => {

  if (

    process.env.NEXT_RUNTIME !== "nodejs" ||

    process.env.NEXT_PHASE === "phase-production-build" ||

    process.env.npm_lifecycle_event === "build"

  ) {

    return;

  }



  const { startCollectorScheduler } = await import("@/services/collector");

  startCollectorScheduler();

};

