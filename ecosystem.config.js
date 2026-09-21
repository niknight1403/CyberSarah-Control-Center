module.exports = {
  apps: [
    {
      name: 'cybersarah-backend',
      script: './dist/index.js',
      env: {
        PORT: 3001,
        NODE_ENV: 'production'
      }
    }
  ]
};
