module.exports = {
  apps: [
    {
      name: "hub-worker-consumer",
      script: "dist/index.js",
      exec_mode: "fork",
      instances: 4,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        WORKER_ROLE: "consumer"
      }
    },
    {
      name: "hub-worker-recovery",
      script: "dist/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        WORKER_ROLE: "recovery"
      }
    },
    {
      name: "hub-worker-http",
      script: "dist/index.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        WORKER_ROLE: "http"
      }
    }
  ]
};
