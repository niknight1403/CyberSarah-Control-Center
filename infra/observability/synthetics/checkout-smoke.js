import http from "k6/http";
import { check, sleep } from "k6";

const base = (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");

export const options = {
  vus: 2,
  iterations: 10,
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"],
  },
};

export default function () {
  const health = http.get(`${base}/api/health`, { tags: { flow: "health" } });
  check(health, {
    "health endpoint returns 200": (r) => r.status === 200,
    "health response is JSON": (r) => String(r.headers["Content-Type"] || "").includes("application/json"),
  });
  sleep(1);
}
