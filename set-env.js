const fs = require('fs');
const path = require('path');

// Target file to modify
const envFilePath = path.join(__dirname, 'src', 'environments', 'environment.ts');

// Read the Vercel environment variable
const apiUrl = process.env.API_BASE_URL;

if (!apiUrl) {
  console.error('❌ Error: API_BASE_URL environment variable is not defined on Vercel!');
  process.exit(1);
}

console.log(`🚀 Injected backend API URL: ${apiUrl}`);

// The exact production environment file content we want to write
const envFileContent = `export const environment = {
  production: true,
  apiUrl: '${apiUrl}'
};
`;

// Overwrite the file completely
fs.writeFileSync(envFilePath, envFileContent, 'utf8');
console.log('✅ environment.ts file updated successfully.');
