const fs = require('fs');
const path = require('path');

// Target file to modify
const envFilePath = path.join(__dirname, 'src', 'environments', 'environment.ts');

// Unset (the normal case): the app calls /api on its own origin and vercel.json's rewrite forwards it to the
// API on Render. Same origin means no CORS preflight per request, and the service worker's /api/** data group
// can cache the responses. Set API_BASE_URL only to call an API directly on another origin instead.
const apiUrl = (process.env.API_BASE_URL ?? '').replace(/\/+$/, '');

console.log(
  apiUrl
    ? `🚀 Injected backend API URL: ${apiUrl}`
    : '🚀 No API_BASE_URL: calling /api on this origin (proxied to the API by vercel.json)',
);

// The exact production environment file content we want to write
const envFileContent = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

// Overwrite the file completely
fs.writeFileSync(envFilePath, envFileContent, 'utf8');
console.log('✅ environment.ts file updated successfully.');
