/** PM2 production configuration. Secrets must come from the host environment. */
module.exports = {
  apps: [{
    name: "cybersarah-control-center",
    script: "dist/index.js",
    instances: 1,
    exec_mode: "fork",
    autorestart: true,
    max_memory_restart: "350M",
    min_uptime: "10s",
    max_restarts: 10,
    restart_delay: 5000,
    env: {NODE_ENV: "production", PORT: process.env.PORT || "8000"},
  }],
};
