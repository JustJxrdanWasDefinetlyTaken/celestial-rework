module.exports = {
  apps: [
    {
      name: "celestial-byod",
      script: "bun",
      args: "index.ts",
      cwd: __dirname,
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        CELESTIAL_BYOD_HOST: "0.0.0.0",
        CELESTIAL_BYOD_PORT: "5439",
      },
    },
  ],
};