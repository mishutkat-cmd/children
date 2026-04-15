// PM2 ecosystem config.
// Usage on the server:
//   pm2 start scripts/ecosystem.config.js
//   pm2 save                   # persist across reboots
//   pm2 startup                # follow printed command to enable on boot
//
// PM2 auto-restarts on crash, reboots, and memory limit breaches.

module.exports = {
  apps: [
    {
      name: 'children',
      cwd: './backend',
      script: 'server.js',
      // Auto-restart on crash
      autorestart: true,
      watch: false,
      max_restarts: 50,
      min_uptime: '30s',
      restart_delay: 2000,
      exp_backoff_restart_delay: 1000,
      // Restart if RSS exceeds 600MB (tune for your host)
      max_memory_restart: '600M',
      // Logs
      out_file: './backend/logs/pm2.out.log',
      error_file: './backend/logs/pm2.err.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Env
      env: {
        NODE_ENV: 'production',
        FRONTEND_ENABLED: 'true',
      },
    },
  ],
};
