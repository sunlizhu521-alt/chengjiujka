module.exports = {
  apps: [{
    name: 'chengjiujka',
    script: 'server.js',
    env: {
      PORT: '4005',
      STORAGE_DIR: '/home/ubuntu/zhuge-ai-lab/chengjiujka',
      ALLOWED_ORIGIN: 'https://sunlizhu521-alt.github.io',
      ADMIN_PASSWORD: '521sunlizhu'
    }
  }]
};
