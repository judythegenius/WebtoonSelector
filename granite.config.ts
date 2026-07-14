import { defineConfig } from '@apps-in-toss/web-framework/config';

export default defineConfig({
  appName: 'webtoonselector',
  brand: {
    displayName: '웹툰 뭐 보지?', // 화면에 노출될 앱의 한글 이름으로 바꿔주세요.
    primaryColor: '#3182F6', // 화면에 노출될 앱의 기본 색상으로 바꿔주세요.
    icon: 'https://static.toss.im/appsintoss/47343/56fe3928-16a0-48ef-b54b-5f4e5dc9a261.png', // 화면에 노출될 앱의 아이콘 이미지 주소로 바꿔주세요.
  },
  web: {
    host: 'localhost',
    port: 5173,
    commands: {
      dev: 'tsx server.ts',
      build: 'vite build && esbuild server.ts --bundle --platform=node --outfile=dist/server.js --external:express',
    },
  },
  permissions: [],
  outdir: 'dist',
});
