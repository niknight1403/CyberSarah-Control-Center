module.exports = {
  apps: [
    {
      name: "cybersarah-control-center",
      script: "./dist/index.js",
      cwd: __dirname,
      interpreter: "node",
      node_args: "-r dotenv/config",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      time: true,
      env: {
        DOTENV_CONFIG_PATH: "/opt/cybersarah-control-center/.env",
      },
      error_file: "./logs/pm2-error.log",
      out_file: "./logs/pm2-out.log",
      merge_logs: true,
    },
  ],
};
